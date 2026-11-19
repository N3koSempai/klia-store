//! Local `.deb` installation support.
//!
//! Mirrors the local Flathub-bundle flow (`inspect_local_flatpak` /
//! `install_local_flatpak`) but for Debian packages. The inspection is strictly
//! read-only and runs as the app user: `dpkg-deb` is only ever used to *read*
//! the archive, never as root — the dpkg-deb(1) man page calls handling
//! untrusted package archives a security boundary. The installable surface is
//! reported to the frontend as structured data plus the raw material the user
//! readable data and the raw material the user can expand (control file,
//! maintainer scripts, resolved dependency plan).
//!
//! All host commands go through `flatpak-spawn --host` when klia-store itself is
//! sandboxed, the same pattern used by `debs.rs`.

use crate::*;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::process::{Command, Stdio};
use tauri::{Emitter, State};
use tauri_plugin_shell::ShellExt;

/// Everything the review modal needs. Summary fields are pre-computed here so
/// the UI can present an abstract view without parsing archives itself; the
/// `raw_*`/`*_raw` fields back the "show me the real thing" expansions.
#[derive(Serialize, Default)]
pub struct DebLocalInfo {
    // Identity
    pub package: String,
    pub version: String,
    pub architecture: String,
    pub host_architecture: String,
    pub maintainer: Option<String>,
    pub homepage: Option<String>,
    pub section: Option<String>,
    pub priority: Option<String>,
    pub source: Option<String>,
    pub description: Option<String>,
    pub essential: bool,
    pub multi_arch: Option<String>,
    // Size / integrity
    pub file_path: String,
    pub file_size_bytes: u64,
    pub installed_size_kb: u64,
    pub data_bytes: u64,
    pub file_count: u64,
    pub sha256: String,
    // Declared dependencies (control fields, kept verbatim)
    pub depends: Vec<String>,
    pub pre_depends: Vec<String>,
    pub recommends: Vec<String>,
    pub suggests: Vec<String>,
    pub conflicts: Vec<String>,
    pub breaks: Vec<String>,
    pub replaces: Vec<String>,
    pub provides: Vec<String>,
    // Provenance
    pub in_configured_repo: bool,
    pub repo_version: Option<String>,
    pub signed: bool,
    pub signature_members: Vec<String>,
    // Installed state
    pub already_installed: bool,
    pub installed_version: Option<String>,
    // Install-time surface
    pub maintainer_scripts: Vec<DebScript>,
    pub setuid_files: Vec<String>,
    pub setgid_files: Vec<String>,
    pub system_paths: Vec<DebSystemPath>,
    pub dir_summary: Vec<DebDirCount>,
    pub conffiles: Vec<String>,
    // Raw control file for the "raw details" expansion
    pub raw_control: String,
}

#[derive(Serialize, Default, Clone)]
pub struct DebScript {
    pub name: String,
    pub bytes: u64,
    pub content: String,
}

#[derive(Serialize, Default, Clone, PartialEq, Eq, Debug)]
pub struct DebSystemPath {
    pub path: String,
    pub category: String,
}

#[derive(Serialize, Default, Clone)]
pub struct DebDirCount {
    pub path: String,
    pub files: u64,
}

/// Read-only host script. Everything is emitted as `@@SECTION@@`-delimited
/// blocks so the Rust side does the parsing (testable) instead of the shell.
/// `$1` is the package path, always quoted by the caller through `shell_quote`,
/// and passed as a positional argument so no user input reaches the script text.
const INSPECT_SCRIPT: &str = r#"LANG=C
LC_ALL=C
f="$1"
pkg=$(dpkg-deb -f "$f" Package 2>/dev/null)
echo "@@META@@"
printf 'size\t%s\n' "$(stat -c %s "$f" 2>/dev/null)"
printf 'sha256\t%s\n' "$(sha256sum "$f" 2>/dev/null | awk '{print $1}')"
printf 'hostarch\t%s\n' "$(dpkg --print-architecture 2>/dev/null)"
echo "@@CONTROL@@"
dpkg-deb -f "$f" 2>/dev/null
echo "@@FILES@@"
dpkg-deb -c "$f" 2>/dev/null | head -n 20000
echo "@@ARMEMBERS@@"
ar t "$f" 2>/dev/null
echo "@@SCRIPTS@@"
tmp=$(mktemp -d 2>/dev/null)
if [ -n "$tmp" ]; then
  dpkg-deb -e "$f" "$tmp" 2>/dev/null
  for s in preinst postinst prerm postrm config triggers; do
    if [ -f "$tmp/$s" ]; then
      printf '@@SCRIPT:%s@@\n' "$s"
      cat "$tmp/$s" 2>/dev/null | head -n 1200
      printf '\n@@SCRIPT_END@@\n'
    fi
  done
  rm -rf "$tmp"
fi
echo "@@CONFFILES@@"
tmp2=$(mktemp -d 2>/dev/null)
if [ -n "$tmp2" ]; then
  dpkg-deb -e "$f" "$tmp2" 2>/dev/null
  if [ -f "$tmp2/conffiles" ]; then
    grep '^/' "$tmp2/conffiles" 2>/dev/null | head -n 400
  fi
  rm -rf "$tmp2"
fi
echo "@@INSTALLED@@"
if [ -n "$pkg" ]; then
  dpkg-query -W -f='${Status}\t${Version}\t${Essential}\t${Section}\n' "$pkg" 2>/dev/null
fi
echo "@@REPO@@"
if [ -n "$pkg" ]; then
  apt-cache policy "$pkg" 2>/dev/null
fi"#;

/// Section names the parser accepts. Restricting the set means a maintainer
/// script cannot accidentally (or deliberately) inject a new section.
const SECTIONS: &[&str] = &[
    "META",
    "CONTROL",
    "FILES",
    "CONFFILES",
    "ARMEMBERS",
    "SCRIPTS",
    "SCRIPT:preinst",
    "SCRIPT:postinst",
    "SCRIPT:prerm",
    "SCRIPT:postrm",
    "SCRIPT:config",
    "SCRIPT:triggers",
    "SCRIPT_END",
    "INSTALLED",
    "REPO",
    "UPDATE",
    "SIM",
    "SIMEXIT",
];

fn section_marker(line: &str) -> Option<&str> {
    if line.starts_with("@@") && line.ends_with("@@") && line.len() > 4 {
        let inner = &line[2..line.len() - 2];
        if SECTIONS.contains(&inner) {
            return Some(inner);
        }
    }
    None
}

/// Splits the script output into its `@@SECTION@@` blocks. Repeated blocks
/// (the per-script ones cannot repeat) append, which keeps the parser tolerant.
fn parse_sections(raw: &str) -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    let mut current: Option<String> = None;
    let mut buf = String::new();
    for line in raw.lines() {
        if let Some(name) = section_marker(line) {
            if let Some(prev) = current.take() {
                map.entry(prev).or_default().push_str(&buf);
            }
            buf.clear();
            current = Some(name.to_string());
        } else if current.is_some() {
            buf.push_str(line);
            buf.push('\n');
        }
    }
    if let Some(prev) = current.take() {
        map.entry(prev).or_default().push_str(&buf);
    }
    map
}

/// Parses a deb822 control block into ordered `(field, value)` pairs. Continuation
/// lines (leading space) are joined with `\n`, which is what makes `Description`
/// and `Conffiles` come out intact.
fn parse_control(text: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = out.last_mut() {
                last.1.push('\n');
                last.1.push_str(line.trim_start());
            }
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            out.push((key.trim().to_string(), value.trim().to_string()));
        }
    }
    out
}

fn field<'a>(fields: &'a [(String, String)], key: &str) -> Option<&'a str> {
    fields
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.as_str())
}

/// Splits a comma-separated control field (`Depends`, `Recommends`, …) keeping
/// the version constraints verbatim so the UI can show them as written.
fn split_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

/// One entry of `dpkg-deb -c`. The path can contain spaces, so the line is split
/// positionally on the first five fields instead of trusting `split_whitespace`.
#[derive(Debug, PartialEq)]
struct ContentsEntry {
    mode: String,
    size: u64,
    path: String,
}

fn token_starts(line: &str) -> Vec<usize> {
    let mut starts = Vec::new();
    let mut in_token = false;
    for (i, c) in line.char_indices() {
        if c.is_whitespace() {
            in_token = false;
        } else if !in_token {
            in_token = true;
            starts.push(i);
        }
    }
    starts
}

fn parse_contents_line(line: &str) -> Option<ContentsEntry> {
    let starts = token_starts(line);
    if starts.len() < 6 {
        return None;
    }
    let mode = &line[starts[0]..starts[1] - 1];
    let size = line[starts[2]..starts[3] - 1].parse::<u64>().ok()?;
    // Everything from the 6th token onwards is the path, spaces included.
    let path = line[starts[5]..].trim_end().to_string();
    Some(ContentsEntry {
        mode: mode.trim().to_string(),
        size,
        path,
    })
}

/// True when the mode string has the setuid/setgid bit set (position 3 and 6 of
/// `[type][rwx][rwx][rwx]`).
fn mode_has_bit(mode: &str, index: usize) -> bool {
    matches!(mode.chars().nth(index), Some('s') | Some('S'))
}

/// Maps an absolute install path to the category of system hook it represents.
/// `None` means the path is ordinary application payload.
fn classify_path(path: &str) -> Option<&'static str> {
    let p = path.trim_start_matches("./").trim_start_matches('/');
    let first = |needle: &str| p == needle || p.starts_with(&format!("{needle}/"));
    if first("etc/systemd/system")
        || first("lib/systemd/system")
        || first("usr/lib/systemd/system")
        || first("etc/init.d")
    {
        Some("service")
    } else if first("etc/cron.d")
        || first("etc/cron.daily")
        || first("etc/cron.hourly")
        || first("etc/cron.weekly")
        || first("etc/cron.monthly")
        || first("var/spool/cron")
        || first("etc/crontab")
    {
        Some("cron")
    } else if first("etc/xdg/autostart") {
        Some("autostart")
    } else if first("etc/profile.d") || first("etc/environment") || first("etc/bash.bashrc") {
        Some("shell-init")
    } else if first("etc/ld.so.conf.d") {
        Some("loader")
    } else if first("etc/sudoers.d") {
        Some("sudoers")
    } else if first("usr/share/polkit-1")
        || first("etc/polkit-1")
        || first("usr/share/dbus-1/system.d")
        || first("etc/dbus-1/system.d")
    {
        Some("privilege")
    } else if first("usr/lib/udev/rules.d")
        || first("lib/udev/rules.d")
        || first("etc/udev/rules.d")
    {
        Some("udev")
    } else if first("lib/modules") || first("etc/modprobe.d") || first("etc/modules-load.d") {
        Some("kernel")
    } else if first("etc/pam.d") || first("etc/security") || first("etc/ssh") {
        Some("auth")
    } else if first("etc/apt/apt.conf.d")
        || first("etc/apt/sources.list.d")
        || first("etc/apt/preferences.d")
    {
        Some("apt")
    } else if first("etc") {
        Some("config")
    } else if first("opt") {
        Some("vendor")
    } else {
        None
    }
}

#[derive(Debug, Default, PartialEq)]
struct SimPlan {
    new: Vec<String>,
    upgrade: Vec<String>,
    remove: Vec<String>,
    kept: u64,
    ok: bool,
    error: Option<String>,
}

/// Parses `apt-get -s` output. `LANG=C` is forced by the script, so the headers
/// are stable. `Remv` lines are the authoritative removal list; the indented
/// blocks only contribute the human-readable names.
fn parse_sim_plan(raw: &str) -> SimPlan {
    let mut plan = SimPlan {
        ok: true,
        ..Default::default()
    };
    let mut block: Option<&str> = None;
    let mut errors: Vec<String> = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();

        if line.starts_with(' ') && !trimmed.is_empty() && block.is_some() {
            let name = trimmed.split_whitespace().next().unwrap_or("").to_string();
            if !name.is_empty() {
                match block {
                    Some("new") => plan.new.push(name),
                    Some("upgrade") => plan.upgrade.push(name),
                    Some("remove") => plan.remove.push(name),
                    _ => {}
                }
            }
            continue;
        }
        // Any non-indented line ends the current indented block.
        if !line.starts_with(' ') {
            block = None;
        }

        if lower.starts_with("the following new packages will be installed") {
            block = Some("new");
        } else if lower.starts_with("the following packages will be upgraded") {
            block = Some("upgrade");
        } else if lower.starts_with("the following packages will be removed") {
            block = Some("remove");
        } else if let Some(rest) = line.strip_prefix("Remv ") {
            if let Some(name) = rest.split_whitespace().next() {
                if !plan.remove.iter().any(|n| n == name) {
                    plan.remove.push(name.to_string());
                }
            }
        } else if lower.starts_with("e: ") {
            errors.push(trimmed.to_string());
        } else if lower.contains("not upgraded") {
            // "0 upgraded, 1 newly installed, 0 to remove and 31 not upgraded."
            if let Some(idx) = lower.find(" and ") {
                let tail = &lower[idx + 5..];
                if let Some(num) = tail.split_whitespace().next() {
                    plan.kept = num.parse().unwrap_or(0);
                }
            }
        }
    }

    if !errors.is_empty() {
        plan.ok = false;
        plan.error = Some(errors.join(" "));
    }
    plan
}

fn parse_meta(raw: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in raw.lines() {
        if let Some((k, v)) = line.split_once('\t') {
            map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    map
}

/// `apt-cache policy` only prints a `Candidate:` line for packages that exist in
/// a configured repository. A local file with no repo counterpart prints
/// nothing at all (or `Candidate: (none)`), which is the provenance signal.
fn parse_repo_policy(raw: &str) -> (bool, Option<String>) {
    let mut candidate = None;
    for line in raw.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Candidate:") {
            let value = rest.trim();
            if !value.is_empty() && value != "(none)" {
                candidate = Some(value.to_string());
            }
        }
    }
    (candidate.is_some(), candidate)
}

fn parse_installed(raw: &str) -> (bool, Option<String>, bool, Option<String>) {
    // Status \t Version \t Essential \t Section
    let mut installed = false;
    let mut version = None;
    let mut essential = false;
    let mut section = None;
    for line in raw.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 2 {
            continue;
        }
        let status = parts[0].trim();
        if status.contains("installed") && !status.contains("not-installed") {
            installed = true;
            let v = parts[1].trim();
            if !v.is_empty() {
                version = Some(v.to_string());
            }
        }
        if parts.len() > 2 && parts[2].trim() == "yes" {
            essential = true;
        }
        if parts.len() > 3 && !parts[3].trim().is_empty() {
            section = Some(parts[3].trim().to_string());
        }
    }
    (installed, version, essential, section)
}

/// Aggregated view of `dpkg-deb -c` output: file count/size, the privileged
/// binaries, the system hooks and how the payload is distributed.
#[derive(Default)]
struct ContentsSummary {
    file_count: u64,
    data_bytes: u64,
    setuid: Vec<String>,
    setgid: Vec<String>,
    system_paths: Vec<DebSystemPath>,
    dir_summary: Vec<DebDirCount>,
}

fn parse_contents(raw: &str) -> ContentsSummary {
    let mut summary = ContentsSummary::default();
    let mut dirs: HashMap<String, u64> = HashMap::new();
    let mut seen_system: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in raw.lines() {
        let Some(entry) = parse_contents_line(line) else {
            continue;
        };
        if entry.mode.starts_with('d') || entry.mode.starts_with('l') {
            continue;
        }
        let abs = format!("/{}", entry.path.trim_start_matches("./"));
        let top = abs.split('/').nth(1).unwrap_or("").to_string();
        if !top.is_empty() {
            *dirs.entry(format!("/{top}")).or_insert(0) += 1;
        }
        if mode_has_bit(&entry.mode, 3) {
            summary.setuid.push(abs.clone());
        }
        if mode_has_bit(&entry.mode, 6) {
            summary.setgid.push(abs.clone());
        }
        if let Some(category) = classify_path(&abs) {
            if seen_system.insert(abs.clone()) {
                summary.system_paths.push(DebSystemPath {
                    path: abs,
                    category: category.to_string(),
                });
            }
        }
        summary.data_bytes += entry.size;
        summary.file_count += 1;
    }

    summary.dir_summary = dirs
        .into_iter()
        .map(|(path, files)| DebDirCount { path, files })
        .collect();
    summary.dir_summary.sort_by(|a, b| b.files.cmp(&a.files));
    summary
}

/// Runs a shell command on the host (through flatpak-spawn when sandboxed) and
/// returns its raw stdout.
async fn run_host_script(
    app: &tauri::AppHandle,
    script: &str,
    arg: &str,
) -> Result<String, String> {
    let shell = app.shell();
    let output = if is_running_in_flatpak() {
        shell
            .command("flatpak-spawn")
            .args(["--host", "sh", "-c", script, "sh", arg])
            .output()
            .await
            .map_err(|e| format!("Failed to execute flatpak-spawn: {e}"))?
    } else {
        shell
            .command("sh")
            .args(["-c", script, "sh", arg])
            .output()
            .await
            .map_err(|e| format!("Failed to execute sh: {e}"))?
    };
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Read-only inspection of a local `.deb`: metadata, contents listing, maintainer
/// scripts, dependency simulation and provenance. Never installs anything and
/// never runs as root.
#[tauri::command]
pub async fn inspect_local_deb(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<DebLocalInfo, String> {
    if !file_path.starts_with('/') || file_path.contains('\n') {
        return Err("Invalid package path".to_string());
    }
    if !std::path::Path::new(&file_path).exists() && !is_running_in_flatpak() {
        return Err(format!("File not found: {file_path}"));
    }

    let raw = run_host_script(&app, INSPECT_SCRIPT, &file_path).await?;
    build_deb_info(&file_path, &raw)
}

/// Turns the raw `INSPECT_SCRIPT` output into the review payload. Kept separate
/// from the Tauri command so the whole pipeline (shell output -> parsing ->
/// classification) is testable without an `AppHandle`.
fn build_deb_info(file_path: &str, raw: &str) -> Result<DebLocalInfo, String> {
    let sections = parse_sections(raw);

    let control_text = sections.get("CONTROL").cloned().unwrap_or_default();
    if control_text.trim().is_empty() {
        return Err("Not a Debian package (dpkg-deb could not read its control file)".to_string());
    }
    let fields = parse_control(&control_text);

    let meta = parse_meta(sections.get("META").map(String::as_str).unwrap_or(""));
    let file_size_bytes = meta.get("size").and_then(|v| v.parse().ok()).unwrap_or(0);
    let sha256 = meta.get("sha256").cloned().unwrap_or_default();
    let host_architecture = meta.get("hostarch").cloned().unwrap_or_default();

    let package = field(&fields, "Package").unwrap_or("").to_string();
    let version = field(&fields, "Version").unwrap_or("").to_string();
    let architecture = field(&fields, "Architecture").unwrap_or("").to_string();
    let installed_size_kb = field(&fields, "Installed-Size")
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0);

    let contents = parse_contents(sections.get("FILES").map(String::as_str).unwrap_or(""));
    let data_bytes = contents.data_bytes;
    let file_count = contents.file_count;
    let setuid_files = contents.setuid;
    let setgid_files = contents.setgid;
    let system_paths = contents.system_paths;
    let dir_summary = contents.dir_summary;

    let mut maintainer_scripts = Vec::new();
    for name in [
        "preinst", "postinst", "prerm", "postrm", "config", "triggers",
    ] {
        let key = format!("SCRIPT:{name}");
        if let Some(content) = sections.get(&key) {
            maintainer_scripts.push(DebScript {
                name: name.to_string(),
                bytes: content.len() as u64,
                content: content.trim_end().to_string(),
            });
        }
    }

    let signature_members: Vec<String> = sections
        .get("ARMEMBERS")
        .map(|raw| {
            raw.lines()
                .map(str::trim)
                .filter(|l| l.starts_with("_gpg"))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let signed = !signature_members.is_empty();

    let (in_configured_repo, repo_version) =
        parse_repo_policy(sections.get("REPO").map(String::as_str).unwrap_or(""));

    let (already_installed, installed_version, installed_essential, _installed_section) =
        parse_installed(sections.get("INSTALLED").map(String::as_str).unwrap_or(""));

    let essential = field(&fields, "Essential")
        .map(|v| v.eq_ignore_ascii_case("yes") || v == "1")
        .unwrap_or(false)
        || installed_essential;

    // `conffiles` lives as a separate control member, not as a field of the
    // `control` file, so it is read from its own section with a field fallback
    // for the (rare) packages that declare it inline.
    let mut conffiles: Vec<String> = sections
        .get("CONFFILES")
        .map(|v| {
            v.lines()
                .map(str::trim)
                .filter(|l| l.starts_with('/'))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    if conffiles.is_empty() {
        conffiles = field(&fields, "Conffiles")
            .map(|v| {
                v.lines()
                    .map(str::trim)
                    .filter(|l| l.starts_with('/'))
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();
    }

    let description = field(&fields, "Description").map(|v| {
        // First line is the synopsis, the rest is the long description.
        v.to_string()
    });

    Ok(DebLocalInfo {
        package,
        version,
        architecture,
        host_architecture,
        maintainer: field(&fields, "Maintainer").map(String::from),
        homepage: field(&fields, "Homepage").map(String::from),
        section: field(&fields, "Section").map(String::from),
        priority: field(&fields, "Priority").map(String::from),
        source: field(&fields, "Source").map(String::from),
        description,
        essential,
        multi_arch: field(&fields, "Multi-Arch").map(String::from),
        file_path: file_path.to_string(),
        file_size_bytes,
        installed_size_kb,
        data_bytes,
        file_count,
        sha256,
        depends: split_list(field(&fields, "Depends").unwrap_or("")),
        pre_depends: split_list(field(&fields, "Pre-Depends").unwrap_or("")),
        recommends: split_list(field(&fields, "Recommends").unwrap_or("")),
        suggests: split_list(field(&fields, "Suggests").unwrap_or("")),
        conflicts: split_list(field(&fields, "Conflicts").unwrap_or("")),
        breaks: split_list(field(&fields, "Breaks").unwrap_or("")),
        replaces: split_list(field(&fields, "Replaces").unwrap_or("")),
        provides: split_list(field(&fields, "Provides").unwrap_or("")),
        in_configured_repo,
        repo_version,
        signed,
        signature_members,
        already_installed,
        installed_version,
        maintainer_scripts,
        setuid_files,
        setgid_files,
        system_paths,
        dir_summary,
        conffiles,
        raw_control: control_text,
    })
}

/// Pre-flight gates run on the host, read-only, immediately before the install.
/// These are defense in depth: the modal already blocks on the same conditions,
/// but the backend must never hand an architecture mismatch or a metapackage to
/// `apt-get` even if the frontend is wrong.
const CHECK_SCRIPT: &str = r#"LANG=C
LC_ALL=C
f="$1"
pkg=$(dpkg-deb -f "$f" Package 2>/dev/null)
[ -n "$pkg" ] || { printf 'BLOCK|the file is not a readable Debian package\n'; exit 0; }
arch=$(dpkg-deb -f "$f" Architecture 2>/dev/null)
host=$(dpkg --print-architecture 2>/dev/null)
if [ "$arch" != "all" ] && [ "$arch" != "$host" ]; then
  printf 'BLOCK|architecture %s does not match this system (%s)\n' "$arch" "$host"
  exit 0
fi
ess=$(dpkg-deb -f "$f" Essential 2>/dev/null)
[ "$ess" = "yes" ] && { printf 'BLOCK|%s is an essential system package\n' "$pkg"; exit 0; }
sec=$(dpkg-deb -f "$f" Section 2>/dev/null)
[ "$sec" = "metapackages" ] && { printf 'BLOCK|%s is a system metapackage (Section=metapackages)\n' "$pkg"; exit 0; }
inst=$(dpkg-query -W -f='${Essential}' "$pkg" 2>/dev/null)
[ "$inst" = "yes" ] && { printf 'BLOCK|%s is installed as an essential package\n' "$pkg"; exit 0; }
sim=$(apt-get -s -o APT::Get::HideAutoRemove=true install "$f" 2>&1)
code=$?
if [ $code -ne 0 ]; then
  # The raw plan goes to stdout after the marker so the caller can turn it into
  # a readable reason instead of a truncated dump of apt's boilerplate.
  printf 'BLOCK|simulation-failed\n'
  printf '%s\n' "$sim"
  exit 0
fi
removed=$(printf '%s\n' "$sim" | awk '/^Remv /{print $2}')
ess_all=$(dpkg-query -W -f='${Package}\t${Essential}\n' 2>/dev/null | awk -F'\t' '$2=="yes"{print $1}')
hit=""
for r in $removed; do
  printf '%s\n' "$ess_all" | grep -qx "$r" && hit="$hit $r"
done
if [ -n "$hit" ]; then
  printf 'BLOCK|the install would remove essential packages:%s\n' "$hit"
  exit 0
fi
printf 'OK|%s\n' "$(printf '%s\n' "$removed" | grep -c .)"
printf '%s\n' "$removed""#;

/// Authorized dependency check. Resolving a package's dependencies against the
/// repositories is only accurate with fresh package lists, and refreshing them
/// is the one step that needs write access to `/var/lib/apt` — so the check runs
/// as root through `pkexec`. Polkit's agent asks the user for the password;
/// klia-store never sees, forwards or stores it. The answer comes back in the
/// same `@@SECTION@@` framing as the inspection, so parsing stays in Rust.
const DEPCHECK_SCRIPT: &str = r#"LANG=C
LC_ALL=C
f="$1"
echo "@@UPDATE@@"
apt-get update -qq 2>&1 | tail -n 40
echo "@@SIM@@"
sim=$(apt-get -s -o APT::Get::HideAutoRemove=true install "$f" 2>&1)
code=$?
printf '%s\n' "$sim" | head -n 800
echo "@@SIMEXIT@@"
printf '%s\n' "$code""#;

/// Extracts the unmet-dependency block apt prints when the plan is impossible:
///
/// ```text
/// The following packages have unmet dependencies:
///  goverlay : Depends: libqt6pas6 but it is not installable
///             Recommends: vkbasalt but it is not going to be installed
/// E: Unable to correct problems, you have held broken packages.
/// ```
///
/// Continuation lines have no subject of their own, so the last one is reused.
/// This is the difference between "the check could not run" and "the check ran
/// and the package cannot be installed", which the UI must not conflate.
fn parse_unmet_dependencies(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut in_block = false;
    let mut subject = String::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("The following packages have unmet dependencies") {
            in_block = true;
            continue;
        }
        if !in_block || trimmed.is_empty() {
            continue;
        }
        // The block ends at the first line that is not indented (`E: …`).
        if !line.starts_with(' ') {
            break;
        }
        let (subj, relation) = match trimmed.split_once(" : ") {
            Some((s, r)) => (s.trim().to_string(), r.trim().to_string()),
            None => (subject.clone(), trimmed.to_string()),
        };
        if !subj.is_empty() {
            subject = subj;
            out.push(format!("{subject} → {relation}"));
        }
    }
    out
}

/// apt prints this banner before every `-s` plan. It explains nothing to a
/// person reading a message ("apt-get needs root privileges for real
/// execution") and it is the line users quote back when they think the install
/// itself was simulated.
const APT_SIMULATION_NOTE: &str = "NOTE: This is only a simulation!";

/// Removes apt's simulation banner (and its continuation lines) from output
/// shown to the user.
fn strip_simulation_note(raw: &str) -> String {
    let mut skipping = false;
    let mut out: Vec<&str> = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(APT_SIMULATION_NOTE) {
            skipping = true;
            continue;
        }
        if skipping {
            // The banner continues on indented lines.
            if trimmed.is_empty() || line.starts_with(' ') || line.starts_with('\t') {
                continue;
            }
            skipping = false;
        }
        out.push(line);
    }
    out.join("\n").trim().to_string()
}

/// Turns a failed pre-install simulation into a message that says what failed
/// and what to do about it, instead of echoing apt's output verbatim.
fn gate_block_reason(raw: &str) -> String {
    let cleaned = strip_simulation_note(raw);
    let unmet = parse_unmet_dependencies(&cleaned);
    if !unmet.is_empty() {
        return format!(
            "Cannot install: your configured repositories cannot satisfy {}: {}. \
             Enable the repository that provides {} and try again.",
            if unmet.len() == 1 {
                "this requirement"
            } else {
                "these requirements"
            },
            unmet.join("; "),
            if unmet.len() == 1 { "it" } else { "them" },
        );
    }
    let detail = cleaned
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with("E:"))
        .unwrap_or("apt could not resolve an installation plan for this file.");
    format!("Cannot install: {detail}")
}

/// Outcome of the authorized dependency check: the plan for the supplied file,
/// plus the `apt-get update` transcript (empty unless the refresh failed).
#[derive(Serialize, Default)]
pub struct DebDependencyCheck {
    pub plan_new: Vec<String>,
    pub plan_upgrade: Vec<String>,
    pub plan_remove: Vec<String>,
    pub plan_kept: u64,
    pub ok: bool,
    pub error: Option<String>,
    /// Requirements apt cannot satisfy with the configured repositories.
    pub unmet: Vec<String>,
    pub update_raw: String,
    pub simulation_raw: String,
    /// True when the check ran as root (package lists refreshed).
    pub privileged: bool,
    /// Human-readable caveat when the result is degraded (no agent, stale lists).
    pub notice: Option<String>,
}

/// Parses `DEPCHECK_SCRIPT` output. Split from the command so the parsing stays
/// testable without an `AppHandle` or a password prompt.
fn build_dependency_check(raw: &str) -> DebDependencyCheck {
    let sections = parse_sections(raw);
    let simulation_raw = sections.get("SIM").cloned().unwrap_or_default();
    let plan = parse_sim_plan(&simulation_raw);
    let sim_exit = sections
        .get("SIMEXIT")
        .map(|s| s.trim())
        .and_then(|s| s.parse::<i32>().ok())
        // Missing marker means pkexec/the shell never reached the simulation.
        .unwrap_or(-1);
    let error = plan.error.clone().or_else(|| {
        if sim_exit != 0 {
            Some(format!("apt-get exited with code {sim_exit}"))
        } else {
            None
        }
    });
    DebDependencyCheck {
        plan_new: plan.new,
        plan_upgrade: plan.upgrade,
        plan_remove: plan.remove,
        plan_kept: plan.kept,
        ok: plan.ok && sim_exit == 0,
        error,
        unmet: parse_unmet_dependencies(&simulation_raw),
        update_raw: sections.get("UPDATE").cloned().unwrap_or_default(),
        // Shown behind "Show apt output": apt's boilerplate banner adds nothing
        // and is what makes the panel look like the install was simulated.
        simulation_raw: strip_simulation_note(&simulation_raw),
        privileged: false,
        notice: None,
    }
}

/// Why the authorized run could not produce a plan.
#[derive(Debug, PartialEq)]
enum AuthFailure {
    /// polkit has no agent registered for this session, so no password dialog
    /// can ever appear (typical when the desktop's polkit agent is not running).
    NoAgent,
    /// The user dismissed the dialog, typed a wrong password, or is not
    /// authorized for the action.
    Denied,
    /// Anything else: surfaced verbatim.
    Other(String),
}

/// Classifies a failed `pkexec` run. `pkexec --disable-internal-agent` reports a
/// missing agent through stderr; 126/127 are polkit's "not authorized" codes
/// once an agent did answer.
fn classify_auth_failure(code: i32, stderr: &str) -> AuthFailure {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("authentication agent") || lower.contains("/dev/tty") {
        return AuthFailure::NoAgent;
    }
    if code == 126 || code == 127 {
        return AuthFailure::Denied;
    }
    AuthFailure::Other(format!("exit code {code}: {}", stderr.trim()))
}

/// Builds the command the check runs. Quoting has three layers — the script,
/// `pkexec`, and (when sandboxed) `flatpak-spawn` — so it is unit-tested.
///
/// `--disable-internal-agent` is deliberate: pkexec's fallback text agent needs a
/// controlling terminal, which a GUI app does not have (and in `tauri dev` it
/// would prompt in the build terminal). Without the flag the failure is a hang
/// or an unreadable /dev/tty error; with it, a session without a polkit agent
/// fails immediately and cleanly so we can fall back.
fn build_dependency_check_cmd(is_flatpak: bool, authorized: bool, file_path: &str) -> String {
    let inner = if authorized {
        format!(
            "pkexec --disable-internal-agent sh -c {} sh {}",
            shell_quote(DEPCHECK_SCRIPT),
            shell_quote(file_path)
        )
    } else {
        format!(
            "sh -c {} sh {}",
            shell_quote(DEPCHECK_SCRIPT),
            shell_quote(file_path)
        )
    };
    if is_flatpak {
        format!("flatpak-spawn --host sh -c {}", shell_quote(&inner))
    } else {
        inner
    }
}

async fn run_dependency_check(
    app: &tauri::AppHandle,
    file_path: &str,
    authorized: bool,
) -> Result<tauri_plugin_shell::process::Output, String> {
    let cmd = build_dependency_check_cmd(is_running_in_flatpak(), authorized, file_path);
    app.shell()
        .command("sh")
        .args(["-c", &cmd])
        .output()
        .await
        .map_err(|e| format!("Could not start the dependency check: {e}"))
}

/// Resolves the package's real dependency set with administrator rights.
///
/// The password belongs to polkit: the desktop's agent shows the dialog, so
/// klia-store never sees, forwards or stores it, and it works the same inside
/// the Flatpak sandbox (relayed through `flatpak-spawn --host`). If the session
/// has no polkit agent at all there is no way to ask, so the check degrades to
/// the unprivileged simulation — still the real resolver, just without refreshed
/// package lists — and says so in `notice` instead of failing the feature.
#[tauri::command]
pub async fn check_local_deb_dependencies(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<DebDependencyCheck, String> {
    if !file_path.starts_with('/') || file_path.contains('\n') {
        return Err("Invalid package path".to_string());
    }
    if !std::path::Path::new(&file_path).exists() && !is_running_in_flatpak() {
        return Err(format!("File not found: {file_path}"));
    }

    let output = run_dependency_check(&app, &file_path, true).await?;
    let code = output.status.code().unwrap_or(-1);
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let raw = String::from_utf8_lossy(&output.stdout).to_string();

    if code == 0 && raw.contains("@@SIM@@") {
        let mut report = build_dependency_check(&raw);
        report.privileged = true;
        return Ok(report);
    }

    match classify_auth_failure(code, &stderr) {
        AuthFailure::Denied => Err(
            "Administrator access was denied or cancelled, so dependencies were not checked."
                .to_string(),
        ),
        AuthFailure::NoAgent => {
            // No password dialog exists in this session: answer with what apt can
            // resolve from the lists already on disk, and label it.
            let fallback = run_dependency_check(&app, &file_path, false).await?;
            let fallback_raw = String::from_utf8_lossy(&fallback.stdout).to_string();
            if !fallback_raw.contains("@@SIM@@") {
                let err = String::from_utf8_lossy(&fallback.stderr);
                return Err(format!(
                    "The dependency check produced no result. {}",
                    err.trim()
                ));
            }
            let mut report = build_dependency_check(&fallback_raw);
            report.privileged = false;
            report.notice = Some(
                "No polkit authentication agent is running in this session, so the administrator password could not be requested. This plan was resolved against the package lists already on disk; it may be out of date."
                    .to_string(),
            );
            Ok(report)
        }
        AuthFailure::Other(reason) => Err(format!("The dependency check failed: {reason}")),
    }
}

/// Installs a local `.deb` as root through `pkexec apt-get install`, streaming
/// progress over the same `pty-output` / `pty-error` events as the Flatpak flow
/// and reporting the exit code on `pty-exit`. `apt-get install` is preferred
/// over `dpkg -i` because it resolves dependencies from the configured repos in
/// the same transaction; `dpkg -i` would leave the package unconfigured and
/// require `apt --fix-broken install` afterwards.
#[tauri::command]
pub async fn install_local_deb(
    app: tauri::AppHandle,
    processes: State<'_, ProcessMap>,
    file_path: String,
    allow_downgrade: bool,
) -> Result<(), String> {
    if !file_path.starts_with('/') || file_path.contains('\n') {
        return Err("Invalid package path".to_string());
    }

    let process_key = format!("localdeb::{}", file_path);

    // Refuse a second concurrent install of the same file (double-click races).
    {
        let map = processes.lock().unwrap_or_else(|e| e.into_inner());
        if map.contains_key(&process_key) {
            return Err("An installation for this file is already in progress".to_string());
        }
    }

    let check = run_host_script(&app, CHECK_SCRIPT, &file_path).await?;
    let mut lines = check.lines();
    let verdict = lines.next().unwrap_or("");
    if let Some(reason) = verdict.strip_prefix("BLOCK|") {
        let reason = reason.trim();
        // A failed simulation carries apt's raw plan on the following lines, so
        // it turns into a message that names what cannot be satisfied.
        if reason == "simulation-failed" {
            let raw = lines.collect::<Vec<_>>().join("\n");
            return Err(gate_block_reason(&raw));
        }
        return Err(reason.to_string());
    }

    let downgrade = if allow_downgrade {
        "--allow-downgrades "
    } else {
        ""
    };
    let quoted_path = shell_quote(&file_path);
    let inner = format!("pkexec apt-get install -y {downgrade}{quoted_path}");
    let host_cmd = if is_running_in_flatpak() {
        format!("flatpak-spawn --host sh -c {}", shell_quote(&inner))
    } else {
        inner
    };
    // `script -q /dev/null -c` gives apt a pty so its progress bars and pkexec's
    // prompt behave like in the Flatpak install flow.
    let cmd_str = format!("LANG=C script -q /dev/null -c {}", shell_quote(&host_cmd));

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
                            let _ =
                                app_clone.emit("pty-output", (key_clone.clone(), line.to_string()));
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
        let reader = std::io::BufReader::new(stderr);
        for line in std::io::BufRead::lines(reader) {
            if let Ok(line) = line {
                let _ = app_clone2.emit("pty-error", (key_clone2.clone(), line));
            }
        }
    });

    let app_clone3 = app.clone();
    let key_clone3 = process_key.clone();
    let processes_clone = processes.inner().clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let mut map = processes_clone.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pty_process) = map.get_mut(&key_clone3) {
            match pty_process.child.try_wait() {
                Ok(Some(status)) => {
                    let code = status.code().unwrap_or(-1);
                    let _ = app_clone3.emit("pty-terminated", key_clone3.clone());
                    let _ = app_clone3.emit("pty-exit", (key_clone3.clone(), code));
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
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sections_and_ignores_unknown_markers() {
        let raw = "@@META@@\nsize\t123\n@@CONTROL@@\nPackage: x\n@@BOGUS@@\nstill control\n@@SIM@@\nInst x\n";
        let s = parse_sections(raw);
        assert_eq!(s.get("META").unwrap().trim(), "size\t123");
        assert!(s.get("CONTROL").unwrap().contains("Package: x"));
        assert!(s.get("CONTROL").unwrap().contains("@@BOGUS@@"));
        assert_eq!(s.get("SIM").unwrap().trim(), "Inst x");
    }

    #[test]
    fn parses_control_with_continuations() {
        let text = "Package: demopkg\nVersion: 1.0-1\nDescription: synopsis\n long line one\n long line two\nConffiles:\n /etc/a.conf\n /etc/b.conf\n";
        let f = parse_control(text);
        assert_eq!(field(&f, "Package"), Some("demopkg"));
        assert_eq!(
            field(&f, "Description"),
            Some("synopsis\nlong line one\nlong line two")
        );
        let conf = field(&f, "Conffiles").unwrap();
        assert!(conf.contains("/etc/a.conf"));
    }

    #[test]
    fn parses_contents_lines_with_paths_containing_spaces() {
        let line = "-rwsr-xr-x root/root 18 2025-11-17 20:57 ./usr/bin/my app";
        let e = parse_contents_line(line).unwrap();
        assert_eq!(e.mode, "-rwsr-xr-x");
        assert_eq!(e.size, 18);
        assert_eq!(e.path, "./usr/bin/my app");
        assert!(mode_has_bit(&e.mode, 3));
        assert!(!mode_has_bit(&e.mode, 6));
    }

    #[test]
    fn skips_directory_and_symlink_entries() {
        assert!(parse_contents_line("drwxr-xr-x root/root 0 2025-11-17 20:57 ./usr/").is_some());
        assert!(
            parse_contents_line("lrwxrwxrwx root/root 0 2025-11-17 20:57 ./usr/lib/x").is_some()
        );
        assert!(parse_contents_line("garbage").is_none());
    }

    #[test]
    fn classifies_system_paths() {
        assert_eq!(
            classify_path("/etc/systemd/system/foo.service"),
            Some("service")
        );
        assert_eq!(classify_path("/etc/cron.daily/foo"), Some("cron"));
        assert_eq!(classify_path("/etc/sudoers.d/foo"), Some("sudoers"));
        assert_eq!(
            classify_path("/usr/share/polkit-1/actions/x.policy"),
            Some("privilege")
        );
        assert_eq!(classify_path("/etc/ld.so.conf.d/x.conf"), Some("loader"));
        assert_eq!(classify_path("/etc/apt/apt.conf.d/99x"), Some("apt"));
        assert_eq!(classify_path("/usr/bin/demopkg"), None);
        assert_eq!(classify_path("/opt/vendor/bin/x"), Some("vendor"));
    }

    #[test]
    fn parses_apt_simulation_plan() {
        let raw = "NOTE: This is only a simulation!\nReading package lists...\nThe following NEW packages will be installed:\n  jq\n  libjq1\n0 upgraded, 2 newly installed, 0 to remove and 31 not upgraded.\nInst libjq1 (1.6 local-deb [amd64])\nInst jq (1.6 local-deb [amd64])\nRemv oldpkg [1.0]\n";
        let plan = parse_sim_plan(raw);
        assert_eq!(plan.new, vec!["jq", "libjq1"]);
        assert_eq!(plan.remove, vec!["oldpkg"]);
        assert_eq!(plan.kept, 31);
        assert!(plan.ok);
    }

    #[test]
    fn flags_simulation_errors() {
        let plan = parse_sim_plan("E: Unable to locate package nope\n");
        assert!(!plan.ok);
        assert!(plan.error.unwrap().contains("Unable to locate"));
    }

    #[test]
    fn detects_repo_provenance() {
        let (in_repo, ver) = parse_repo_policy(
            "demopkg:\n  Installed: (none)\n  Candidate: 1.0-1\n  Version table:\n",
        );
        assert!(in_repo);
        assert_eq!(ver.as_deref(), Some("1.0-1"));
        let (in_repo, ver) = parse_repo_policy("");
        assert!(!in_repo);
        assert!(ver.is_none());
        let (in_repo, _) = parse_repo_policy("demopkg:\n  Installed: 1.0\n  Candidate: (none)\n");
        assert!(!in_repo);
    }

    #[test]
    fn parses_dependency_check_output() {
        let raw = "@@UPDATE@@\n@@SIM@@\nThe following NEW packages will be installed:\n  jq\n0 upgraded, 1 newly installed, 0 to remove and 3 not upgraded.\nInst jq (1.6 local-deb [amd64])\n@@SIMEXIT@@\n0\n";
        let check = build_dependency_check(raw);
        assert!(check.ok);
        assert_eq!(check.plan_new, vec!["jq"]);
        assert_eq!(check.plan_kept, 3);
        assert!(check.error.is_none());
        assert!(check.update_raw.trim().is_empty());
    }

    #[test]
    fn dependency_check_surfaces_failures() {
        let raw = "@@UPDATE@@\nErr:1 http://repo unstable InRelease\n@@SIM@@\nE: Unable to locate package nope\n@@SIMEXIT@@\n100\n";
        let check = build_dependency_check(raw);
        assert!(!check.ok);
        assert!(check.error.unwrap().contains("Unable to locate"));
        assert!(check.update_raw.contains("Err:1"));
    }

    #[test]
    fn dependency_check_without_marker_is_a_failure() {
        let check = build_dependency_check("polkit: some error\n");
        assert!(!check.ok);
        assert!(check.error.unwrap().contains("code -1"));
    }

    #[test]
    fn builds_dependency_check_command_with_quoting() {
        // `set --` parses the line with a real shell but runs nothing, so this
        // checks the quoting layers end to end (script, pkexec, flatpak-spawn).
        fn shell_argv(cmd: &str) -> Vec<String> {
            let output = std::process::Command::new("sh")
                .args([
                    "-c",
                    // NUL-separated so multi-line arguments (the script) stay one entry.
                    &format!("set -- {cmd}; for a in \"$@\"; do printf '%s\\0' \"$a\"; done"),
                ])
                .output()
                .expect("parse command with sh");
            String::from_utf8_lossy(&output.stdout)
                .trim_end_matches('\0')
                .split('\0')
                .map(String::from)
                .collect()
        }

        let plain = build_dependency_check_cmd(false, true, "/tmp/my app.deb");
        assert_eq!(
            shell_argv(&plain),
            vec![
                "pkexec".to_string(),
                "--disable-internal-agent".to_string(),
                "sh".to_string(),
                "-c".to_string(),
                DEPCHECK_SCRIPT.to_string(),
                "sh".to_string(),
                "/tmp/my app.deb".to_string(),
            ]
        );

        // A quote inside the path must not break out of any layer.
        let quoted = build_dependency_check_cmd(false, true, "/tmp/a'b.deb");
        assert_eq!(
            shell_argv(&quoted).last().map(String::as_str),
            Some("/tmp/a'b.deb")
        );

        let sandboxed = build_dependency_check_cmd(true, true, "/tmp/a'b.deb");
        let argv = shell_argv(&sandboxed);
        assert_eq!(argv[0], "flatpak-spawn");
        assert_eq!(argv[1], "--host");
        // The relayed command is one argument and reconstructs the plain form.
        assert_eq!(argv.last().map(String::as_str), Some(quoted.as_str()));

        // The degraded path drops pkexec entirely.
        let unprivileged = build_dependency_check_cmd(false, false, "/tmp/x.deb");
        assert_eq!(shell_argv(&unprivileged)[0], "sh");
        assert!(!unprivileged.contains("pkexec"));
    }

    #[test]
    fn classifies_pkexec_failures() {
        // Real messages from `pkexec` on a session without an agent.
        assert_eq!(
            classify_auth_failure(
                127,
                "Error executing command as another user: No authentication agent found."
            ),
            AuthFailure::NoAgent
        );
        assert_eq!(
            classify_auth_failure(
                126,
                "Error creating textual authentication agent: Error opening current controlling terminal for the process (`/dev/tty'): No such device or address"
            ),
            AuthFailure::NoAgent
        );
        assert_eq!(
            classify_auth_failure(126, "Error executing command as another user: Not authorized"),
            AuthFailure::Denied
        );
        match classify_auth_failure(1, "boom") {
            AuthFailure::Other(reason) => assert!(reason.contains("boom")),
            other => panic!("expected Other, got {other:?}"),
        }
    }

    #[test]
    fn turns_a_failed_simulation_into_a_readable_reason() {
        // Verbatim shape of `apt-get -s install goverlay...deb` on a system whose
        // repositories lack libqt6pas6.
        let raw = "NOTE: This is only a simulation!\n      apt-get needs root privileges for real execution.\n      Keep also in mind that locking is deactivated,\n      so don't depend on the relevance to the real current situation!\nReading package lists...\nBuilding dependency tree...\nReading state information...\nSome packages could not be installed. This may mean that you have\nrequested an impossible situation or if you are using the unstable\ndistribution that some required packages have not yet been created\nor been moved out of Incoming.\nThe following information may help to resolve the situation:\n\nThe following packages have unmet dependencies:\n goverlay : Depends: libqt6pas6 but it is not installable\n            Recommends: vkbasalt but it is not going to be installed\nE: Unable to correct problems, you have held broken packages.\n";
        let reason = gate_block_reason(raw);
        assert!(reason.starts_with("Cannot install:"), "{reason}");
        assert!(reason.contains("libqt6pas6"), "{reason}");
        assert!(reason.contains("vkbasalt"), "{reason}");
        assert!(reason.contains("Enable the repository"), "{reason}");
        // The banner that makes people think the install was simulated is gone.
        assert!(!reason.contains("simulation"), "{reason}");
        assert!(!reason.contains("root privileges"), "{reason}");

        // A failure with no unmet-dependency block falls back to apt's error line.
        let other = "NOTE: This is only a simulation!\n      apt-get needs root privileges for real execution.\nE: Unsupported file /tmp/x.deb given on commandline\n";
        assert_eq!(
            gate_block_reason(other),
            "Cannot install: E: Unsupported file /tmp/x.deb given on commandline"
        );
    }

    #[test]
    fn strips_the_apt_simulation_banner() {
        let raw = "NOTE: This is only a simulation!\n      apt-get needs root privileges for real execution.\n      Keep also in mind that locking is deactivated,\n      so don't depend on the relevance to the real current situation!\nReading package lists...\nInst demopkg (1.0-1 local-deb [amd64])\nConf demopkg (1.0-1 local-deb [amd64])\n";
        let cleaned = strip_simulation_note(raw);
        assert!(cleaned.starts_with("Reading package lists..."), "{cleaned}");
        assert!(cleaned.contains("Inst demopkg"));
        assert!(!cleaned.contains("simulation"));
    }

    #[test]
    fn parses_unmet_dependencies() {
        let raw = "Reading package lists...\n\nSome packages could not be installed. This may mean that you have\n\nrequested an impossible situation or if you are using the unstable\n\nor been moved out of Incoming.\n\nThe following packages have unmet dependencies:\n goverlay : Depends: libqt6pas6 but it is not installable\n            Recommends: vkbasalt but it is not going to be installed\nE: Unable to correct problems, you have held broken packages.\n";
        assert_eq!(
            parse_unmet_dependencies(raw),
            vec![
                "goverlay → Depends: libqt6pas6 but it is not installable".to_string(),
                "goverlay → Recommends: vkbasalt but it is not going to be installed".to_string(),
            ]
        );
        // No block, no entries.
        assert!(parse_unmet_dependencies("Reading package lists...\nInst jq\n").is_empty());
    }

    #[test]
    fn parses_installed_state() {
        let (inst, ver, ess, sec) = parse_installed("install ok installed\t1.2-3\tno\tutils\n");
        assert!(inst);
        assert_eq!(ver.as_deref(), Some("1.2-3"));
        assert!(!ess);
        assert_eq!(sec.as_deref(), Some("utils"));
    }

    /// Exercises the real `INSPECT_SCRIPT` against a package supplied by the
    /// caller: `KLIA_TEST_DEB=/path/to/pkg.deb cargo test -- --ignored`.
    /// Unit tests cover the parsers; this one covers the shell side (dpkg-deb,
    /// ar, dpkg-query, apt simulation) and the section framing together.
    #[test]
    #[ignore = "requires KLIA_TEST_DEB pointing at a real .deb"]
    fn inspects_a_real_deb_end_to_end() {
        let path = std::env::var("KLIA_TEST_DEB").expect("set KLIA_TEST_DEB");
        let output = std::process::Command::new("sh")
            .args(["-c", INSPECT_SCRIPT, "sh", &path])
            .output()
            .expect("run inspect script");
        let raw = String::from_utf8_lossy(&output.stdout).to_string();
        let info = build_deb_info(&path, &raw).expect("build info");

        println!(
            "package={} version={} arch={} host={} files={} data={}B installed_kb={} sha={}…\n  setuid={:?}\n  setgid={:?}\n  hooks={:?}\n  scripts={:?}\n  repo={} repo_version={:?} signed={}\n  depends={:?} predep={:?} conffiles={:?}",
            info.package,
            info.version,
            info.architecture,
            info.host_architecture,
            info.file_count,
            info.data_bytes,
            info.installed_size_kb,
            &info.sha256[..8.min(info.sha256.len())],
            info.setuid_files,
            info.setgid_files,
            info.system_paths,
            info.maintainer_scripts
                .iter()
                .map(|s| (s.name.clone(), s.bytes))
                .collect::<Vec<_>>(),
            info.in_configured_repo,
            info.repo_version,
            info.signed,
            info.depends,
            info.pre_depends,
            info.conffiles
        );

        assert!(!info.package.is_empty());
        assert_eq!(info.sha256.len(), 64);
        assert!(!info.host_architecture.is_empty());
        assert!(info.file_count > 0);

        // The authorized check's script must frame its output correctly even
        // when run unprivileged (apt-get update fails, the plan still resolves),
        // which exercises the same path `pkexec` takes as root.
        let depcheck = std::process::Command::new("sh")
            .args(["-c", DEPCHECK_SCRIPT, "sh", &path])
            .output()
            .expect("run dependency check script");
        let depcheck_raw = String::from_utf8_lossy(&depcheck.stdout).to_string();
        assert!(depcheck_raw.contains("@@SIM@@"));
        let check = build_dependency_check(&depcheck_raw);
        match std::env::var("KLIA_TEST_DEB_EXPECT").as_deref() {
            // Package whose requirements the configured repositories cannot meet.
            Ok("unmet") => assert!(
                !check.ok && !check.unmet.is_empty(),
                "expected unmet requirements, got ok={} unmet={:?}",
                check.ok,
                check.unmet
            ),
            _ => assert!(check.ok, "dependency check failed: {:?}", check.error),
        }

        // The install-time gate must agree: a well-formed local package that
        // is not essential/metapackage passes with OK|<removals>.
        let check = std::process::Command::new("sh")
            .args(["-c", CHECK_SCRIPT, "sh", &path])
            .output()
            .expect("run check script");
        let verdict = String::from_utf8_lossy(&check.stdout);
        let first = verdict.lines().next().unwrap_or("");
        if matches!(
            std::env::var("KLIA_TEST_DEB_EXPECT").as_deref(),
            Ok("block") | Ok("unmet")
        ) {
            assert!(
                first.starts_with("BLOCK|"),
                "install gate should have blocked this package: {first}"
            );
            // For an unsatisfiable package the gate must hand back a reason that
            // names the requirement, not apt's raw dump.
            if first == "BLOCK|simulation-failed" {
                let raw = verdict.lines().skip(1).collect::<Vec<_>>().join("\n");
                let reason = gate_block_reason(&raw);
                println!("gate reason: {reason}");
                assert!(reason.starts_with("Cannot install:"), "{reason}");
                assert!(!reason.contains("root privileges"), "{reason}");
            }
        } else {
            assert!(
                first.starts_with("OK|"),
                "install gate rejected the package: {first}"
            );
        }
    }

    /// The gate must refuse anything that is not a readable Debian package, so a
    /// truncated download can never reach `apt-get`.
    #[test]
    fn install_gate_rejects_non_packages() {
        let output = std::process::Command::new("sh")
            .args(["-c", CHECK_SCRIPT, "sh", "/etc/hostname"])
            .output()
            .expect("run check script");
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert!(
            stdout.starts_with("BLOCK|"),
            "expected a BLOCK verdict, got: {stdout}"
        );
    }
}
