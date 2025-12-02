use std::fs;
use serde::Serialize;
use tauri::{Emitter, Manager};
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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn download_flatpakref(app: tauri::AppHandle, app_id: String) -> Result<String, String> {
    let url = format!(
        "https://dl.flathub.org/repo/appstream/{}.flatpakref",
        app_id
    );

    app.emit(
        "install-output",
        format!("Descargando referencia desde {}", url),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error descargando flatpakref: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Error HTTP: {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Error leyendo contenido: {}", e))?;

    // Obtener el directorio de datos de la app
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Crear carpeta temp dentro del directorio de la app
    let temp_dir = app_data_dir.join("temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let flatpakref_path = temp_dir.join(format!("{}.flatpakref", app_id));

    fs::write(&flatpakref_path, &content).map_err(|e| format!("Error guardando archivo: {}", e))?;

    app.emit(
        "install-output",
        format!("✓ Referencia descargada: {:?}", flatpakref_path),
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    Ok(flatpakref_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn install_flatpak(app: tauri::AppHandle, app_id: String) -> Result<(), String> {
    // Paso 1: Descargar el flatpakref
    let flatpakref_path = download_flatpakref(app.clone(), app_id.clone()).await?;

    // Paso 2: Instalar desde el archivo flatpakref
    app.emit(
        "install-output",
        "Iniciando instalación desde archivo local...",
    )
    .map_err(|e| format!("Failed to emit: {}", e))?;

    let shell = app.shell();

    // Detectar si estamos en un flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let (mut rx, _child) = if is_flatpak {
        // Dentro de flatpak, usar flatpak-spawn para ejecutar en el host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "install", "-y", "--user", &flatpakref_path])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {}", e))?
    } else {
        // Fuera de flatpak, usar flatpak directamente
        shell
            .command("flatpak")
            .args(["install", "-y", "--user", &flatpakref_path])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak: {}", e))?
    };

    // Leer la salida en tiempo real
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
                // Limpiar archivo temporal
                let _ = fs::remove_file(&flatpakref_path);

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
fn read_cache_index(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let index_path = app_data_dir.join("cacheImages").join("index.json");

    if !index_path.exists() {
        return Ok("{}".to_string());
    }

    fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read cache index: {}", e))
}

#[tauri::command]
fn write_cache_index(app: tauri::AppHandle, content: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    fs::create_dir_all(&cache_images_dir)
        .map_err(|e| format!("Failed to create cacheImages directory: {}", e))?;

    let index_path = cache_images_dir.join("index.json");
    fs::write(&index_path, content)
        .map_err(|e| format!("Failed to write cache index: {}", e))
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

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png");

    // Determinar extensión del archivo
    let extension = match content_type {
        ct if ct.contains("png") => "png",
        ct if ct.contains("jpeg") || ct.contains("jpg") => "jpg",
        ct if ct.contains("svg") => "svg",
        ct if ct.contains("webp") => "webp",
        _ => "png",
    };

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Error reading image bytes: {}", e))?;

    // Generar nombre de archivo único usando el app_id
    // Reemplazar caracteres inválidos para nombres de archivo (. y :::)
    let safe_app_id = app_id.replace(".", "_").replace(":::", "_screenshot_");
    let filename = format!("{}.{}", safe_app_id, extension);
    let file_path = cache_images_dir.join(&filename);

    fs::write(&file_path, &bytes)
        .map_err(|e| format!("Error saving image: {}", e))?;

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
async fn get_installed_flatpaks(app: tauri::AppHandle) -> Result<Vec<InstalledApp>, String> {
    let shell = app.shell();

    // Detect if we're running inside a flatpak
    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();

    let output = if is_flatpak {
        // Inside flatpak, use flatpak-spawn to execute on the host
        shell
            .command("flatpak-spawn")
            .args(["--host", "flatpak", "list", "--app", "--columns=application,name,version,description"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["list", "--app", "--columns=application,name,version,description"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak: {}", e))?
    };

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Flatpak command failed: {}", error));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let apps: Vec<InstalledApp> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let app_id = parts[0].trim().to_string();
                Some(InstalledApp {
                    app_id: app_id.clone(),
                    name: parts[1].trim().to_string(),
                    version: parts[2].trim().to_string(),
                    summary: if parts.len() >= 4 && !parts[3].trim().is_empty() {
                        Some(parts[3].trim().to_string())
                    } else {
                        None
                    },
                    developer: extract_developer(&app_id),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(apps)
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
            .args(["--host", "flatpak", "remote-ls", "--updates", "--columns=application,version,branch"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {}", e))?
    } else {
        // Outside flatpak, use flatpak directly
        shell
            .command("flatpak")
            .args(["remote-ls", "--updates", "--columns=application,version,branch"])
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
            tauri_plugin_shell::process::CommandEvent::Stderr(_line) => {
                // Flatpak sends normal output to stderr, ignore it to avoid duplicates
                // Real errors will be caught by the Error event or exit code
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
            tauri_plugin_shell::process::CommandEvent::Stderr(_line) => {
                // Flatpak sends normal output to stderr, ignore it to avoid duplicates
                // Real errors will be caught by the Error event or exit code
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
            tauri_plugin_shell::process::CommandEvent::Stderr(_line) => {
                // Flatpak sends normal output to stderr, ignore it to avoid duplicates
                // Real errors will be caught by the Error event or exit code
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            install_flatpak,
            download_flatpakref,
            check_first_launch,
            initialize_app,
            get_app_data_path,
            get_cache_image_dir,
            read_cache_index,
            write_cache_index,
            download_and_cache_image,
            get_cached_image_path,
            check_file_exists,
            get_installed_flatpaks,
            get_available_updates,
            update_flatpak,
            update_system_flatpaks,
            uninstall_flatpak
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
