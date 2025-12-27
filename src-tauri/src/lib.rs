use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_http::reqwest;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
struct InstalledApp {
    app_id: String,
    name: String,
    version: String,
    summary: Option<String>,
    developer: Option<String>,
}

#[derive(Serialize)]
struct InstalledExtension {
    extension_id: String,
    name: String,
    version: String,
    parent_app_id: String,
}

#[derive(Serialize)]
struct InstalledPackagesResponse {
    apps: Vec<InstalledApp>,
    runtimes: Vec<String>,
    extensions: Vec<InstalledExtension>,
}

// Persistent PTY process manager
struct PtyProcess {
    child: Child,
    stdin: ChildStdin,
}

type ProcessMap = Arc<Mutex<HashMap<String, PtyProcess>>>;

// Helper function to build interactive flatpak PTY command (no auto-responses)
fn build_flatpak_interactive_cmd(is_flatpak: bool, app_id: &str) -> String {
    let base_cmd = format!("flatpak install --user flathub {}", app_id);
    if is_flatpak {
        format!(
            "LANG=C script -q /dev/null -c \"flatpak-spawn --host {}\"",
            base_cmd
        )
    } else {
        format!("LANG=C script -q /dev/null -c \"{}\"", base_cmd)
    }
}

// Helper function to build flatpak command with optional flatpak-spawn wrapper (legacy - for backward compat)
fn build_flatpak_install_cmd(is_flatpak: bool, app_id: &str) -> String {
    let base_cmd = format!("flatpak install --user flathub {}", app_id);
    if is_flatpak {
        format!(
            "LANG=C printf \"y\\nn\\n\" | script -q /dev/null -c \"flatpak-spawn --host {}\"",
            base_cmd
        )
    } else {
        format!(
            "LANG=C printf \"y\\nn\\n\" | script -q /dev/null -c \"{}\"",
            base_cmd
        )
    }
}

// Helper function to extract developer name from app_id
// Takes the second-to-last segment (penultimate)
// Example: io.github.N3kosempai.klia-store -> N3kosempai
// Example: org.mozilla.firefox -> mozilla
// Example: com.her01n.BatteryInfo -> her01n
fn extract_developer(app_id: &str) -> Option<String> {
    let parts: Vec<&str> = app_id.split('.').collect();
    if parts.len() >= 2 {
        // Always take the penultimate (second from the end)
        Some(parts[parts.len() - 2].to_string())
    } else {
        None
    }
}

#[derive(Serialize)]
struct UpdateAvailable {
    app_id: String,
    new_version: String,
    branch: String,
}

#[derive(Serialize)]
struct Dependency {
    name: String,
    download_size: String,
    installed_size: String,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn install_flatpak(app: tauri::AppHandle, app_id: String) -> Result<(), String> {
    eprintln!("[install_flatpak] Starting for app_id: {}", app_id);
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
    let cmd_str = build_flatpak_interactive_cmd(is_flatpak, &app_id);
    eprintln!("[install_flatpak] Command: {}", cmd_str);

    let mut child = Command::new("sh")
        .args(["-c", &cmd_str])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    eprintln!("[install_flatpak] Process spawned successfully");

    // Send 'y' confirmation after a short delay
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let _ = stdin.write_all(b"y\n");
        let _ = stdin.flush();
        eprintln!("[install_flatpak] Sent 'y' confirmation");
    });

    // Read stdout in background thread - read byte by byte to capture \r updates
    // EXACTLY like start_flatpak_interactive
    let app_clone = app.clone();
    let app_id_clone = app_id.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0u8; 1024];
        let mut stdout_reader = stdout;

        loop {
            match stdout_reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    // Split by \n but preserve \r to allow frontend to handle line overwrites
                    for line in chunk.split('\n') {
                        if !line.is_empty() {
                            let _ = app_clone
                                .emit("pty-output", (app_id_clone.clone(), line.to_string()));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[install_flatpak] Error reading stdout: {}", e);
                    break;
                }
            }
        }
    });

    // Read stderr in background thread
    // EXACTLY like start_flatpak_interactive
    let app_clone2 = app.clone();
    let app_id_clone2 = app_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("pty-error", (app_id_clone2.clone(), line));
            }
        }
    });

    // Monitor process termination in background thread
    // EXACTLY like start_flatpak_interactive
    let app_clone3 = app.clone();
    let app_id_clone3 = app_id.clone();
    std::thread::spawn(move || {
        // Wait for the child process to complete
        let status = child.wait();
        eprintln!(
            "[install_flatpak] Process terminated with status: {:?}",
            status
        );
        // Emit termination event
        let _ = app_clone3.emit("pty-terminated", app_id_clone3);
    });

    Ok(())
}

#[tauri::command]
fn check_first_launch(app: tauri::AppHandle) -> Result<bool, String> {
    // Get app data directory (compatible with Flatpak)
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Path for config file
    let config_path = app_data_dir.join("appConf.json");

    // Check if app has been initialized before
    Ok(!config_path.exists())
}

#[tauri::command]
fn initialize_app(app: tauri::AppHandle) -> Result<(), String> {
    // Get app data directory (compatible with Flatpak)
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Create app data directory if it doesn't exist
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    // Create cacheImages directory
    let cache_images_dir = app_data_dir.join("cacheImages");
    fs::create_dir_all(&cache_images_dir)
        .map_err(|e| format!("Failed to create cacheImages directory: {}", e))?;

    // Path for config file
    let config_path = app_data_dir.join("appConf.json");

    // Create config file with JSON format
    let config_content = r#"{
  "initialized": true,
  "version": "1.0.0",
  "firstLaunchCompleted": true
}"#;

    fs::write(&config_path, config_content)
        .map_err(|e| format!("Failed to create config file: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_app_data_path(app: tauri::AppHandle, subpath: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let full_path = app_data_dir.join(subpath);
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_cache_image_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    Ok(cache_images_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn clear_old_cache(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    let index_path = cache_images_dir.join("index.json");

    if index_path.exists() {
        println!("[Cache] Old cache system detected (index.json found). Clearing...");
        if cache_images_dir.exists() {
            fs::remove_dir_all(&cache_images_dir)
                .map_err(|e| format!("Failed to clear old cache directory: {}", e))?;

            // Recreate the directory
            fs::create_dir_all(&cache_images_dir)
                .map_err(|e| format!("Failed to recreate cache directory: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn download_and_cache_image(
    app: tauri::AppHandle,
    app_id: String,
    image_url: String,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    fs::create_dir_all(&cache_images_dir)
        .map_err(|e| format!("Failed to create cacheImages directory: {}", e))?;

    // Determinar extensión desde la URL (consistente con check_cached_image_exists)
    let extension = if image_url.ends_with(".svg") || image_url.contains(".svg?") {
        "svg"
    } else if image_url.ends_with(".webp") || image_url.contains(".webp?") {
        "webp"
    } else if image_url.ends_with(".jpg")
        || image_url.ends_with(".jpeg")
        || image_url.contains(".jpg?")
        || image_url.contains(".jpeg?")
    {
        "jpg"
    } else {
        "png" // default
    };

    // Generar nombre de archivo único usando xxHash3
    // Si app_id no está vacío y es diferente de image_url, usarlo como key (caso de cacheKey)
    // Si no, usar image_url (caso normal)
    use xxhash_rust::xxh3::xxh3_64;
    let key_to_hash = if !app_id.is_empty() && app_id != image_url {
        app_id
    } else {
        image_url.clone()
    };

    let hash = xxh3_64(key_to_hash.as_bytes());
    let filename = format!("{:x}.{}", hash, extension);
    let file_path = cache_images_dir.join(&filename);

    // Si el archivo ya existe, no descargar de nuevo
    if file_path.exists() {
        return Ok(filename);
    }

    // Descargar la imagen
    let client = reqwest::Client::new();
    let response = client
        .get(&image_url)
        .send()
        .await
        .map_err(|e| format!("Error downloading image: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP Error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Error reading image bytes: {}", e))?;

    fs::write(&file_path, &bytes).map_err(|e| format!("Error saving image: {}", e))?;

    Ok(filename)
}

#[tauri::command]
fn get_cached_image_path(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let file_path = app_data_dir.join("cacheImages").join(filename);

    // Usar canonicalize para obtener la ruta absoluta normalizada
    let canonical_path = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.clone());

    Ok(canonical_path.to_string_lossy().to_string())
}

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn get_cached_image_filename(cache_key: String, image_url: String) -> String {
    use xxhash_rust::xxh3::xxh3_64;
    // Si hay cacheKey, usar eso; si no, usar imageUrl
    let key_to_hash = if !cache_key.is_empty() && cache_key != image_url {
        cache_key
    } else {
        image_url.clone()
    };

    let hash = xxh3_64(key_to_hash.as_bytes());

    // Determinar extensión basándose en la URL
    let extension = if image_url.ends_with(".svg") {
        "svg"
    } else if image_url.ends_with(".webp") {
        "webp"
    } else if image_url.ends_with(".jpg") || image_url.ends_with(".jpeg") {
        "jpg"
    } else {
        "png"
    };

    format!("{:x}.{}", hash, extension)
}

#[tauri::command]
fn check_cached_image_exists(
    app: tauri::AppHandle,
    cache_key: String,
    image_url: String,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");

    use xxhash_rust::xxh3::xxh3_64;

    // Si hay cacheKey, usar eso; si no, usar imageUrl
    let key_to_hash = if !cache_key.is_empty() && cache_key != image_url {
        cache_key
    } else {
        image_url.clone()
    };

    let hash = xxh3_64(key_to_hash.as_bytes());

    // Determinar extensión desde la URL (que siempre tiene la URL real de la imagen)
    let extension = if image_url.ends_with(".svg") || image_url.contains(".svg?") {
        "svg"
    } else if image_url.ends_with(".webp") || image_url.contains(".webp?") {
        "webp"
    } else if image_url.ends_with(".jpg")
        || image_url.ends_with(".jpeg")
        || image_url.contains(".jpg?")
        || image_url.contains(".jpeg?")
    {
        "jpg"
    } else {
        "png" // default
    };

    let filename = format!("{:x}.{}", hash, extension);
    let file_path = cache_images_dir.join(&filename);

    if file_path.exists() {
        Ok(filename)
    } else {
        Err("Image not found in cache".to_string())
    }
}

#[tauri::command]
async fn get_installed_flatpaks(
    app: tauri::AppHandle,
) -> Result<InstalledPackagesResponse, String> {
    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // Get everything (apps + runtimes) with options column to distinguish
    // Note: flatpak list without --system or --user gets both
    // The 'options' column contains 'runtime' for runtimes/extensions and 'current' for apps
    let output = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args([
                "--host",
                "flatpak",
                "list",
                "--columns=application,name,version,description,options,ref",
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args([
                "list",
                "--columns=application,name,version,description,options,ref",
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak: {}", e))?
    };

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Flatpak command failed: {}", error));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut apps: Vec<InstalledApp> = Vec::new();
    let mut runtimes: Vec<String> = Vec::new();
    let mut potential_extensions: Vec<(String, String, String, String)> = Vec::new(); // (app_id, name, version, ref)

    // First pass: collect apps and potential extensions
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 6 {
            let app_id = parts[0].trim();
            let options = parts[4].trim();
            let ref_full = parts[5].trim();

            // Distinguish apps from runtimes using the official 'options' column
            // Apps have 'current' in options (e.g., "user,current" or "system,current")
            // Runtimes/extensions have 'runtime' in options (e.g., "user,runtime" or "system,runtime")
            let is_runtime = options.contains("runtime");

            if is_runtime {
                // Check if it might be an app extension using blacklist approach
                // Exclude system/platform extensions, consider everything else as potential app extension
                let is_system_extension = app_id.contains("org.freedesktop.Platform.")
                    || app_id.contains("org.freedesktop.Sdk.")
                    || app_id.contains(".Platform.GL32")
                    || app_id.contains(".Platform.VAAPI")
                    || app_id.contains(".Platform.Compat.i386")
                    || app_id.contains(".Platform.codecs");

                let is_potential_app_extension = !is_system_extension;

                if is_potential_app_extension {
                    potential_extensions.push((
                        app_id.to_string(),
                        parts[1].trim().to_string(),
                        parts[2].trim().to_string(),
                        ref_full.to_string(),
                    ));
                } else {
                    // It's a platform/runtime/driver - store the ref
                    runtimes.push(ref_full.to_string());
                }
            } else {
                // It's an application
                apps.push(InstalledApp {
                    app_id: app_id.to_string(),
                    name: parts[1].trim().to_string(),
                    version: parts[2].trim().to_string(),
                    summary: if !parts[3].trim().is_empty() {
                        Some(parts[3].trim().to_string())
                    } else {
                        None
                    },
                    developer: extract_developer(app_id),
                });
            }
        }
    }

    // Second pass: match extensions to their parent apps
    let mut extensions: Vec<InstalledExtension> = Vec::new();
    for (ext_id, ext_name, ext_version, ext_ref) in potential_extensions {
        // Try to find parent app by checking if any installed app's ID is a prefix of this extension
        let mut matched = false;
        for app in &apps {
            if ext_id.starts_with(&app.app_id) && ext_id != app.app_id {
                extensions.push(InstalledExtension {
                    extension_id: ext_id.clone(),
                    name: ext_name.clone(),
                    version: ext_version.clone(),
                    parent_app_id: app.app_id.clone(),
                });
                matched = true;
                break;
            }
        }

        // If no match found, it's probably a platform extension, add to runtimes
        if !matched {
            runtimes.push(ext_ref);
        }
    }

    Ok(InstalledPackagesResponse {
        apps,
        runtimes,
        extensions,
    })
}

#[tauri::command]
async fn get_install_dependencies(
    app: tauri::AppHandle,
    app_id: String,
) -> Result<Vec<Dependency>, String> {
    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // First phase: Quick check with echo n (flatpak doesn't wait for input, just aborts)
    let output = if is_flatpak {
        shell
            .command("sh")
            .args([
                "-c",
                &format!(
                    "LANG=C echo n | flatpak-spawn --host flatpak install --user flathub {}",
                    app_id
                ),
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        shell
            .command("sh")
            .args([
                "-c",
                &format!("LANG=C echo n | flatpak install --user flathub {}", app_id),
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak: {}", e))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_first = format!("{}\n{}", stdout, stderr);

    // Check if we got "Required runtime" message
    let needs_runtime = combined_first.contains("Required runtime for");

    // Second phase: If runtime is required, use controlled process with script
    let (stdout, stderr) = if needs_runtime {
        let cmd_str = build_flatpak_install_cmd(is_flatpak, &app_id);
        let (cmd, args) = ("sh", vec!["-c", &cmd_str]);

        let mut child = Command::new(cmd)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        // Read stdout and stderr looking for the dependency list
        use std::sync::{Arc, Mutex};
        let output_lines = Arc::new(Mutex::new(Vec::<String>::new()));
        let error_lines = Arc::new(Mutex::new(Vec::<String>::new()));
        let found_list = Arc::new(Mutex::new(false));

        // Clone for threads
        let error_clone_err = Arc::clone(&error_lines);
        let output_clone_out = Arc::clone(&output_lines);
        let found_clone_out = Arc::clone(&found_list);

        // Read stderr in thread
        let stderr_handle = child.stderr.take().ok_or("Failed to get stderr")?;
        let stderr_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stderr_handle);
            for line in reader.lines() {
                if let Ok(line) = line {
                    error_clone_err.lock().unwrap().push(line);
                }
            }
        });

        // Read stdout in thread to avoid blocking on prompts without newlines
        let stdout_handle = child.stdout.take().ok_or("Failed to get stdout")?;
        let stdout_thread = std::thread::spawn(move || {
            let reader = BufReader::new(stdout_handle);
            let mut line_count_in_list = 0;

            for line in reader.lines() {
                if let Ok(line) = line {
                    output_clone_out.lock().unwrap().push(line.clone());

                    // Detect numbered dependency list entries
                    let trimmed = line.trim();
                    if trimmed.starts_with(|c: char| c.is_ascii_digit()) && trimmed.contains('.') {
                        line_count_in_list += 1;
                    }

                    // Once we've seen at least 1 list entry, we have the data we need
                    if line_count_in_list >= 1 {
                        *found_clone_out.lock().unwrap() = true;
                    }
                }
            }
        });

        // Wait with timeout for the list to be found or process to exit
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(7);
        while start.elapsed() < timeout {
            if *found_list.lock().unwrap() {
                // Give it a short time to finish printing the whole list
                std::thread::sleep(std::time::Duration::from_millis(500));
                break;
            }
            // Check if process exited on its own
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        // Kill the process if still running - we have what we need or timed out
        let _ = child.kill();
        let _ = stdout_thread.join();
        let _ = stderr_thread.join();

        let out = output_lines.lock().unwrap().join("\n");
        let err = error_lines.lock().unwrap().join("\n");

        (out, err)
    } else {
        // No runtime needed, use the first phase output
        (stdout.to_string(), stderr.to_string())
    };

    // Flatpak outputs dependency info to both stdout and stderr
    let combined_output = format!("{}\n{}", stdout, stderr);

    let mut dependencies = Vec::new();
    let mut app_main: Option<Dependency> = None;
    let mut required_runtime: Option<String> = None;

    for line in combined_output.lines() {
        let trimmed = line.trim();

        // Skip empty lines
        if trimmed.is_empty() {
            continue;
        }

        // Look for "Required runtime" format (when app isn't already downloaded)
        // Format: "Required runtime for moe.clover.mm3d/x86_64/stable (runtime/org.kde.Platform/x86_64/5.15-23.08) found in remote flathub"
        if line.contains("Required runtime for") {
            if let Some(runtime_part) = line.split("(runtime/").nth(1) {
                if let Some(runtime_name) = runtime_part.split(')').next() {
                    required_runtime = Some(runtime_name.to_string());
                }
            }
        }

        // Look for lines that start with a number followed by a dot
        // Format can be tabs or multiple spaces (especially when using 'script')
        if let Some(rest) = trimmed.strip_prefix(|c: char| c.is_ascii_digit()) {
            if rest.starts_with('.') {
                // Normalize line: replace non-breaking spaces and tabs with regular spaces
                let normalized = line.replace('\u{a0}', " ").replace('\t', " ");

                // Split by multiple spaces and filter out empty parts
                let parts: Vec<&str> = normalized.split(' ').filter(|s| !s.is_empty()).collect();

                // A valid dependency line usually has: index, ID, branch, op, remote, size
                // Example: ["1.", "org.kde.Platform", "5.15-23.08", "i", "flathub", "<", "346,1", "MB"]
                if parts.len() >= 5 {
                    let name = parts[1].trim().to_string();

                    // The size is usually at the end. We join the last few parts if they look like a size.
                    // e.g., ["<", "346,1", "MB"] or ["2,2", "MB"]
                    let mut size_parts = Vec::new();
                    let mut found_size_start = false;

                    for i in 4..parts.len() {
                        let p = parts[i];
                        if p == "<"
                            || p.chars().next().unwrap_or(' ').is_ascii_digit()
                            || p == "MB"
                            || p == "GB"
                            || p == "kB"
                            || p == "B"
                        {
                            found_size_start = true;
                            size_parts.push(p);
                        } else if found_size_start {
                            // If we already started finding size parts and find something else, stop
                            break;
                        }
                    }

                    let size_raw = size_parts.join(" ");
                    let size_clean = size_raw
                        .replace("<", "")
                        .replace("(parcial)", "")
                        .replace("(partial)", "")
                        .trim()
                        .to_string();

                    if !name.is_empty() && !size_clean.is_empty() {
                        let dep = Dependency {
                            name: name.clone(),
                            download_size: size_clean.clone(),
                            installed_size: size_clean,
                        };

                        if name == app_id {
                            app_main = Some(dep);
                        } else {
                            dependencies.push(dep);
                        }
                    }
                }
            }
        }
    }

    // If we found a required runtime but no detailed list, create a fallback entry
    if app_main.is_none() && required_runtime.is_some() {
        // Add the app itself with unknown size
        app_main = Some(Dependency {
            name: app_id.clone(),
            download_size: "Unknown".to_string(),
            installed_size: "Unknown".to_string(),
        });

        // Add the runtime as a dependency
        if let Some(runtime) = required_runtime {
            dependencies.push(Dependency {
                name: runtime,
                download_size: "Unknown".to_string(),
                installed_size: "Unknown".to_string(),
            });
        }
    }

    // Put app main as first element, then dependencies
    let mut result = Vec::new();
    if let Some(main_app) = app_main {
        result.push(main_app);
    }
    result.extend(dependencies);

    Ok(result)
}

#[tauri::command]
async fn get_available_updates(app: tauri::AppHandle) -> Result<Vec<UpdateAvailable>, String> {
    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let output = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args([
                "--host",
                "flatpak",
                "remote-ls",
                "--updates",
                "--columns=application,version,branch",
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args([
                "remote-ls",
                "--updates",
                "--columns=application,version,branch",
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak: {}", e))?
    };

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Flatpak command failed: {}", error));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let updates: Vec<UpdateAvailable> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                Some(UpdateAvailable {
                    app_id: parts[0].trim().to_string(),
                    new_version: parts[1].trim().to_string(),
                    branch: parts[2].trim().to_string(),
                })
            } else if parts.len() >= 2 {
                // Sometimes version might be empty, branch in position 2
                Some(UpdateAvailable {
                    app_id: parts[0].trim().to_string(),
                    new_version: String::new(),
                    branch: parts.get(1).unwrap_or(&"stable").trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(updates)
}

#[tauri::command]
async fn update_flatpak(app: tauri::AppHandle, app_id: String) -> Result<(), String> {
    app.emit(
        "install-output",
        format!("Iniciando actualización de {}...", app_id),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "update", "-y", &app_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["update", "-y", &app_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Read output in real-time
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                // Flatpak sends progress output to stderr
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                app.emit("install-error", err)
                    .map_err(|e| format!("Failed to emit error: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                app.emit("install-completed", payload.code.unwrap_or(-1))
                    .map_err(|e| format!("Failed to emit completion: {}", e))?;
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn update_system_flatpaks(app: tauri::AppHandle) -> Result<(), String> {
    app.emit(
        "install-output",
        "Iniciando actualización de paquetes del sistema...",
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "update", "-y"])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["update", "-y"])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Read output in real-time
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                // Flatpak sends progress output to stderr
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                app.emit("install-error", err)
                    .map_err(|e| format!("Failed to emit error: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                app.emit("install-completed", payload.code.unwrap_or(-1))
                    .map_err(|e| format!("Failed to emit completion: {}", e))?;
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn launch_flatpak(app_id: String) -> Result<(), String> {
    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let output = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        Command::new("flatpak-spawn")
            .args(["--host", "flatpak", "run", &app_id])
            .output()
            .map_err(|e| format!("Failed to launch app: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        Command::new("flatpak")
            .args(["run", &app_id])
            .output()
            .map_err(|e| format!("Failed to launch app: {}", e))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to launch app: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
async fn uninstall_flatpak(app: tauri::AppHandle, app_id: String) -> Result<(), String> {
    app.emit(
        "install-output",
        format!("Iniciando desinstalación de {}...", app_id),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "uninstall", "-y", &app_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["uninstall", "-y", &app_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Read output in real-time
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                // Flatpak sends progress output to stderr
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                app.emit("install-error", err)
                    .map_err(|e| format!("Failed to emit error: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                app.emit("install-completed", payload.code.unwrap_or(-1))
                    .map_err(|e| format!("Failed to emit completion: {}", e))?;
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn get_app_remote_metadata(app: tauri::AppHandle, app_id: String) -> Result<String, String> {
    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let output = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args([
                "--host",
                "flatpak",
                "remote-info",
                "--user",
                "--show-metadata",
                "flathub",
                &app_id,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args([
                "remote-info",
                "--user",
                "--show-metadata",
                "flathub",
                &app_id,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak: {}", e))?
    };

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Flatpak command failed: {}", error));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.to_string())
}

#[derive(serde::Serialize)]
struct InstallableExtension {
    extension_id: String,
    name: String,
    version: String,
}

#[tauri::command]
async fn get_installable_extensions(
    app: tauri::AppHandle,
    app_id: String,
) -> Result<Vec<InstallableExtension>, String> {
    let shell = app.shell();
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // First, get the metadata to find extension points
    let metadata = get_app_remote_metadata(app.clone(), app_id.clone()).await?;

    // Parse extension points from metadata
    let mut extension_points = Vec::new();
    for line in metadata.lines() {
        if let Some(captures) = line
            .strip_prefix("[Extension ")
            .and_then(|s| s.strip_suffix("]"))
        {
            let extension_point = captures.trim().to_string();

            // Use a blacklist approach: exclude system/platform extensions
            // Only accept extensions that belong to this app's domain
            let belongs_to_app = extension_point.starts_with(&app_id);

            // Check if it's a system extension by looking at the first segment after app_id
            // Example: io.github.peazip.PeaZip.Debug -> first segment is "Debug" (exclude)
            // Example: io.github.peazip.PeaZip.Addon.i386 -> first segment is "Addon" (allow)
            let is_system_extension = if belongs_to_app && extension_point.len() > app_id.len() {
                let suffix = &extension_point[app_id.len()..];
                // Get the first segment after app_id (e.g., ".Debug" or ".Addon")
                let first_segment = suffix.split('.').nth(1).unwrap_or("");

                first_segment == "Debug" || first_segment == "Locale" || first_segment == "Help"
            } else {
                // Platform extensions from freedesktop
                extension_point.contains("org.freedesktop.Platform.")
                    || extension_point.contains("org.freedesktop.Sdk.")
            };

            if belongs_to_app && !is_system_extension {
                extension_points.push(extension_point);
            }
        }
    }

    // Now search flathub for packages that match these extension points
    let mut installable_extensions = Vec::new();

    for extension_point in extension_points {
        // Use flatpak search to find extensions matching the extension point
        // Note: flatpak search doesn't return version info, only application and name
        let output = if is_flatpak {
            shell
                .command("flatpak-spawn")
                .args([
                    "--host",
                    "flatpak",
                    "search",
                    "--columns=application,name",
                    &extension_point,
                ])
                .output()
                .await
                .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
        } else {
            shell
                .command("flatpak")
                .args(["search", "--columns=application,name", &extension_point])
                .output()
                .await
                .map_err(|e| format!("Failed to execute flatpak: {}", e))?
        };

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            // Find packages that start with the extension point ID
            for line in stdout.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 2 {
                    let pkg_id = parts[0].trim();
                    let pkg_name = parts[1].trim();
                    // flatpak search doesn't return version, use empty string
                    let pkg_version = "";

                    // Check if this package is an extension for this extension point
                    // It can be exactly equal to the extension point or start with it
                    if pkg_id.starts_with(&extension_point) {
                        // Accept if it's exactly the extension point OR if it has additional components
                        let is_valid = pkg_id == extension_point
                            || (pkg_id.len() > extension_point.len()
                                && pkg_id.chars().nth(extension_point.len()) == Some('.'));

                        if is_valid {
                            installable_extensions.push(InstallableExtension {
                                extension_id: pkg_id.to_string(),
                                name: pkg_name.to_string(),
                                version: pkg_version.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(installable_extensions)
}

#[tauri::command]
async fn install_extension(app: tauri::AppHandle, extension_id: String) -> Result<(), String> {
    app.emit(
        "install-output",
        format!("Installing extension {}...", extension_id),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args([
                "--host",
                "flatpak",
                "install",
                "-y",
                "--user",
                "flathub",
                &extension_id,
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["install", "-y", "--user", "flathub", &extension_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Read output in real-time
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                app.emit("install-error", err)
                    .map_err(|e| format!("Failed to emit error: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                app.emit("install-completed", payload.code.unwrap_or(-1))
                    .map_err(|e| format!("Failed to emit completion: {}", e))?;
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

#[tauri::command]
async fn uninstall_extension(app: tauri::AppHandle, extension_id: String) -> Result<(), String> {
    app.emit(
        "install-output",
        format!("Uninstalling extension {}...", extension_id),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "uninstall", "-y", &extension_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["uninstall", "-y", &extension_id])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Read output in real-time
    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let output = String::from_utf8_lossy(&line);
                app.emit("install-output", output.to_string())
                    .map_err(|e| format!("Failed to emit event: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                app.emit("install-error", err)
                    .map_err(|e| format!("Failed to emit error: {}", e))?;
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                app.emit("install-completed", payload.code.unwrap_or(-1))
                    .map_err(|e| format!("Failed to emit completion: {}", e))?;
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

// Start an interactive PTY process for flatpak install (check dependencies + optional install)
#[tauri::command]
async fn start_flatpak_interactive(
    app: tauri::AppHandle,
    processes: State<'_, ProcessMap>,
    app_id: String,
) -> Result<(), String> {
    eprintln!(
        "[start_flatpak_interactive] Starting for app_id: {}",
        app_id
    );
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
    let cmd_str = build_flatpak_interactive_cmd(is_flatpak, &app_id);
    eprintln!("[start_flatpak_interactive] Command: {}", cmd_str);

    let mut child = Command::new("sh")
        .args(["-c", &cmd_str])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    eprintln!("[start_flatpak_interactive] Process spawned successfully");

    // Store the process
    {
        let mut map = processes.lock().unwrap();
        map.insert(app_id.clone(), PtyProcess { child, stdin });
        eprintln!("[start_flatpak_interactive] Process stored in map");
    }

    // Read stdout in background thread - read byte by byte to capture \r updates
    let app_clone = app.clone();
    let app_id_clone = app_id.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0u8; 1024];
        let mut stdout_reader = stdout;

        loop {
            match stdout_reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    // Split by \n but preserve \r to allow frontend to handle line overwrites
                    for line in chunk.split('\n') {
                        if !line.is_empty() {
                            let _ = app_clone
                                .emit("pty-output", (app_id_clone.clone(), line.to_string()));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[start_flatpak_interactive] Error reading stdout: {}", e);
                    break;
                }
            }
        }
    });

    // Read stderr in background thread
    let app_clone2 = app.clone();
    let app_id_clone2 = app_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("pty-error", (app_id_clone2.clone(), line));
            }
        }
    });

    // Monitor process termination in background thread
    let app_clone3 = app.clone();
    let app_id_clone3 = app_id.clone();
    let processes_clone = processes.inner().clone();
    std::thread::spawn(move || {
        // Poll the process status every 500ms
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));

            let mut map = processes_clone.lock().unwrap();
            if let Some(pty_process) = map.get_mut(&app_id_clone3) {
                match pty_process.child.try_wait() {
                    Ok(Some(status)) => {
                        eprintln!(
                            "[start_flatpak_interactive] Process terminated with status: {:?}",
                            status
                        );
                        // Process has exited, emit event and remove from map
                        let _ = app_clone3.emit("pty-terminated", app_id_clone3.clone());
                        map.remove(&app_id_clone3);
                        break;
                    }
                    Ok(None) => {
                        // Still running, continue
                    }
                    Err(e) => {
                        eprintln!("[start_flatpak_interactive] Error checking process: {}", e);
                        map.remove(&app_id_clone3);
                        break;
                    }
                }
            } else {
                // Process was removed externally
                break;
            }
        }
    });

    Ok(())
}

// Send input to a running PTY process
#[tauri::command]
async fn send_to_pty(
    processes: State<'_, ProcessMap>,
    app_id: String,
    input: String,
) -> Result<(), String> {
    eprintln!(
        "[send_to_pty] Attempting to send '{}' to app_id: {}",
        input, app_id
    );
    let mut map = processes.lock().unwrap();

    if let Some(pty_process) = map.get_mut(&app_id) {
        eprintln!("[send_to_pty] Process found, writing to stdin");
        pty_process
            .stdin
            .write_all(format!("{}\n", input).as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        pty_process
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        eprintln!("[send_to_pty] Successfully sent input");
        Ok(())
    } else {
        eprintln!(
            "[send_to_pty] ERROR: No process found for app_id: {}",
            app_id
        );
        Err(format!("No process found for app_id: {}", app_id))
    }
}

// Kill a PTY process
#[tauri::command]
async fn kill_pty_process(
    app: tauri::AppHandle,
    processes: State<'_, ProcessMap>,
    app_id: String,
) -> Result<(), String> {
    let mut map = processes.lock().unwrap();

    if let Some(mut pty_process) = map.remove(&app_id) {
        let _ = pty_process.child.kill();
        let _ = pty_process.child.wait();
        let _ = app.emit("pty-terminated", app_id);
        Ok(())
    } else {
        Err(format!("No process found for app_id: {}", app_id))
    }
}

// Check if PTY process is still running
#[tauri::command]
async fn check_pty_process(
    processes: State<'_, ProcessMap>,
    app_id: String,
) -> Result<bool, String> {
    let mut map = processes.lock().unwrap();

    if let Some(pty_process) = map.get_mut(&app_id) {
        match pty_process.child.try_wait() {
            Ok(Some(_)) => {
                // Process has exited, remove it
                map.remove(&app_id);
                Ok(false)
            }
            Ok(None) => Ok(true), // Still running
            Err(_) => {
                map.remove(&app_id);
                Ok(false)
            }
        }
    } else {
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProcessMap::default())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            install_flatpak,
            check_first_launch,
            initialize_app,
            get_app_data_path,
            get_cache_image_dir,
            clear_old_cache,
            download_and_cache_image,
            get_cached_image_path,
            get_cached_image_filename,
            check_cached_image_exists,
            check_file_exists,
            get_installed_flatpaks,
            get_install_dependencies,
            get_app_remote_metadata,
            get_installable_extensions,
            get_available_updates,
            update_flatpak,
            update_system_flatpaks,
            launch_flatpak,
            uninstall_flatpak,
            install_extension,
            uninstall_extension,
            start_flatpak_interactive,
            send_to_pty,
            kill_pty_process,
            check_pty_process
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
