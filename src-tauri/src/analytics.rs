use serde::Serialize;
use std::process::Command;
use crate::*;

// Helper function to get app permissions from flatpak
fn get_app_permissions(app_id: &str, is_flatpak: bool) -> Option<Vec<String>> {
    let output = if is_flatpak {
        Command::new("flatpak-spawn")
            .args(&["--host", "flatpak", "info", "--show-permissions", app_id])
            .output()
            .ok()?
    } else {
        Command::new("flatpak")
            .args(&["info", "--show-permissions", app_id])
            .output()
            .ok()?
    };

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut permissions = Vec::new();
    let mut has_camera = false;
    let mut has_files = false;
    let mut has_storage = false;

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('[') {
            continue;
        }

        // Look for specific permissions we care about
        // Camera: devices=all (full device access) or specific video devices
        if !has_camera && line.contains("devices=") {
            let devices_part = line.split("devices=").nth(1).unwrap_or("");
            // Check if "all" is in the devices list (e.g., "dri;all;" or "all;")
            if devices_part.split(';').any(|d| d.trim() == "all") {
                permissions.push("camera".to_string());
                has_camera = true;
            }
        }

        // Files: filesystems= with any value
        if !has_files && line.contains("filesystems=") {
            let filesystems_part = line.split("filesystems=").nth(1).unwrap_or("");
            let filesystems_value = filesystems_part.split(';').next().unwrap_or("").trim();
            if !filesystems_value.is_empty() {
                permissions.push("files".to_string());
                has_files = true;
            }
        }

        // Storage: persist= or filesystems containing home/host
        if !has_storage {
            if line.contains("persist=") {
                let persist_part = line.split("persist=").nth(1).unwrap_or("");
                let persist_value = persist_part.split(';').next().unwrap_or("").trim();
                if !persist_value.is_empty() {
                    permissions.push("storage".to_string());
                    has_storage = true;
                }
            } else if line.contains("filesystems=") {
                if line.contains("home") || line.contains("host") || line.contains("xdg-download") {
                    permissions.push("storage".to_string());
                    has_storage = true;
                }
            }
        }
    }

    if permissions.is_empty() {
        None
    } else {
        Some(permissions)
    }
}

// System Analytics Struct
#[derive(Serialize)]
pub struct SystemAnalytics {
    disk_usage: DiskUsage,
    flatpak_stats: FlatpakStats,
    system_info: SystemInfo,
}

#[derive(Serialize)]
pub struct DiskUsage {
    total_gb: f64,
    used_gb: f64,
    available_gb: f64,
    usage_percent: f64,
}

#[derive(Serialize)]
pub struct FlatpakStats {
    total_apps: usize,
    total_runtimes: usize,
    total_extensions: usize,
    apps_with_updates: usize,
}

#[derive(Serialize)]
pub struct SystemInfo {
    os_name: String,
    kernel_version: String,
    hostname: String,
}

// Get system analytics data
#[tauri::command]
pub async fn get_app_permissions_batch(
    _app: tauri::AppHandle,
    app_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    // Blocking subprocess + thread joins: keep them off the async workers.
    tokio::task::spawn_blocking(move || {
        use std::collections::HashMap;
        use std::sync::{Arc, Mutex};
        use std::thread;

        let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
        let result = Arc::new(Mutex::new(HashMap::new()));

        // Parallelize permission fetching using native threads
        // Limit concurrent threads to avoid overwhelming the system
        let chunk_size = 10; // Process 10 apps at a time
        let mut app_id_chunks: Vec<Vec<String>> = Vec::new();

        for chunk in app_ids.chunks(chunk_size) {
            app_id_chunks.push(chunk.to_vec());
        }

        for chunk in app_id_chunks.iter() {
            let mut handles = Vec::new();

            for app_id in chunk {
                let result_clone = Arc::clone(&result);
                let app_id_clone = app_id.clone();
                let handle = thread::spawn(move || {
                    if let Some(perms) = get_app_permissions(&app_id_clone, is_flatpak) {
                        result_clone.lock().unwrap().insert(app_id_clone, perms);
                    }
                });
                handles.push(handle);
            }

            // Wait for this chunk to complete
            for handle in handles {
                let _ = handle.join();
            }
        }

        let final_result = result.lock().unwrap().clone();
        Ok(final_result)
    })
    .await
    .map_err(|e| format!("Permission task failed: {}", e))?
}

#[tauri::command]
pub async fn get_system_analytics(
    app: tauri::AppHandle,
    total_apps: Option<usize>,
    total_runtimes: Option<usize>,
    total_extensions: Option<usize>,
    apps_with_updates: Option<usize>,
) -> Result<SystemAnalytics, String> {
    // Get disk usage
    let disk_usage = get_disk_usage().await?;

    // Use provided flatpak stats or fetch them if not provided
    let flatpak_stats = if let (Some(apps), Some(runtimes), Some(extensions), Some(updates)) =
        (total_apps, total_runtimes, total_extensions, apps_with_updates)
    {
        FlatpakStats {
            total_apps: apps,
            total_runtimes: runtimes,
            total_extensions: extensions,
            apps_with_updates: updates,
        }
    } else {
        get_flatpak_stats(app.clone()).await?
    };

    // Get system info
    let system_info = get_system_info().await?;
    Ok(SystemAnalytics {
        disk_usage,
        flatpak_stats,
        system_info,
    })
}

#[cfg(target_os = "linux")]
async fn get_disk_usage() -> Result<DiskUsage, String> {
    use std::io::BufRead;

    // Read /proc/mounts to find home partition
    let mounts_file = File::open("/proc/mounts")
        .map_err(|e| format!("Failed to open /proc/mounts: {}", e))?;
    let reader = BufReader::new(mounts_file);

    let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/home".to_string());
    let mut home_device = String::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let mount_point = parts[1];
                if home_dir.starts_with(mount_point) && mount_point.len() > home_device.len() {
                    home_device = parts[0].to_string();
                }
            }
        }
    }

    // Use statvfs to get filesystem stats
    let output = Command::new("df")
        .args(["-B1", &home_dir])
        .output()
        .map_err(|e| format!("Failed to execute df: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();

    if lines.len() >= 2 {
        let parts: Vec<&str> = lines[1].split_whitespace().collect();
        if parts.len() >= 5 {
            let total = parts[1].parse::<f64>().unwrap_or(0.0) / 1_073_741_824.0; // Convert to GB
            let used = parts[2].parse::<f64>().unwrap_or(0.0) / 1_073_741_824.0;
            let available = parts[3].parse::<f64>().unwrap_or(0.0) / 1_073_741_824.0;
            let usage_percent = if total > 0.0 { (used / total) * 100.0 } else { 0.0 };

            return Ok(DiskUsage {
                total_gb: total,
                used_gb: used,
                available_gb: available,
                usage_percent,
            });
        }
    }

    Err("Failed to parse disk usage".to_string())
}

#[cfg(not(target_os = "linux"))]
async fn get_disk_usage() -> Result<DiskUsage, String> {
    Ok(DiskUsage {
        total_gb: 0.0,
        used_gb: 0.0,
        available_gb: 0.0,
        usage_percent: 0.0,
    })
}

async fn get_flatpak_stats(app: tauri::AppHandle) -> Result<FlatpakStats, String> {
    let installed = get_installed_flatpaks(app.clone()).await?;
    let updates = get_available_updates(app).await?;

    Ok(FlatpakStats {
        total_apps: installed.apps.len(),
        total_runtimes: installed.runtimes.len(),
        total_extensions: installed.extensions.len(),
        apps_with_updates: updates.len(),
    })
}

async fn get_system_info() -> Result<SystemInfo, String> {
    #[cfg(target_os = "linux")]
    {
        let os_name = std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content.lines()
                    .find(|line| line.starts_with("PRETTY_NAME="))
                    .map(|line| line.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Linux".to_string());

        let kernel_version = std::fs::read_to_string("/proc/version")
            .ok()
            .and_then(|content| {
                content.split_whitespace().nth(2).map(|s| s.to_string())
            })
            .unwrap_or_else(|| "Unknown".to_string());

        let hostname = std::fs::read_to_string("/etc/hostname")
            .unwrap_or_else(|_| "localhost".to_string())
            .trim()
            .to_string();

        Ok(SystemInfo {
            os_name,
            kernel_version,
            hostname,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(SystemInfo {
            os_name: "Unknown".to_string(),
            kernel_version: "Unknown".to_string(),
            hostname: "localhost".to_string(),
        })
    }
}

