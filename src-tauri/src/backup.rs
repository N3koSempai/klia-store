use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Manager};

/// Resolves the user's Downloads directory so backups can be saved there by
/// default without prompting a save dialog for an automated, multi-file
/// operation. Requires --filesystem=xdg-download in the Flatpak manifest.
#[tauri::command]
pub fn get_downloads_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .download_dir()
        .map_err(|e| format!("Failed to resolve downloads directory: {}", e))
        .map(|p| p.to_string_lossy().to_string())
}

fn is_running_in_flatpak() -> bool {
    std::env::var("FLATPAK_ID").is_ok()
}

/// Runs a flatpak subcommand, transparently going through flatpak-spawn when
/// klia-store itself is sandboxed (same pattern used throughout lib.rs).
fn run_flatpak(args: &[&str]) -> Result<std::process::Output, String> {
    let output = if is_running_in_flatpak() {
        let mut full_args = vec!["--host", "flatpak"];
        full_args.extend_from_slice(args);
        Command::new("flatpak-spawn").args(&full_args).output()
    } else {
        Command::new("flatpak").args(args).output()
    }
    .map_err(|e| format!("Failed to execute flatpak: {}", e))?;

    Ok(output)
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable not set".to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuntimeRef {
    pub id: String,
    pub arch: String,
    pub branch: String,
    pub commit: Option<String>,
}

impl RuntimeRef {
    fn file_stem(&self) -> String {
        format!("{}-{}-{}", self.id, self.branch, self.arch)
    }
}

/// Per-app manifest, stored inside <session>/<app-id>/manifest.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupManifest {
    pub app_id: String,
    pub name: String,
    pub version: String,
    pub runtime: Option<RuntimeRef>,
    pub runtime_bundle: Option<String>, // relative path to the runtime bundle, e.g. "../runtimes/<file>.flatpak"
    pub permissions: Vec<String>,
    pub includes_data: bool,
    pub includes_runtime: bool,
    pub flathub_commit: Option<String>,
}

/// One entry the caller requests to include in a backup session.
#[derive(Deserialize, Clone, Debug)]
pub struct BackupAppRequest {
    pub app_id: String,
    pub include_data: bool,
    pub include_runtime: bool,
}

/// Session-level manifest, stored at <session>/session.json, describing every
/// app bundled together in a single backup operation.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupSession {
    pub session_id: String,
    pub created_at: String,
    pub apps: Vec<BackupManifest>,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupAppSummary {
    pub app_id: String,
    pub name: String,
    pub version: String,
    pub includes_data: bool,
    pub includes_runtime: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct BackupSessionSummary {
    pub session_id: String,
    pub created_at: String,
    pub archive_path: String,
    pub size_bytes: u64,
    pub apps: Vec<BackupAppSummary>,
}

/// Looks up an installed app's display name and version via `flatpak list`
/// with explicit `--columns`, the same mechanism `get_installed_flatpaks` in
/// lib.rs relies on. Unlike `flatpak info`'s free-text output (whose field
/// labels like "Versión:"/"Version:" are localized and whose `--show-version`
/// flag doesn't exist before Flatpak 1.15), `--columns` output is stable
/// across locales and older Flatpak versions (e.g. 1.14.x, common on
/// Debian/Ubuntu LTS).
fn get_installed_app_info(app_id: &str) -> Result<(String, String), String> {
    let output = run_flatpak(&["list", "--app", "--columns=application,name,version"])?;
    if !output.status.success() {
        return Err(format!(
            "Failed to list installed apps: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 && parts[0].trim() == app_id {
            let name = parts[1].trim().to_string();
            let version = parts[2].trim().to_string();
            return Ok((
                if name.is_empty() { app_id.to_string() } else { name },
                version,
            ));
        }
    }

    Err(format!("App {} is not installed", app_id))
}

/// Looks up the branch an app is installed on (e.g. "stable", "23.08"), via
/// `flatpak info --show-ref` (format: `app/<id>/<arch>/<branch>`). Needed
/// because `flatpak build-bundle` defaults its branch argument to "master"
/// when omitted, which fails for the common case of apps installed from the
/// "stable" branch (e.g. Flathub apps).
fn get_installed_app_branch(app_id: &str) -> Result<String, String> {
    let output = run_flatpak(&["info", "--show-ref", app_id])?;
    if !output.status.success() {
        return Err(format!(
            "Failed to resolve installed ref for {}: {}",
            app_id,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let full_ref = stdout.trim();
    full_ref
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Could not parse branch from ref '{}'", full_ref))
}

fn get_runtime_ref(app_id: &str) -> Option<RuntimeRef> {
    let output = run_flatpak(&["info", "--show-runtime", app_id]).ok()?;
    if !output.status.success() {
        return None;
    }
    // Format: runtime/org.kde.Platform/x86_64/5.15-23.08
    let stdout = String::from_utf8_lossy(&output.stdout);
    let runtime_full = stdout.trim().strip_prefix("runtime/").unwrap_or(stdout.trim());
    let parts: Vec<&str> = runtime_full.split('/').collect();
    if parts.len() != 3 {
        return None;
    }

    let commit = run_flatpak(&["info", "--show-commit", parts[0]])
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    Some(RuntimeRef {
        id: parts[0].to_string(),
        arch: parts[1].to_string(),
        branch: parts[2].to_string(),
        commit,
    })
}

fn get_flathub_commit(app_id: &str) -> Option<String> {
    let output = run_flatpak(&["info", "--show-commit", app_id]).ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Reads current `flatpak override` permissions for an app as raw override lines,
/// since permissions do not live under ~/.var/app and must be captured explicitly.
fn get_override_permissions(app_id: &str) -> Vec<String> {
    let output = match run_flatpak(&["override", "--user", "--show", app_id]) {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.starts_with('['))
        .collect()
}

fn apply_override_permissions(app_id: &str, permissions: &[String]) -> Result<(), String> {
    if permissions.is_empty() {
        return Ok(());
    }

    // Each captured line is a `key=value` override entry (e.g. "filesystems=home;").
    // Re-apply them verbatim via `flatpak override --user --<key>=<value> <app_id>`.
    let mut args: Vec<String> = vec!["override".to_string(), "--user".to_string()];
    for line in permissions {
        if let Some((key, value)) = line.split_once('=') {
            args.push(format!("--{}={}", key, value));
        }
    }
    args.push(app_id.to_string());

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_flatpak(&arg_refs)?;
    if !output.status.success() {
        return Err(format!(
            "Failed to reapply permissions: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn is_runtime_installed(runtime: &RuntimeRef) -> bool {
    let full_ref = format!("{}/{}/{}", runtime.id, runtime.arch, runtime.branch);
    run_flatpak(&["info", &full_ref])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Locates the user's local OSTree flatpak repo, required by `build-bundle`.
fn user_repo_path() -> Result<PathBuf, String> {
    let repo = home_dir()?.join(".local/share/flatpak/repo");
    if !repo.exists() {
        return Err(format!(
            "Flatpak user repo not found at {}",
            repo.display()
        ));
    }
    Ok(repo)
}

fn extract_tar_zst_to_dir(src_file: &Path, dest_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Failed to create extraction directory: {}", e))?;
    let file = fs::File::open(src_file)
        .map_err(|e| format!("Failed to open backup archive: {}", e))?;
    let decoder = zstd::stream::read::Decoder::new(file)
        .map_err(|e| format!("Failed to create zstd decoder: {}", e))?;
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(dest_dir)
        .map_err(|e| format!("Failed to extract backup archive: {}", e))?;
    Ok(())
}

fn compress_dir_to_tar_zst(src_dir: &Path, dest_file: &Path) -> Result<(), String> {
    compress_dir_to_tar_zst_with_progress(src_dir, dest_file, None)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            total += dir_size(&entry.path());
        } else {
            total += metadata.len();
        }
    }
    total
}

/// Compresses `src_dir` into `dest_file` as tar+zstd. If `app` is given, a
/// watcher thread polls the archive's written byte count every ~500ms and
/// emits a "backup-compress-progress" event with `{written, sourceSize}` —
/// large backups (app + data + runtime) can take a while to compress and
/// would otherwise show no feedback at all while it happens.
fn compress_dir_to_tar_zst_with_progress(
    src_dir: &Path,
    dest_file: &Path,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    let file = fs::File::create(dest_file)
        .map_err(|e| format!("Failed to create archive file: {}", e))?;

    let stop_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let watcher_thread = app.map(|app| {
        let dest_file = dest_file.to_path_buf();
        let source_size = dir_size(src_dir);
        let app = app.clone();
        let stop_flag = std::sync::Arc::clone(&stop_flag);
        std::thread::spawn(move || {
            while !stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                if let Ok(metadata) = fs::metadata(&dest_file) {
                    let _ = app.emit(
                        "backup-compress-progress",
                        serde_json::json!({
                            "written": metadata.len(),
                            "sourceSize": source_size,
                        }),
                    );
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        })
    });

    let compress_result = (|| -> Result<(), String> {
        let encoder = zstd::stream::write::Encoder::new(file, 0)
            .map_err(|e| format!("Failed to create zstd encoder: {}", e))?
            .auto_finish();
        let mut tar_builder = tar::Builder::new(encoder);
        tar_builder
            .append_dir_all(".", src_dir)
            .map_err(|e| format!("Failed to archive data directory: {}", e))?;
        tar_builder
            .finish()
            .map_err(|e| format!("Failed to finalize archive: {}", e))?;
        Ok(())
    })();

    stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    if let Some(handle) = watcher_thread {
        let _ = handle.join();
    }

    compress_result
}

/// Exports a runtime bundle into the session's shared `runtimes/` folder,
/// unless it was already exported earlier in this same session (tracked via
/// `exported_runtimes`). Writes directly to its final destination — no
/// copy-then-delete — so a runtime shared by several apps in one backup is
/// built with `build-bundle --runtime` exactly once.
fn export_runtime_once(
    session_dir: &Path,
    repo_path: &Path,
    rt: &RuntimeRef,
    exported_runtimes: &mut std::collections::HashSet<String>,
    emit_progress: &dyn Fn(&str),
) -> Result<String, String> {
    let runtime_filename = format!("{}.flatpak", rt.file_stem());

    if exported_runtimes.contains(&runtime_filename) {
        return Ok(runtime_filename);
    }

    let runtimes_dir = session_dir.join("runtimes");
    fs::create_dir_all(&runtimes_dir)
        .map_err(|e| format!("Failed to create runtimes directory: {}", e))?;
    let runtime_bundle_path = runtimes_dir.join(&runtime_filename);

    emit_progress(&format!("Exportando runtime {} (compartido)...", rt.id));
    let runtime_full_ref = format!("{}/{}/{}", rt.id, rt.arch, rt.branch);
    let output = run_flatpak(&[
        "build-bundle",
        "--runtime",
        repo_path.to_str().ok_or("Invalid repo path")?,
        runtime_bundle_path
            .to_str()
            .ok_or("Invalid runtime bundle path")?,
        &runtime_full_ref,
    ])?;
    if !output.status.success() {
        return Err(format!(
            "flatpak build-bundle --runtime failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    exported_runtimes.insert(runtime_filename.clone());
    Ok(runtime_filename)
}

fn backup_single_app(
    session_dir: &Path,
    repo_path: &Path,
    req: &BackupAppRequest,
    exported_runtimes: &mut std::collections::HashSet<String>,
    emit_progress: &dyn Fn(&str),
) -> Result<BackupManifest, String> {
    let app_id = &req.app_id;

    emit_progress(&format!("Verificando instalación de {}...", app_id));
    let (name, version) = get_installed_app_info(app_id)?;
    let branch = get_installed_app_branch(app_id)?;
    let permissions = get_override_permissions(app_id);
    let runtime = get_runtime_ref(app_id);
    let flathub_commit = get_flathub_commit(app_id);

    let app_dir = session_dir.join(app_id);
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app backup directory: {}", e))?;

    // 1. Export the app bundle (build-bundle exports one ref per invocation).
    //    The branch must be passed explicitly: build-bundle defaults to
    //    "master" when omitted, which fails for apps installed on "stable".
    emit_progress(&format!("Exportando bundle de {}...", app_id));
    let bundle_path = app_dir.join(format!("{}.flatpak", app_id));
    let output = run_flatpak(&[
        "build-bundle",
        repo_path.to_str().ok_or("Invalid repo path")?,
        bundle_path.to_str().ok_or("Invalid bundle path")?,
        app_id,
        &branch,
    ])?;
    if !output.status.success() {
        return Err(format!(
            "flatpak build-bundle failed for {}: {}",
            app_id,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 2. Optionally back up ~/.var/app/<app-id> data.
    if req.include_data {
        emit_progress(&format!("Comprimiendo datos de {}...", app_id));
        let data_dir = home_dir()?.join(".var/app").join(app_id);
        if data_dir.exists() {
            let data_archive = app_dir.join("data.tar.zst");
            compress_dir_to_tar_zst(&data_dir, &data_archive)?;
        }
    }

    // 3. Optionally export the runtime into the session's shared runtimes/
    //    folder, deduplicated across every app in this backup that needs it.
    //    The whole session (app folders + shared runtimes/) still ends up
    //    self-contained once compressed into a single portable archive.
    let mut runtime_bundle_rel: Option<String> = None;
    if req.include_runtime {
        if let Some(rt) = &runtime {
            let runtime_filename =
                export_runtime_once(session_dir, repo_path, rt, exported_runtimes, emit_progress)?;
            runtime_bundle_rel = Some(format!("../runtimes/{}", runtime_filename));
        }
    }

    let manifest = BackupManifest {
        app_id: app_id.clone(),
        name,
        version,
        runtime,
        runtime_bundle: runtime_bundle_rel,
        permissions,
        includes_data: req.include_data,
        includes_runtime: req.include_runtime,
        flathub_commit,
    };

    let manifest_path = app_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    fs::write(&manifest_path, manifest_json)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(manifest)
}

/// Creates a single backup archive containing every requested app. All apps
/// selected by the user in one operation are staged in a temporary session
/// folder, then packed into one portable `<session_id>.tar.zst` file at
/// `dest_dir` — a single file that can be copied to another machine and
/// restored from there via file picker or drag & drop.
#[tauri::command]
pub async fn create_backup(
    app: tauri::AppHandle,
    dest_dir: String,
    apps: Vec<BackupAppRequest>,
) -> Result<BackupSession, String> {
    if apps.is_empty() {
        return Err("No apps selected for backup".to_string());
    }

    let emit_progress = |msg: &str| {
        let _ = app.emit("backup-progress", msg.to_string());
    };

    let dest_root = PathBuf::from(&dest_dir);
    let session_id = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();

    let staging_root = std::env::temp_dir().join(format!("klia-store-backup-{}", session_id));
    let session_dir = staging_root.join(&session_id);
    fs::create_dir_all(&session_dir)
        .map_err(|e| format!("Failed to create staging directory: {}", e))?;

    let repo_path = user_repo_path()?;

    let mut exported_runtimes = std::collections::HashSet::new();
    let mut manifests = Vec::with_capacity(apps.len());
    for (index, req) in apps.iter().enumerate() {
        emit_progress(&format!(
            "[{}/{}] {}",
            index + 1,
            apps.len(),
            req.app_id
        ));
        let manifest = backup_single_app(
            &session_dir,
            &repo_path,
            req,
            &mut exported_runtimes,
            &emit_progress,
        )?;
        manifests.push(manifest);
    }

    let session = BackupSession {
        session_id: session_id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        apps: manifests,
    };

    let session_manifest_path = session_dir.join("session.json");
    let session_json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    fs::write(&session_manifest_path, session_json)
        .map_err(|e| format!("Failed to write session manifest: {}", e))?;

    emit_progress("Comprimiendo respaldo...");
    fs::create_dir_all(&dest_root)
        .map_err(|e| format!("Failed to create destination directory: {}", e))?;
    let archive_path = dest_root.join(format!("{}.klia-backup.tar.zst", session_id));
    compress_dir_to_tar_zst_with_progress(&session_dir, &archive_path, Some(&app))?;

    let _ = fs::remove_dir_all(&staging_root);

    emit_progress("Respaldo completado.");
    Ok(session)
}

const BACKUP_ARCHIVE_EXTENSION: &str = ".klia-backup.tar.zst";

/// Reads just the `session.json` entry out of a backup archive without
/// extracting the whole thing to disk, so listing backups in a folder full of
/// them stays cheap.
fn read_session_summary_from_archive(archive_path: &Path) -> Option<BackupSessionSummary> {
    let file = fs::File::open(archive_path).ok()?;
    let decoder = zstd::stream::read::Decoder::new(file).ok()?;
    let mut archive = tar::Archive::new(decoder);

    let entries = archive.entries().ok()?;
    for entry in entries.flatten() {
        let mut entry = entry;
        let path = entry.path().ok()?.into_owned();
        if path.file_name().and_then(|n| n.to_str()) != Some("session.json") {
            continue;
        }
        // session.json lives at the root of the session folder inside the
        // archive (e.g. "20260718-120000/session.json") — a nested app's
        // manifest.json would sort under "<app-id>/manifest.json" instead.
        if path.components().count() != 2 {
            continue;
        }

        use std::io::Read;
        let mut contents = String::new();
        entry.read_to_string(&mut contents).ok()?;
        let session: BackupSession = serde_json::from_str(&contents).ok()?;

        let size_bytes = fs::metadata(archive_path).map(|m| m.len()).unwrap_or(0);

        return Some(BackupSessionSummary {
            session_id: session.session_id,
            created_at: session.created_at,
            archive_path: archive_path.to_string_lossy().to_string(),
            size_bytes,
            apps: session
                .apps
                .into_iter()
                .map(|m| BackupAppSummary {
                    app_id: m.app_id,
                    name: m.name,
                    version: m.version,
                    includes_data: m.includes_data,
                    includes_runtime: m.includes_runtime,
                })
                .collect(),
        });
    }

    None
}

fn is_backup_archive(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with(BACKUP_ARCHIVE_EXTENSION))
        .unwrap_or(false)
}

/// Lists backup archives found at `backups_path`. Restoring typically happens
/// on a different machine than the one that created the backup, so the user
/// picks an arbitrary file or folder (native picker or drag & drop) rather
/// than a fixed app-managed location. `backups_path` may point directly at a
/// single `.klia-backup.tar.zst` file, or at a folder containing one or more
/// of them (e.g. the whole Downloads folder, or a folder copied from a USB
/// drive).
#[tauri::command]
pub async fn list_backups(backups_path: String) -> Result<Vec<BackupSessionSummary>, String> {
    let root = PathBuf::from(&backups_path);
    if !root.exists() {
        return Ok(Vec::new());
    }

    if root.is_file() {
        return Ok(read_session_summary_from_archive(&root)
            .into_iter()
            .collect());
    }

    let mut summaries = Vec::new();
    let entries = fs::read_dir(&root).map_err(|e| format!("Failed to read backups dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_backup_archive(&path) {
            continue;
        }

        if let Some(summary) = read_session_summary_from_archive(&path) {
            summaries.push(summary);
        }
    }

    summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(summaries)
}

#[tauri::command]
pub async fn delete_backup(archive_path: String) -> Result<(), String> {
    let path = PathBuf::from(&archive_path);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete backup: {}", e))?;
    }
    Ok(())
}

fn restore_single_app(
    session_dir: &Path,
    manifest: &BackupManifest,
    emit_progress: &dyn Fn(&str),
) -> Result<(), String> {
    let app_dir = session_dir.join(&manifest.app_id);

    // 1. Resolve the runtime: installed -> local bundle in runtimes/ -> Flathub as last resort.
    if let Some(runtime) = &manifest.runtime {
        if !is_runtime_installed(runtime) {
            emit_progress(&format!("Runtime {} no instalado, resolviendo...", runtime.id));

            let resolved = if let Some(rel_bundle) = &manifest.runtime_bundle {
                let runtime_bundle_path = app_dir.join(rel_bundle);
                if runtime_bundle_path.exists() {
                    emit_progress("Instalando runtime desde bundle local...");
                    let output = run_flatpak(&[
                        "install",
                        "-y",
                        "--user",
                        runtime_bundle_path
                            .to_str()
                            .ok_or("Invalid runtime bundle path")?,
                    ])?;
                    output.status.success()
                } else {
                    false
                }
            } else {
                false
            };

            if !resolved {
                emit_progress("Bundle de runtime no disponible, intentando desde Flathub...");
                let runtime_full_ref = format!(
                    "runtime/{}/{}/{}",
                    runtime.id, runtime.arch, runtime.branch
                );
                let output = run_flatpak(&[
                    "install", "-y", "--user", "flathub", &runtime_full_ref,
                ])?;
                if !output.status.success() {
                    return Err(format!(
                        "No se pudo resolver el runtime {} (no instalado, sin bundle local, y falló la instalación desde Flathub): {}",
                        runtime.id,
                        String::from_utf8_lossy(&output.stderr)
                    ));
                }
            }
        }
    }

    // 2. Install the app bundle (local, no network required).
    emit_progress(&format!("Instalando {}...", manifest.app_id));
    let bundle_path = app_dir.join(format!("{}.flatpak", manifest.app_id));
    if !bundle_path.exists() {
        return Err(format!(
            "Bundle de la app no encontrado en {}",
            bundle_path.display()
        ));
    }
    let output = run_flatpak(&[
        "install",
        "-y",
        "--user",
        bundle_path.to_str().ok_or("Invalid bundle path")?,
    ])?;
    if !output.status.success() {
        return Err(format!(
            "flatpak install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // 3. Reapply permissions captured at backup time.
    if !manifest.permissions.is_empty() {
        emit_progress("Restaurando permisos...");
        apply_override_permissions(&manifest.app_id, &manifest.permissions)?;
    }

    // 4. Restore user data if it was included in the backup.
    let data_archive = app_dir.join("data.tar.zst");
    if manifest.includes_data && data_archive.exists() {
        emit_progress("Restaurando datos de la aplicación...");
        let data_dir = home_dir()?.join(".var/app").join(&manifest.app_id);
        extract_tar_zst_to_dir(&data_archive, &data_dir)?;
    }

    Ok(())
}

/// Restores a whole backup archive. `app_ids` optionally narrows the restore
/// to a subset of the apps contained in the session (defaults to all of them).
/// `archive_path` is a single `.klia-backup.tar.zst` file, extracted to a
/// temporary directory before restoring and cleaned up afterwards.
#[tauri::command]
pub async fn restore_backup(
    app: tauri::AppHandle,
    archive_path: String,
    app_ids: Option<Vec<String>>,
) -> Result<(), String> {
    let emit_progress = |msg: &str| {
        let _ = app.emit("backup-progress", msg.to_string());
    };

    let archive = PathBuf::from(&archive_path);
    if !archive.is_file() {
        return Err(format!("Backup archive not found at {}", archive.display()));
    }

    emit_progress("Extrayendo respaldo...");
    let staging_root = std::env::temp_dir().join(format!(
        "klia-store-restore-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    extract_tar_zst_to_dir(&archive, &staging_root)?;

    let restore_result = (|| -> Result<(), String> {
        // The archive contains a single top-level folder named after the
        // session id (e.g. "20260718-120000/"), holding session.json and
        // one subfolder per app.
        let session_dir = fs::read_dir(&staging_root)
            .map_err(|e| format!("Failed to read extracted archive: {}", e))?
            .flatten()
            .map(|e| e.path())
            .find(|p| p.is_dir())
            .ok_or_else(|| "Backup archive is empty or malformed".to_string())?;

        let session_manifest_path = session_dir.join("session.json");
        let session: BackupSession = serde_json::from_str(
            &fs::read_to_string(&session_manifest_path)
                .map_err(|e| format!("Failed to read session manifest: {}", e))?,
        )
        .map_err(|e| format!("Failed to parse session manifest: {}", e))?;

        let manifests_to_restore: Vec<&BackupManifest> = match &app_ids {
            Some(ids) => session
                .apps
                .iter()
                .filter(|m| ids.contains(&m.app_id))
                .collect(),
            None => session.apps.iter().collect(),
        };

        if manifests_to_restore.is_empty() {
            return Err("No apps selected to restore".to_string());
        }

        let total = manifests_to_restore.len();
        for (index, manifest) in manifests_to_restore.iter().enumerate() {
            emit_progress(&format!("[{}/{}] {}", index + 1, total, manifest.app_id));
            restore_single_app(&session_dir, manifest, &emit_progress)?;
        }

        Ok(())
    })();

    let _ = fs::remove_dir_all(&staging_root);
    restore_result?;

    emit_progress("Restauración completada.");
    Ok(())
}
