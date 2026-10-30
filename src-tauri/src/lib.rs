#[macro_use]
mod macros;
mod backup;
mod donations;
mod analytics;
mod debs;
mod http;
mod image_cache;
mod verify;

use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "linux")]
use std::fs::File;

#[derive(Serialize)]
struct InstalledApp {
    app_id: String,
    name: String,
    version: String,
    summary: Option<String>,
    developer: Option<String>,
    permissions: Option<Vec<String>>,
    installed_size: Option<u64>,
    // "flathub" para apps instaladas desde un remote registrado (flathub,
    // appcenter, etc), "github" para bundles .flatpak instalados localmente
    // (flatpak crea un remote efímero con sufijo "-origin" para éstos).
    source: String,
}

fn derive_install_source(origin: &str) -> String {
    if origin.ends_with("-origin") {
        "github".to_string()
    } else {
        "flathub".to_string()
    }
}

/// Parses `flatpak list --app --columns=application,version` (tab separated)
/// into an app_id -> installed version map. The first entry wins when an app is
/// installed twice (e.g. user and system). Apps without a version are kept with
/// an empty string so callers can tell "installed" from "not installed".
fn parse_installed_versions(stdout: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for line in stdout.lines() {
        let mut parts = line.split('\t');
        let app_id = parts.next().map(str::trim).unwrap_or("");
        if app_id.is_empty() {
            continue;
        }
        let version = parts.next().map(str::trim).unwrap_or("");
        map.entry(app_id.to_string())
            .or_insert_with(|| version.to_string());
    }
    map
}

#[cfg(test)]
mod installed_versions_tests {
    use super::parse_installed_versions;

    // Salida real de `flatpak list --app --columns=application,version`.
    const OUTPUT: &str = "ca.vlacroix.Tally\t1.0\n\
io.github.N3kosempai.klia-scaler-player\t1.0.0\n\
io.github.N3kosempai.klia-store\t2.15.1\n\
io.github.N3kosempai.klia-store\t2.15.0\n\
org.no.Version\t\n";

    #[test]
    fn maps_app_ids_to_versions() {
        let map = parse_installed_versions(OUTPUT);
        assert_eq!(
            map.get("io.github.N3kosempai.klia-scaler-player").map(String::as_str),
            Some("1.0.0")
        );
        assert_eq!(map.get("ca.vlacroix.Tally").map(String::as_str), Some("1.0"));
    }

    #[test]
    fn first_installation_wins_when_listed_twice() {
        let map = parse_installed_versions(OUTPUT);
        assert_eq!(
            map.get("io.github.N3kosempai.klia-store").map(String::as_str),
            Some("2.15.1")
        );
    }

    #[test]
    fn keeps_apps_without_version_and_skips_missing_ones() {
        let map = parse_installed_versions(OUTPUT);
        assert_eq!(map.get("org.no.Version").map(String::as_str), Some(""));
        assert!(!map.contains_key("io.github.N3kosempai.not-installed"));
    }
}

#[cfg(test)]
mod install_source_tests {
    use super::derive_install_source;

    // Líneas reales capturadas de `flatpak list --columns=...,origin` en un
    // sistema con apps instaladas tanto desde Flathub como desde bundles
    // .flatpak de GitHub releases (vía install_local_flatpak).
    const REAL_FLATPAK_LIST_OUTPUT: &str = "ca.vlacroix.Tally\tTally\t1.0\tCount anything\tuser,current\tca.vlacroix.Tally/x86_64/stable\t966.1 kB\tflathub
com.her01n.BatteryInfo\tBattery Info\t0.2\tShows informations about the system battery.\tuser,current\tcom.her01n.BatteryInfo/x86_64/stable\t66.8 MB\tbatteryinfo-origin
io.github.N3kosempai.hetairos-ai\tHetairos AI\t5.2.1\tYour AI Waifu Assistant with Voice and Animated Interactions\tuser,current\tio.github.N3kosempai.hetairos-ai/x86_64/master\t183.7 MB\thetairos-ai1-origin
io.github.N3kosempai.klia-store\tKlia Store\t2.11.4\tBrowse, install and manage your Flatpak applications\tuser,current\tio.github.N3kosempai.klia-store/x86_64/master\t13.8 MB\tklia-store1-origin
com.bitwarden.desktop\tBitwarden\t2026.8.0\tA secure and free password manager for all of your devices\tuser,current\tcom.bitwarden.desktop/x86_64/stable\t511.1 MB\tflathub";

    fn parse_origin(line: &str) -> &str {
        let parts: Vec<&str> = line.split('\t').collect();
        parts.get(7).map(|s| s.trim()).unwrap_or("")
    }

    #[test]
    fn flathub_remote_maps_to_flathub_source() {
        assert_eq!(derive_install_source("flathub"), "flathub");
        assert_eq!(derive_install_source("appcenter"), "flathub");
    }

    #[test]
    fn ephemeral_bundle_remote_maps_to_github_source() {
        assert_eq!(derive_install_source("klia-store1-origin"), "github");
        assert_eq!(derive_install_source("hetairos-ai1-origin"), "github");
        assert_eq!(derive_install_source("batteryinfo-origin"), "github");
        assert_eq!(derive_install_source("aviator-origin"), "github");
        assert_eq!(derive_install_source("podmandesktop1-origin"), "github");
    }

    #[test]
    fn end_to_end_against_real_flatpak_list_output() {
        let expected: &[(&str, &str)] = &[
            ("ca.vlacroix.Tally", "flathub"),
            ("com.her01n.BatteryInfo", "github"),
            ("io.github.N3kosempai.hetairos-ai", "github"),
            ("io.github.N3kosempai.klia-store", "github"),
            ("com.bitwarden.desktop", "flathub"),
        ];

        for (line, (app_id, expected_source)) in
            REAL_FLATPAK_LIST_OUTPUT.lines().zip(expected)
        {
            let parts: Vec<&str> = line.split('\t').collect();
            assert_eq!(parts[0], *app_id);
            let source = derive_install_source(parse_origin(line));
            assert_eq!(&source, expected_source, "mismatch for {app_id}");
        }
    }
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

// Helper function to build interactive flatpak PTY command with -y flag (automatic confirmation)
fn build_flatpak_interactive_cmd(is_flatpak: bool, app_id: &str) -> String {
    let base_cmd = format!("flatpak install -y --user flathub {}", app_id);
    if is_flatpak {
        format!(
            "LANG=C script -q /dev/null -c \"flatpak-spawn --host {}\"",
            base_cmd
        )
    } else {
        format!("LANG=C script -q /dev/null -c \"{}\"", base_cmd)
    }
}

// Helper function for dependency checking (with auto-yes responses)
fn build_flatpak_dependency_check_cmd(is_flatpak: bool, app_id: &str) -> String {
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

// Flatpak app/extension IDs follow reverse-DNS notation (e.g. org.mozilla.firefox).
// Validating against this before interpolating into a shell string closes the
// command-injection vector without needing to escape shell metacharacters.
static APP_ID_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"^[A-Za-z0-9][A-Za-z0-9_-]*(\.[A-Za-z0-9][A-Za-z0-9_-]*)+$").unwrap()
});

fn is_valid_app_id(app_id: &str) -> bool {
    APP_ID_REGEX.is_match(app_id)
}

fn is_running_in_flatpak() -> bool {
    std::env::var("FLATPAK_ID").is_ok()
}

/// Runs a flatpak subcommand via the Tauri shell plugin, transparently going
/// through flatpak-spawn when klia-store itself is sandboxed. Mirrors
/// `backup.rs::run_flatpak_async` for the simple "one shot, wait for full
/// output" case used by most read-only commands here.
async fn run_flatpak_async(
    app: &tauri::AppHandle,
    args: &[&str],
) -> Result<tauri_plugin_shell::process::Output, String> {
    let shell = app.shell();
    let output = if is_running_in_flatpak() {
        let mut full_args = vec!["--host", "flatpak"];
        full_args.extend_from_slice(args);
        shell.command("flatpak-spawn").args(&full_args).output()
    } else {
        shell.command("flatpak").args(args).output()
    }
    .await
    .map_err(|e| format!("Failed to execute flatpak: {}", e))?;

    Ok(output)
}

// User-supplied file paths (e.g. from a file picker) can contain shell
// metacharacters that aren't safe to interpolate into a `sh -c` string, and
// Rust's `{:?}` Debug formatting is NOT a shell escape. Instead of trying to
// escape the original path, copy the bundle to a temp file with a
// app-generated safe name and operate on that path in shell commands.
// User-supplied file paths (e.g. from a file picker) can contain shell
// metacharacters that aren't safe to interpolate into a `sh -c` string, and
// Rust's `{:?}` Debug formatting is NOT a shell escape. Rather than copying
// the bundle elsewhere (which breaks under the Flatpak sandbox — the host
// side of `flatpak-spawn --host` can't reliably see a separately-staged
// copy), quote the original path using standard POSIX single-quote escaping
// and operate on it in place.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

// Helper function to parse size string from flatpak list output
// Format examples: "715,3 MB", "1,2 GB", "16,9 MB", "2,5 kB"
fn parse_size_string(size_str: &str) -> Option<u64> {
    let parts: Vec<&str> = size_str.trim().split_whitespace().collect();
    if parts.len() != 2 {
        return None;
    }

    // Replace comma with dot for parsing (locale-specific decimal separator)
    let size_value = parts[0].replace(',', ".").parse::<f64>().ok()?;
    let unit = parts[1];

    let bytes = match unit {
        "B" | "bytes" => size_value as u64,
        "kB" | "KB" => (size_value * 1_000.0) as u64,
        "MB" => (size_value * 1_000_000.0) as u64,
        "GB" => (size_value * 1_000_000_000.0) as u64,
        "TB" => (size_value * 1_000_000_000_000.0) as u64,
        _ => return None,
    };

    Some(bytes)
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
async fn get_installed_flatpaks(
    app: tauri::AppHandle,
) -> Result<InstalledPackagesResponse, String> {
    // Get everything (apps + runtimes) with options column to distinguish
    // Note: flatpak list without --system or --user gets both
    // The 'options' column contains 'runtime' for runtimes/extensions and 'current' for apps
    // The 'size' column contains the installed size in bytes
    let output = run_flatpak_async(
        &app,
        &[
            "list",
            "--columns=application,name,version,description,options,ref,size,origin",
        ],
    )
    .await?;

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
        if parts.len() >= 8 {
            let app_id = parts[0].trim();
            let options = parts[4].trim();
            let ref_full = parts[5].trim();
            let size_str = parts[6].trim();
            let origin = parts[7].trim();

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
                // Parse size from the size column (format: "715,3 MB" or "1,2 GB")
                let installed_size = parse_size_string(size_str);

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
                    permissions: None, // Don't get permissions here, too slow
                    installed_size,
                    source: derive_install_source(origin),
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
    if !is_valid_app_id(&app_id) {
        return Err(format!("Invalid app id: {}", app_id));
    }
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
        let cmd_str = build_flatpak_dependency_check_cmd(is_flatpak, &app_id);
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
    let output = run_flatpak_async(
        &app,
        &[
            "remote-ls",
            "--updates",
            "--columns=application,version,branch",
        ],
    )
    .await?;

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

    // `flatpak run` blocks until the launched app exits; keep that wait off
    // the async workers.
    let output = tokio::task::spawn_blocking(move || {
        if is_flatpak {
            // Inside flatpak, use flatpak-spawn to execute on the host
            Command::new("flatpak-spawn")
                .args(["--host", "flatpak", "run", &app_id])
                .output()
        } else {
            // Outside flatpak, use flatpak directly
            Command::new("flatpak").args(["run", &app_id]).output()
        }
    })
    .await
    .map_err(|e| format!("Launch task failed: {}", e))?
    .map_err(|e| format!("Failed to launch app: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to launch app: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
async fn uninstall_flatpak(
    app: tauri::AppHandle,
    app_id: String,
    delete_data: Option<bool>,
) -> Result<(), String> {
    app.emit(
        "install-output",
        format!("Iniciando desinstalación de {}...", app_id),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // Without --delete-data flatpak keeps ~/.var/app/<id> after uninstalling.
    let mut uninstall_args = vec!["uninstall", "-y"];
    if delete_data.unwrap_or(false) {
        uninstall_args.push("--delete-data");
    }
    uninstall_args.push(&app_id);

    let (mut rx, _child) = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak"])
            .args(&uninstall_args)
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(&uninstall_args)
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
    let output = run_flatpak_async(
        &app,
        &[
            "remote-info",
            "--user",
            "--show-metadata",
            "flathub",
            &app_id,
        ],
    )
    .await?;

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
        let output = run_flatpak_async(
            &app,
            &["search", "--columns=application,name", &extension_point],
        )
        .await?;

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
    if !is_valid_app_id(&app_id) {
        return Err(format!("Invalid app id: {}", app_id));
    }
    debug_eprintln!(
        "[start_flatpak_interactive] Starting for app_id: {}",
        app_id
    );
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
    let cmd_str = build_flatpak_interactive_cmd(is_flatpak, &app_id);
    debug_eprintln!("[start_flatpak_interactive] Command: {}", cmd_str);

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

    debug_eprintln!("[start_flatpak_interactive] Process spawned successfully");

    // Store the process
    {
        let mut map = processes.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(app_id.clone(), PtyProcess { child, stdin });
        debug_eprintln!("[start_flatpak_interactive] Process stored in map");
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
                    debug_eprintln!("[start_flatpak_interactive] Error reading stdout: {}", e);
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

            let mut map = processes_clone.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(pty_process) = map.get_mut(&app_id_clone3) {
                match pty_process.child.try_wait() {
                    Ok(Some(status)) => {
                        debug_eprintln!(
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
                        debug_eprintln!("[start_flatpak_interactive] Error checking process: {}", e);
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

#[derive(serde::Serialize)]
struct LocalFlatpakInfo {
    app_id: String,
    name: String,
    branch: String,
    runtime: String,
    sdk: String,
    command: String,
    file_path: String,
    file_size_bytes: u64,
    permissions: LocalFlatpakPermissions,
    dependencies: Vec<LocalFlatpakDep>,
    already_installed: bool,
}

#[derive(serde::Serialize)]
struct LocalFlatpakPermissions {
    network: bool,
    ipc: bool,
    x11: bool,
    wayland: bool,
    pulseaudio: bool,
    dri: bool,
    filesystems: Vec<String>,
    session_bus: Vec<String>,
    system_bus: Vec<String>,
    devices: Vec<String>,
    sockets: Vec<String>,
}

#[derive(serde::Serialize)]
struct LocalFlatpakDep {
    id: String,
    size: String,
}

#[tauri::command]
async fn download_flatpak_release(github_repo: String, app_id: String) -> Result<String, String> {
    // Resolve latest release from GitHub API
    let api_url = format!("https://api.github.com/repos/{}/releases/latest", github_repo);

    let client = http::github_client();

    let release: serde_json::Value = {
        let text = client
            .get(&api_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch release info: {}", e))?
            .text()
            .await
            .map_err(|e| format!("Failed to read release response: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse release JSON: {}", e))?
    };

    // Find the first .flatpak asset
    let flatpak_url = release["assets"]
        .as_array()
        .and_then(|assets| {
            assets.iter().find(|a| {
                a["name"]
                    .as_str()
                    .map(|n| n.ends_with(".flatpak"))
                    .unwrap_or(false)
            })
        })
        .and_then(|a| a["browser_download_url"].as_str())
        .ok_or_else(|| format!("No .flatpak asset found in latest release of {}", github_repo))?
        .to_string();

    let filename = flatpak_url
        .split('/')
        .last()
        .filter(|s| !s.is_empty())
        .unwrap_or("app.flatpak");

    // Must be visible to the `flatpak` process spawned on the host via
    // `flatpak-spawn --host` in install_local_flatpak, not just inside
    // klia-store's own sandbox — see staging_base_dir's doc comment.
    let staging_dir = backup::staging_base_dir()?;
    fs::create_dir_all(&staging_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;
    let dest = staging_dir.join(filename);

    debug_eprintln!(
        "[download_flatpak_release] Downloading {} for {}",
        flatpak_url, app_id
    );

    let response = client
        .get(&flatpak_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), flatpak_url));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    fs::write(&dest, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    debug_eprintln!(
        "[download_flatpak_release] Saved {} ({} bytes)",
        filename,
        bytes.len()
    );

    dest.to_str()
        .map(String::from)
        .ok_or_else(|| "Invalid path".to_string())
}

#[derive(Serialize)]
struct GitHubUpdateInfo {
    app_id: String,
    latest_version: String,
    installed_version: String,
    has_update: bool,
    github_repo: String,
    /// Release description (markdown) of the latest release, if it has one.
    changelog: Option<String>,
}

/// Checks for updates for apps installed from GitHub releases (not Flathub).
/// Completely separate from get_available_updates which only handles Flathub remotes.
#[tauri::command]
async fn check_github_updates(
    app: tauri::AppHandle,
    // List of (app_id, github_repo) pairs to check, e.g. [["io.github.N3kosempai.klia-kompress", "N3koSempai/klia-kompress"]]
    apps: Vec<(String, String)>,
) -> Result<Vec<GitHubUpdateInfo>, String> {
    let client = http::github_client();

    // `flatpak info` has no option to print only the version, so list the
    // installed apps once and look each one up (same approach as backup.rs).
    let output = run_flatpak_async(&app, &["list", "--app", "--columns=application,version"]).await?;
    if !output.status.success() {
        return Err(format!(
            "Failed to list installed apps: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let installed_versions = parse_installed_versions(&String::from_utf8_lossy(&output.stdout));

    let mut results = Vec::new();

    for (app_id, github_repo) in apps {
        let installed_version = match installed_versions.get(&app_id) {
            Some(v) if !v.is_empty() => v.clone(),
            // Not installed (or no version to compare against), skip
            _ => continue,
        };

        // Get latest release tag from GitHub API
        let api_url = format!(
            "https://api.github.com/repos/{}/releases/latest",
            github_repo
        );

        let (latest_version, changelog) = match client.get(&api_url).send().await {
            Ok(resp) => match resp.text().await {
                Ok(text) => {
                    let json: serde_json::Value = serde_json::from_str(&text)
                        .unwrap_or(serde_json::Value::Null);
                    let version = json["tag_name"]
                        .as_str()
                        .map(|v| v.trim_start_matches('v').to_string())
                        .unwrap_or_default();
                    let body = json["body"]
                        .as_str()
                        .map(str::trim)
                        .filter(|b| !b.is_empty())
                        .map(String::from);
                    (version, body)
                }
                Err(_) => continue,
            },
            Err(_) => continue,
        };

        if latest_version.is_empty() {
            continue;
        }

        let has_update = latest_version != installed_version;

        results.push(GitHubUpdateInfo {
            app_id,
            latest_version,
            installed_version,
            has_update,
            github_repo,
            changelog,
        });
    }

    Ok(results)
}

#[tauri::command]
async fn inspect_local_flatpak(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<LocalFlatpakInfo, String> {
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // Get file size
    let file_size_bytes = fs::metadata(&file_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // The original file name/path is user-controlled (file picker) and unsafe
    // to interpolate into a shell string raw — quote it instead of copying
    // the bundle elsewhere (see shell_quote's doc comment for why).
    let quoted_path = shell_quote(&file_path);

    // Run flatpak install --no-deploy with echo n piped to stdin to get package info without installing
    let cmd_str = if is_flatpak {
        format!(
            "LANG=C echo n | flatpak-spawn --host flatpak install --no-deploy --user {} 2>&1",
            quoted_path
        )
    } else {
        format!(
            "LANG=C echo n | flatpak install --no-deploy --user {} 2>&1",
            quoted_path
        )
    };

    let shell = app.shell();
    let output = shell
        .command("sh")
        .args(["-c", &cmd_str])
        .output()
        .await
        .map_err(|e| format!("Failed to run flatpak: {}", e))?;

    let raw = String::from_utf8_lossy(&output.stdout).to_string();

    // Read the bundle once and reuse the decoded text for both the metadata
    // block and the branch lookup below, instead of reading the (potentially
    // multi-hundred-MB) file from disk twice.
    let bundle_text = fs::read(&file_path)
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_default();

    // The bundle embeds a plain-text [Application] block right after the "flatpak\0" magic
    let metadata_block = {
        // Find [Application] section
        bundle_text
            .find("[Application]")
            .map(|start| {
                let section = &bundle_text[start..];
                // Grab up to 2000 chars which is more than enough for the metadata ini
                section.chars().take(2000).collect::<String>()
            })
            .unwrap_or_default()
    };

    // Parse metadata fields
    let get_meta = |key: &str| -> String {
        metadata_block
            .lines()
            .find(|l| l.starts_with(&format!("{}=", key)))
            .and_then(|l| l.splitn(2, '=').nth(1))
            .unwrap_or("")
            .trim()
            .to_string()
    };

    let app_id = get_meta("name");
    let runtime_full = get_meta("runtime");
    let sdk_full = get_meta("sdk");
    let command = get_meta("command");

    // Parse branch from the ref line in the binary (app/id/arch/branch)
    let branch = bundle_text
        .lines()
        .find(|l| l.starts_with(&format!("app/{}/", app_id)))
        .and_then(|l| l.splitn(4, '/').nth(3))
        .unwrap_or("master")
        .trim_matches('\0')
        .to_string();

    // Parse context permissions from metadata
    let get_context_list = |section_key: &str| -> Vec<String> {
        metadata_block
            .lines()
            .find(|l| l.starts_with(&format!("{}=", section_key)))
            .and_then(|l| l.splitn(2, '=').nth(1))
            .map(|v| {
                v.split(';')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default()
    };

    let shared = get_context_list("shared");
    let sockets = get_context_list("sockets");
    let devices_list = get_context_list("devices");
    let filesystems = get_context_list("filesystems");

    // Parse session/system bus policies
    let parse_bus_policies = |section_header: &str| -> Vec<String> {
        let mut in_section = false;
        let mut policies = Vec::new();
        for line in metadata_block.lines() {
            if line.trim() == section_header {
                in_section = true;
                continue;
            }
            if in_section {
                if line.starts_with('[') {
                    break;
                }
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    policies.push(trimmed.to_string());
                }
            }
        }
        policies
    };

    let session_bus = parse_bus_policies("[Session Bus Policy]");
    let system_bus = parse_bus_policies("[System Bus Policy]");

    let permissions = LocalFlatpakPermissions {
        network: shared.contains(&"network".to_string()),
        ipc: shared.contains(&"ipc".to_string()),
        x11: sockets.contains(&"x11".to_string()),
        wayland: sockets.contains(&"wayland".to_string()),
        pulseaudio: sockets.contains(&"pulseaudio".to_string()),
        dri: devices_list.contains(&"dri".to_string()),
        filesystems,
        session_bus,
        system_bus,
        devices: devices_list,
        sockets,
    };

    // Parse dependencies from flatpak install --no-deploy output
    // Lines look like: "  1.  org.gnome.Platform  49  u  flathub  < 408 MB"
    let dependencies: Vec<LocalFlatpakDep> = raw
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            // Skip the app itself (marked with 'i' = install from bundle)
            if trimmed.is_empty() || trimmed.starts_with("io.github") && trimmed.contains(" i ") {
                return None;
            }
            // Dependency lines start with a number followed by dot
            let parts: Vec<&str> = trimmed.splitn(2, '.').collect();
            if parts.len() < 2 || parts[0].trim().parse::<u32>().is_err() {
                return None;
            }
            let rest = parts[1].trim();
            // Extract ID (first whitespace-delimited token)
            let mut tokens = rest.split_whitespace();
            let dep_id = tokens.next()?.to_string();
            // Skip app's own bundle entry (0 bytes, marked 'i')
            if rest.contains(" i ") && rest.contains("0 bytes") {
                return None;
            }
            // Find size: last token that looks like a size
            let rest_tokens: Vec<&str> = rest.split_whitespace().collect();
            let size = rest_tokens
                .windows(2)
                .rev()
                .find(|w| {
                    w[1] == "MB"
                        || w[1] == "GB"
                        || w[1] == "kB"
                        || w[1] == "bytes"
                })
                .map(|w| format!("{} {}", w[0].trim_start_matches('<').trim(), w[1]))
                .unwrap_or_else(|| "Unknown".to_string());

            Some(LocalFlatpakDep { id: dep_id, size })
        })
        .collect();

    // Check if already installed. app_id here comes from parsing the bundle's
    // own metadata block, not a raw shell string, so pass it as a separate
    // argument instead of interpolating it into a command string.
    let already_installed = if !app_id.is_empty() && is_valid_app_id(&app_id) {
        let result = if is_flatpak {
            shell
                .command("flatpak-spawn")
                .args(["--host", "flatpak", "info", &app_id])
                .output()
                .await
        } else {
            shell.command("flatpak").args(["info", &app_id]).output().await
        };
        result.map(|o| o.status.success()).unwrap_or(false)
    } else {
        false
    };

    let name = if app_id.is_empty() {
        std::path::Path::new(&file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string()
    } else {
        app_id.clone()
    };

    Ok(LocalFlatpakInfo {
        name,
        app_id,
        branch,
        runtime: runtime_full,
        sdk: sdk_full,
        command,
        file_path: file_path.clone(),
        file_size_bytes,
        permissions,
        dependencies,
        already_installed,
    })
}

#[tauri::command]
async fn install_local_flatpak(
    app: tauri::AppHandle,
    processes: State<'_, ProcessMap>,
    file_path: String,
) -> Result<(), String> {
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    // The original file name/path is user-controlled (file picker) and unsafe
    // to interpolate into a shell string raw — quote it instead of copying
    // the bundle elsewhere (see shell_quote's doc comment for why).
    let quoted_path = shell_quote(&file_path);

    let cmd_str = if is_flatpak {
        format!(
            "LANG=C script -q /dev/null -c \"flatpak-spawn --host flatpak install -y --user {}\"",
            quoted_path
        )
    } else {
        format!(
            "LANG=C script -q /dev/null -c \"flatpak install -y --user {}\"",
            quoted_path
        )
    };

    let process_key = format!("local::{}", file_path);

    // Guard against duplicate installs of the same file racing each other
    // (e.g. a double-click registered twice by the file manager): without
    // this, a second call would silently overwrite the first entry in the
    // map, orphaning the first process's cleanup thread.
    {
        let map = processes.lock().unwrap_or_else(|e| e.into_inner());
        if map.contains_key(&process_key) {
            return Err("An installation for this file is already in progress".to_string());
        }
    }

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

    {
        let mut map = processes.lock().unwrap_or_else(|e| e.into_inner());
        if map.contains_key(&process_key) {
            drop(map);
            return Err("An installation for this file is already in progress".to_string());
        }
        map.insert(process_key.clone(), PtyProcess { child, stdin });
    }

    let app_clone = app.clone();
    let key_clone = process_key.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0u8; 1024];
        let mut reader = stdout;
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buffer[..n]).to_string();
                    for line in chunk.split('\n') {
                        if !line.is_empty() {
                            let _ = app_clone.emit("pty-output", (key_clone.clone(), line.to_string()));
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    let app_clone2 = app.clone();
    let key_clone2 = process_key.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("pty-error", (key_clone2.clone(), line));
            }
        }
    });

    let app_clone3 = app.clone();
    let key_clone3 = process_key.clone();
    let processes_clone = processes.inner().clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let mut map = processes_clone.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(pty_process) = map.get_mut(&key_clone3) {
                match pty_process.child.try_wait() {
                    Ok(Some(_status)) => {
                        let _ = app_clone3.emit("pty-terminated", key_clone3.clone());
                        map.remove(&key_clone3);
                        break;
                    }
                    Ok(None) => {}
                    Err(_) => {
                        map.remove(&key_clone3);
                        break;
                    }
                }
            } else {
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
    debug_eprintln!(
        "[send_to_pty] Attempting to send '{}' to app_id: {}",
        input, app_id
    );
    let mut map = processes.lock().unwrap_or_else(|e| e.into_inner());

    if let Some(pty_process) = map.get_mut(&app_id) {
        debug_eprintln!("[send_to_pty] Process found, writing to stdin");
        pty_process
            .stdin
            .write_all(format!("{}\n", input).as_bytes())
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        pty_process
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        debug_eprintln!("[send_to_pty] Successfully sent input");
        Ok(())
    } else {
        debug_eprintln!(
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
    let mut map = processes.lock().unwrap_or_else(|e| e.into_inner());

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
    let mut map = processes.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(pty_process) = map.get_mut(&app_id) {
        match pty_process.child.try_wait() {
            Ok(Some(_)) => {
                map.remove(&app_id);
                Ok(false) // Process has exited
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
        .setup(|app| {
            // If the app was opened with a .flatpak or .flatpakref file as argument,
            // emit an event so the frontend can show the local install dialog.
            let args: Vec<String> = std::env::args().collect();
            if let Some(file_path) = args.get(1) {
                let fp = file_path.clone();
                if fp.ends_with(".flatpak") || fp.ends_with(".flatpakref") {
                    let handle = app.handle().clone();
                    // Delay slightly so the frontend has time to mount listeners
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        let _ = handle.emit("open-local-flatpak", fp);
                    });
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_first_launch,
            initialize_app,
            get_app_data_path,
            image_cache::get_cache_image_dir,
            image_cache::clear_old_cache,
            image_cache::download_and_cache_image,
            image_cache::get_cached_image_path,
            image_cache::get_cached_image_info,
            image_cache::check_file_exists,
            get_installed_flatpaks,
            debs::get_installed_debs,
            debs::cache_deb_icon,
            debs::uninstall_deb_package,
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
            download_flatpak_release,
            check_github_updates,
            inspect_local_flatpak,
            install_local_flatpak,
            send_to_pty,
            kill_pty_process,
            check_pty_process,
            analytics::get_system_analytics,
            analytics::get_app_permissions_batch,
            verify::verify_app_hash,
            donations::verify_btc_donation,
            donations::verify_usdt_eth_donation,
            backup::get_downloads_dir,
            backup::create_backup,
            backup::list_backups,
            backup::delete_backup,
            backup::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod helper_tests {
    use super::*;

    #[test]
    fn parses_flatpak_sizes_with_locale_separators() {
        assert_eq!(parse_size_string("715,3 MB"), Some(715_300_000));
        assert_eq!(parse_size_string("1.2 GB"), Some(1_200_000_000));
        assert_eq!(parse_size_string("2,5 kB"), Some(2_500));
        assert_eq!(parse_size_string("12 bytes"), Some(12));
        assert_eq!(parse_size_string("12 parsecs"), None);
        assert_eq!(parse_size_string("MB"), None);
    }

    #[test]
    fn extracts_developer_from_app_id() {
        assert_eq!(extract_developer("org.mozilla.firefox").as_deref(), Some("mozilla"));
        assert_eq!(
            extract_developer("io.github.N3kosempai.klia-store").as_deref(),
            Some("N3kosempai")
        );
        assert_eq!(extract_developer("noDots"), None);
    }

    #[test]
    fn shell_quote_neutralizes_single_quotes() {
        assert_eq!(shell_quote("a b"), "'a b'");
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn validates_app_ids() {
        assert!(is_valid_app_id("org.mozilla.firefox"));
        assert!(is_valid_app_id("io.github.N3kosempai.klia-store"));
        assert!(!is_valid_app_id("firefox"));
        assert!(!is_valid_app_id("org.mozilla.firefox; rm -rf ~"));
        assert!(!is_valid_app_id("org..firefox"));
    }

    #[test]
    fn validates_deb_package_names() {
        assert!(debs::is_valid_deb_package_name("libc6"));
        assert!(debs::is_valid_deb_package_name("g++-12"));
        assert!(!debs::is_valid_deb_package_name("-rf"));
        assert!(!debs::is_valid_deb_package_name("Foo"));
        assert!(!debs::is_valid_deb_package_name("a b"));
        assert!(!debs::is_valid_deb_package_name(""));
    }

    #[test]
    fn interactive_cmds_wrap_with_flatpak_spawn_when_sandboxed() {
        assert!(build_flatpak_interactive_cmd(true, "a.b.c").contains("flatpak-spawn --host"));
        assert!(!build_flatpak_interactive_cmd(false, "a.b.c").contains("flatpak-spawn"));
        assert!(build_flatpak_dependency_check_cmd(true, "a.b.c").contains("flatpak-spawn --host"));
    }
}
