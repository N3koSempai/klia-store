use serde::Serialize;
use std::fs;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use crate::*;

#[derive(Serialize)]
pub struct DebPackage {
    package: String,
    name: String,
    version: String,
    summary: Option<String>,
    /// Absolute path to the app icon on the host, resolved by the listing
    /// script (hicolor/pixmaps fallback). `None` when the entry has no
    /// resolvable icon; the frontend then keeps its letter placeholder.
    icon_path: Option<String>,
}

/// Lists GUI applications installed via .deb (dpkg) by mapping the desktop
/// entries under /usr/share/applications and ~/.local/share/applications back
/// to their owning packages. Read-only: it only runs `dpkg -S` and
/// `dpkg-query -W`, both of which read the world-readable dpkg database and
/// never write. When klia-store itself is sandboxed, the listing runs on the
/// host through `flatpak-spawn --host` (the same pattern used for every other
/// host command in this file).
#[tauri::command]
pub async fn get_installed_debs(app: tauri::AppHandle) -> Result<Vec<DebPackage>, String> {
    let shell = app.shell();

    // List user-installed GUI apps from deb packages. The primary criterion is
    // `apt-mark showmanual`: packages the user installed explicitly. Anything
    // pulled in automatically (the elementary desktop stack, runtimes,
    // libraries) is marked `auto` and excluded, which keeps built-in apps like
    // Photos or Files out of the list for free. That set is crossed with the
    // desktop entries in `/usr/share/applications` — one `dpkg -S` pass, with
    // awk keeping the entry whose basename matches the package name — and each
    // surviving entry still passes a desktop-file safety net: `NoDisplay`,
    // settings panels (`Categories=...Settings`), terminal tools
    // (`Terminal=true`), `X-AppStream-Ignore`, remote-access servers
    // (`Categories=...RemoteAccess`), entries scoped to another desktop
    // (`OnlyShowIn`/`NotShowIn` vs `$XDG_CURRENT_DESKTOP`), non-`Application`
    // types, and dpkg `Section=admin`. That drops the few manually-marked
    // packages that aren't desktop apps (a runtime, a daemon, a shell editor).
    // Each surviving entry also resolves its `Icon=` to an absolute path with a
    // fixed fallback (hicolor 512→24, then scalable, then pixmaps — no per-user
    // theme lookup) and emits it as a fifth column; the frontend pulls that
    // file off the host through `cache_deb_icon`.
    const SCRIPT: &str = r#"LANG=C
desktop="${XDG_CURRENT_DESKTOP:-}"
manual="$(apt-mark showmanual 2>/dev/null)"
files=$(find /usr/share/applications -maxdepth 1 -name '*.desktop' -type f 2>/dev/null)
[ -n "$files" ] || exit 0
printf '%s\n' "$files" \
  | xargs -d '\n' dpkg -S 2>/dev/null \
  | sed -n 's/^\([^:]*\): \(.*\.desktop\)$/\1\t\2/p' \
  | awk -F'\t' '{
      pkg=$1; path=$2;
      base=path; sub(/.*\//,"",base); sub(/\.desktop$/,"",base);
      if (!(pkg in best)) best[pkg]=path;
      else if (base == pkg) best[pkg]=path;
    }
    END { for (p in best) print p "\t" best[p] }' \
  | while IFS="$(printf '\t')" read -r pkg path; do
      [ -n "$pkg" ] || continue
      printf '%s\n' "$manual" | grep -qx "$pkg" || continue
      if grep -q '^NoDisplay=true' "$path" 2>/dev/null; then continue; fi
      if grep -q '^Categories=.*Settings' "$path" 2>/dev/null; then continue; fi
      if grep -q '^Terminal=true' "$path" 2>/dev/null; then continue; fi
      if grep -q '^X-AppStream-Ignore=true' "$path" 2>/dev/null; then continue; fi
      if grep -q '^Categories=.*RemoteAccess' "$path" 2>/dev/null; then continue; fi
      if grep -q '^OnlyShowIn=' "$path" 2>/dev/null; then
        o=$(sed -n 's/^OnlyShowIn=//p' "$path" 2>/dev/null | head -n1 | tr -d ' ')
        found=0
        for d in $(printf '%s' "$desktop" | tr ':' ' '); do
          [ -z "$d" ] && continue
          case ";$o;" in *";$d;"*) found=1; break;; esac
        done
        [ "$found" = 0 ] && continue
      fi
      if grep -q '^NotShowIn=' "$path" 2>/dev/null; then
        o=$(sed -n 's/^NotShowIn=//p' "$path" 2>/dev/null | head -n1 | tr -d ' ')
        blocked=0
        for d in $(printf '%s' "$desktop" | tr ':' ' '); do
          [ -z "$d" ] && continue
          case ";$o;" in *";$d;"*) blocked=1; break;; esac
        done
        [ "$blocked" = 1 ] && continue
      fi
      t=$(sed -n 's/^Type=//p' "$path" 2>/dev/null | head -n1)
      if [ -n "$t" ] && [ "$t" != "Application" ]; then continue; fi
      name=$(awk -F= '/^Name=/{sub(/\r/,"");print $2;exit}' "$path" 2>/dev/null)
      [ -n "$name" ] || name="$pkg"
      ver=$(dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null)
      [ -n "$ver" ] || continue
      sec=$(dpkg-query -W -f='${Section}' "$pkg" 2>/dev/null)
      [ "$sec" = "admin" ] && continue
      desc=$(dpkg-query -W -f='${Description}' "$pkg" 2>/dev/null | head -n1)
      raw=$(sed -n 's/^Icon=//p' "$path" 2>/dev/null | head -n1)
      icon=""
      if [ -n "$raw" ]; then
        case "$raw" in
          /*)
            [ -f "$raw" ] && icon="$raw"
            ;;
          *)
            for c in \
              "/usr/share/icons/hicolor/512x512/apps/$raw.png" \
              "/usr/share/icons/hicolor/512x512/apps/$raw" \
              "/usr/share/icons/hicolor/256x256/apps/$raw.png" \
              "/usr/share/icons/hicolor/256x256/apps/$raw" \
              "/usr/share/icons/hicolor/128x128/apps/$raw.png" \
              "/usr/share/icons/hicolor/128x128/apps/$raw" \
              "/usr/share/icons/hicolor/96x96/apps/$raw.png" \
              "/usr/share/icons/hicolor/64x64/apps/$raw.png" \
              "/usr/share/icons/hicolor/48x48/apps/$raw.png" \
              "/usr/share/icons/hicolor/32x32/apps/$raw.png" \
              "/usr/share/icons/hicolor/24x24/apps/$raw.png" \
              "/usr/share/icons/hicolor/scalable/apps/$raw.svg" \
              "/usr/share/icons/hicolor/scalable/apps/$raw" \
              "/usr/share/pixmaps/$raw.png" \
              "/usr/share/pixmaps/$raw.svg" \
              "/usr/share/pixmaps/$raw" \
              "/usr/share/pixmaps/$raw.xpm" ; do
              [ -f "$c" ] && { icon="$c"; break; }
            done
            ;;
        esac
      fi
      printf '%s\t%s\t%s\t%s\t%s\n' "$pkg" "$name" "$ver" "$desc" "$icon"
    done"#;

    let output = if is_running_in_flatpak() {
        shell
            .command("flatpak-spawn")
            .args(["--host", "sh", "-c", SCRIPT])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {e}"))?
    } else {
        shell
            .command("sh")
            .args(["-c", SCRIPT])
            .output()
            .await
            .map_err(|e| format!("Failed to execute sh: {e}"))?
    };

    if !output.status.success() {
        return Err(format!(
            "dpkg listing failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }
        let summary = parts
            .get(3)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let icon_path = parts
            .get(4)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        packages.push(DebPackage {
            package: parts[0].trim().to_string(),
            name: parts[1].trim().to_string(),
            version: parts[2].trim().to_string(),
            summary,
            icon_path,
        });
    }

    Ok(packages)
}

/// Copies a deb app's icon off the host into the app image cache and returns
/// its absolute path (the frontend converts it into an `asset://` URL).
///
/// The sandbox cannot see `/usr/share/icons` or `/opt`, so the file is read
/// through `flatpak-spawn --host` (a plain `cp` when klia-store runs
/// unsandboxed). The source comes from the desktop entry of an installed
/// package, so we only accept an absolute, traversal-free path with an image
/// extension, and land it under a deterministic per-package name so repeat
/// renders never re-copy.
#[tauri::command]
pub async fn cache_deb_icon(
    app: tauri::AppHandle,
    app_id: String,
    icon_path: String,
) -> Result<String, String> {
    if !icon_path.starts_with('/') || icon_path.contains("..") {
        return Err("Invalid icon path".to_string());
    }
    let extension = std::path::Path::new(&icon_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "png" | "svg" | "jpg" | "jpeg" | "webp") {
        return Err(format!("Unsupported icon format: {extension}"));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let cache_images_dir = app_data_dir.join("cacheImages");
    fs::create_dir_all(&cache_images_dir)
        .map_err(|e| format!("Failed to create cacheImages directory: {}", e))?;

    let safe_id: String = app_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '+') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let dest_path = cache_images_dir.join(format!("deb-{safe_id}.{extension}"));

    if dest_path.exists() {
        return Ok(canonical_path_string(&dest_path));
    }

    let dest = dest_path.to_string_lossy().to_string();
    let shell = app.shell();
    let output = if is_running_in_flatpak() {
        shell
            .command("flatpak-spawn")
            .args([
                "--host", "sh", "-c", "cp -f \"$1\" \"$2\"", "sh", &icon_path, &dest,
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {e}"))?
    } else {
        shell
            .command("sh")
            .args(["-c", "cp -f \"$1\" \"$2\"", "sh", &icon_path, &dest])
            .output()
            .await
            .map_err(|e| format!("Failed to execute sh: {e}"))?
    };

    if !output.status.success() {
        return Err(format!(
            "Failed to copy icon {}: {}",
            icon_path,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    if !dest_path.exists() {
        return Err(format!("Icon was not copied: {}", icon_path));
    }

    Ok(canonical_path_string(&dest_path))
}

/// Accepts only well-formed Debian package names, so nothing user-supplied can
/// smuggle extra arguments into the host shell.
pub(crate) fn is_valid_deb_package_name(name: &str) -> bool {
    match name.chars().next() {
        Some(c) if c.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    name.len() <= 200
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '+' | '-' | '.'))
}

/// Uninstalls a deb package. Nothing is touched until two read-only gates pass:
/// the package must not be `Essential: yes`, and its apt simulation must not
/// drag essential packages or a system metapackage (`Section: metapackages`,
/// e.g. `pantheon` / `elementary-desktop`) down with it. The removal itself
/// runs on the host as `flatpak-spawn --host pkexec apt-get remove`, so polkit
/// authenticates through the desktop's own agent: no setuid inside the sandbox
/// and no change to the flatpak manifest. Progress is streamed over the same
/// `install-output` / `install-completed` events the flatpak flow already uses.
#[tauri::command]
pub async fn uninstall_deb_package(app: tauri::AppHandle, package: String) -> Result<(), String> {
    if !is_valid_deb_package_name(&package) {
        return Err(format!("Nombre de paquete inválido: {package}"));
    }

    // One read-only host shell: essential flag, metapackage section, and the
    // simulated removal set. `$1` is validated above, so no injection surface.
    const CHECK: &str = r#"LANG=C
pkg="$1"
ess=$(dpkg-query -W -f='${Essential}' "$pkg" 2>/dev/null)
sec=$(dpkg-query -W -f='${Section}' "$pkg" 2>/dev/null)
if [ "$ess" = "yes" ]; then
  printf 'BLOCKED|%s es un paquete esencial del sistema y no se puede desinstalar\n' "$pkg"
  exit 0
fi
if [ "$sec" = "metapackages" ]; then
  printf 'BLOCKED|%s es un metapaquete del sistema (Section=metapackages): desinstalarlo arrastraria el escritorio\n' "$pkg"
  exit 0
fi
sim=$(apt-get -s remove "$pkg" 2>&1)
removed=$(printf '%s\n' "$sim" | awk '/^Remv /{print $2}')
ess_all=$(dpkg-query -W -f='${Package}\t${Essential}\n' 2>/dev/null | awk -F'\t' '$2=="yes"{print $1}')
hit=""
for r in $removed; do
  printf '%s\n' "$ess_all" | grep -qx "$r" && hit="$hit $r"
done
if [ -n "$hit" ]; then
  printf 'BLOCKED|la desinstalacion arrastraria paquetes esenciales:%s\n' "$hit"
  exit 0
fi
printf 'OK|%s\n' "$(printf '%s\n' "$removed" | grep -c .)"
printf '%s\n' "$removed""#;

    let check_output = if is_running_in_flatpak() {
        app.shell()
            .command("flatpak-spawn")
            .args(["--host", "sh", "-c", CHECK, "sh", &package])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {e}"))?
    } else {
        app.shell()
            .command("sh")
            .args(["-c", CHECK, "sh", &package])
            .output()
            .await
            .map_err(|e| format!("Failed to execute sh: {e}"))?
    };

    let stdout = String::from_utf8_lossy(&check_output.stdout);
    let mut lines = stdout.lines();
    let verdict = lines.next().unwrap_or("").to_string();

    if let Some(reason) = verdict.strip_prefix("BLOCKED|") {
        let _ = app.emit("install-output", format!("\u{2717} {reason}"));
        let _ = app.emit("install-completed", 1);
        return Ok(());
    }

    let _ = app.emit(
        "install-output",
        format!("Paquetes que se eliminaran al desinstalar {package}:\n"),
    );
    for line in lines {
        let name = line.trim();
        if !name.is_empty() {
            let _ = app.emit("install-output", format!("  - {name}"));
        }
    }

    let _ = app.emit(
        "install-output",
        "\nSolicitando autenticacion (pkexec/polkit)...\n\n".to_string(),
    );

    // Reuse `sh` (already granted to the shell plugin) to launch pkexec, both
    // sandboxed (through the host) and unsandboxed.
    let shell = app.shell();
    let (mut rx, _child) = if is_running_in_flatpak() {
        shell
            .command("flatpak-spawn")
            .args([
                "--host",
                "sh",
                "-c",
                "exec pkexec apt-get remove -y \"$1\"",
                "sh",
                &package,
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn flatpak-spawn: {e}"))?
    } else {
        shell
            .command("sh")
            .args(["-c", "exec pkexec apt-get remove -y \"$1\"", "sh", &package])
            .spawn()
            .map_err(|e| format!("Failed to spawn pkexec: {e}"))?
    };

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                let _ = app.emit("install-output", String::from_utf8_lossy(&line).to_string());
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                let _ = app.emit("install-output", String::from_utf8_lossy(&line).to_string());
            }
            tauri_plugin_shell::process::CommandEvent::Error(err) => {
                let _ = app.emit("install-error", err);
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                let _ = app.emit("install-completed", payload.code.unwrap_or(-1));
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

