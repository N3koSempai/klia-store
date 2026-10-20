use once_cell::sync::Lazy;
use tauri_plugin_http::reqwest;

// Regex compilado una sola vez para extraer owner/repo
static GITHUB_HTTPS_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?$").unwrap()
});
static GITHUB_SSH_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?$").unwrap()
});
static GITLAB_HTTPS_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    // Support any GitLab instance (gitlab.com, gitlab.gnome.org, gitlab.freedesktop.org, etc.)
    // Captures: (1) domain, (2) full path
    regex::Regex::new(r"https?://(gitlab\.[^/]+)/(.+?)(?:\.git)?$").unwrap()
});
static GITLAB_SSH_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    // Support any GitLab instance via SSH
    // Captures: (1) domain, (2) full path
    regex::Regex::new(r"git@(gitlab\.[^:]+):(.+?)(?:\.git)?$").unwrap()
});

// Regex used by extract_release_info, compiled once instead of per-call
// (that function runs on every hash verification triggered from the frontend).
static GITHUB_RELEASE_ASSET_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"https://github\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/(.+)$")
        .unwrap()
});
static GITHUB_RELEASE_ARCHIVE_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"https://github\.com/([^/]+)/([^/]+)/archive/refs/tags/([^/]+)/(.+)$")
        .unwrap()
});
static GITLAB_RELEASE_ASSET_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(
        r"https://(gitlab\.[^/]+)/([^/]+(?:/[^/]+)*?)/-/releases/([^/]+)/downloads/(.+)$",
    )
    .unwrap()
});
static GITLAB_RELEASE_ARCHIVE_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"https://(gitlab\.[^/]+)/([^/]+(?:/[^/]+)*?)/-/archive/([^/]+)/(.+)$")
        .unwrap()
});

#[derive(Debug, Clone)]
#[allow(dead_code)]
enum GitPlatform {
    GitHub,
    GitLab,
    Unsupported,
}


// ============ HASH VERIFICATION SYSTEM ============

// Helper function to deserialize tag field (can be string or number)
fn deserialize_tag<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber {
        String(String),
        Number(f64),
        Integer(i64),
    }

    match Option::<StringOrNumber>::deserialize(deserializer)? {
        Some(StringOrNumber::String(s)) => Ok(Some(s)),
        Some(StringOrNumber::Number(n)) => {
            // Preserve decimal format for floats like 49.0
            if n.fract() == 0.0 && n.abs() < 1e10 {
                // Integer written as float in YAML (e.g., 49.0)
                // Format with one decimal to preserve original format
                Ok(Some(format!("{:.1}", n)))
            } else {
                Ok(Some(n.to_string()))
            }
        }
        Some(StringOrNumber::Integer(i)) => Ok(Some(i.to_string())),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FlatpakSource {
    #[serde(rename = "type")]
    source_type: String,
    url: Option<String>,
    commit: Option<String>,
    #[serde(deserialize_with = "deserialize_tag", default)]
    tag: Option<String>,
    branch: Option<String>,
    sha256: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FlatpakModule {
    name: String,
    #[serde(default)]
    sources: Vec<FlatpakSource>,
    // Note: nested modules are automatically ignored if not present
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FlatpakManifest {
    #[serde(rename = "app-id")]
    app_id: Option<String>,
    #[serde(default)]
    modules: Vec<serde_yaml::Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct VerificationResult {
    verified: bool,
    app_id: String,
    sources: Vec<SourceVerification>,
    error: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct SourceVerification {
    url: String,
    commit: String,
    verified: bool,
    remote_commit: Option<String>,
    error: Option<String>,
    platform: String,
    #[serde(rename = "isSha256Unverifiable", default)]
    is_sha256_unverifiable: bool,
}

/// Detecta la plataforma Git y extrae owner/repo
fn extract_git_repo(url: &str) -> Option<(String, String, GitPlatform)> {
    // GitHub HTTPS
    if let Some(caps) = GITHUB_HTTPS_REGEX.captures(url) {
        let owner = caps.get(1)?.as_str().to_string();
        let repo = caps.get(2)?.as_str().to_string();
        return Some((owner, repo, GitPlatform::GitHub));
    }

    // GitHub SSH
    if let Some(caps) = GITHUB_SSH_REGEX.captures(url) {
        let owner = caps.get(1)?.as_str().to_string();
        let repo = caps.get(2)?.as_str().to_string();
        return Some((owner, repo, GitPlatform::GitHub));
    }

    // GitLab HTTPS - captures full path (supports nested groups and self-hosted instances)
    if let Some(caps) = GITLAB_HTTPS_REGEX.captures(url) {
        let domain = caps.get(1)?.as_str().to_string();
        let full_path = caps.get(2)?.as_str().to_string();
        // For GitLab, we store "domain/path" in 'owner' and leave 'repo' empty
        // This supports: gitlab.com/project, gitlab.gnome.org/World/gedit, etc.
        let combined = format!("{}/{}", domain, full_path);
        return Some((combined, String::new(), GitPlatform::GitLab));
    }

    // GitLab SSH - captures full path (supports nested groups and self-hosted instances)
    if let Some(caps) = GITLAB_SSH_REGEX.captures(url) {
        let domain = caps.get(1)?.as_str().to_string();
        let full_path = caps.get(2)?.as_str().to_string();
        // For GitLab, we store "domain/path" in 'owner' and leave 'repo' empty
        let combined = format!("{}/{}", domain, full_path);
        return Some((combined, String::new(), GitPlatform::GitLab));
    }

    None
}

/// Detecta el formato del manifest listando archivos del repo de Flathub via GitHub API
async fn detect_manifest_format(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<Option<String>, String> {
    let api_url = format!(
        "https://api.github.com/repos/flathub/{}/contents/",
        app_id
    );

    debug_println!("[detect_manifest_format] Querying GitHub API: {}", api_url);

    let response = client
        .get(&api_url)
        .header("User-Agent", "klia-store-hash-verification")
        .send()
        .await
        .map_err(|e| format!("Failed to list repository contents: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        debug_println!(
            "[detect_manifest_format] GitHub API error: {} - {}",
            status, error_text
        );
        // Si falla, retornamos None para fallback a intentos secuenciales
        return Ok(None);
    }

    let content_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read API response: {}", e))?;
    let content: serde_json::Value = serde_json::from_str(&content_text)
        .map_err(|e| format!("Failed to parse GitHub API response: {}", e))?;

    // Buscar archivos que coincidan con {app_id}.yml, {app_id}.yaml, {app_id}.json
    let yml_name = format!("{}.yml", app_id);
    let yaml_name = format!("{}.yaml", app_id);
    let json_name = format!("{}.json", app_id);

    if let Some(files) = content.as_array() {
        for file in files {
            if let Some(name) = file.get("name").and_then(|n| n.as_str()) {
                if name == yml_name {
                    debug_println!("[detect_manifest_format] Found: {}", yml_name);
                    return Ok(Some(yml_name));
                } else if name == yaml_name {
                    debug_println!("[detect_manifest_format] Found: {}", yaml_name);
                    return Ok(Some(yaml_name));
                } else if name == json_name {
                    debug_println!("[detect_manifest_format] Found: {}", json_name);
                    return Ok(Some(json_name));
                }
            }
        }
    }

    debug_println!("[detect_manifest_format] No manifest found in repo listing");
    Ok(None)
}

/// Fetches the Flatpak manifest from the Flathub GitHub repository
/// Usa un solo cliente HTTP para todas las operaciones
async fn fetch_manifest_from_flathub(
    client: &reqwest::Client,
    app_id: &str,
) -> Result<String, String> {
    // Primero intentamos detectar el formato via API
    match detect_manifest_format(client, app_id).await {
        Ok(Some(manifest_name)) => {
            // Sabemos exactamente qué archivo buscar
            let url = format!(
                "https://raw.githubusercontent.com/flathub/{}/master/{}",
                app_id, manifest_name
            );
            debug_println!("[fetch_manifest_from_flathub] Fetching detected format: {}", url);

            match client.get(&url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        match response.text().await {
                            Ok(content) => return Ok(content),
                            Err(e) => debug_println!("[fetch_manifest_from_flathub] Failed to read content: {}", e),
                        }
                    }
                }
                Err(e) => debug_println!("[fetch_manifest_from_flathub] Request failed: {}", e),
            }
        }
        Ok(None) => {
            debug_println!("[fetch_manifest_from_flathub] Detection failed, falling back to sequential attempts");
        }
        Err(e) => {
            debug_println!("[detect_manifest_format] Error: {}, falling back to sequential attempts", e);
        }
    }

    // Fallback: intentamos los formatos comunes
    let manifest_names = vec![
        format!("{}.yml", app_id),
        format!("{}.yaml", app_id),
        format!("{}.json", app_id),
    ];

    for manifest_name in manifest_names {
        let url = format!(
            "https://raw.githubusercontent.com/flathub/{}/master/{}",
            app_id, manifest_name
        );

        debug_println!(
            "[fetch_manifest_from_flathub] Trying URL: {}",
            url
        );

        match client.get(&url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.text().await {
                        Ok(content) => {
                            debug_println!(
                                "[fetch_manifest_from_flathub] Successfully fetched manifest: {}",
                                manifest_name
                            );
                            return Ok(content);
                        }
                        Err(e) => {
                            debug_println!(
                                "[fetch_manifest_from_flathub] Failed to read response body: {}",
                                e
                            );
                        }
                    }
                } else {
                    debug_println!(
                        "[fetch_manifest_from_flathub] URL returned status: {}",
                        response.status()
                    );
                }
            }
            Err(e) => {
                debug_println!("[fetch_manifest_from_flathub] Request failed: {}", e);
            }
        }
    }

    Err(format!(
        "Could not find manifest for {} in flathub repository",
        app_id
    ))
}

/// Obtiene el commit SHA para un tag específico de GitHub
async fn get_github_tag_commit_inner(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<String, String> {
    let tag_url = format!(
        "https://api.github.com/repos/{}/{}/git/refs/tags/{}",
        owner, repo, tag
    );

    let response = client
        .get(&tag_url)
        .header("User-Agent", "klia-store-hash-verification")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tag ref: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "GitHub API error (tag ref): {} - {}",
            status, error_text
        ));
    }

    let tag_info_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read tag info: {}", e))?;
    let tag_info: serde_json::Value = serde_json::from_str(&tag_info_text)
        .map_err(|e| format!("Failed to parse tag info: {}", e))?;

    // Get the SHA from the object
    let object = tag_info
        .get("object")
        .ok_or("Could not find object in tag response")?;

    let sha = object
        .get("sha")
        .and_then(|v| v.as_str())
        .ok_or("Could not find SHA in tag object")?;

    // If it's a tag object (not a commit), we need to get the actual commit
    let object_type = object
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("commit");

    if object_type == "tag" {
        // It's an annotated tag, get the commit it points to
        let tag_object_url = format!(
            "https://api.github.com/repos/{}/{}/git/tags/{}",
            owner, repo, sha
        );

        let response = client
            .get(&tag_object_url)
            .header("User-Agent", "klia-store-hash-verification")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch tag object: {}", e))?;

        if response.status().is_success() {
            let tag_object_text = response
                .text()
                .await
                .map_err(|e| format!("Failed to read tag object: {}", e))?;
            let tag_object: serde_json::Value = serde_json::from_str(&tag_object_text)
                .map_err(|e| format!("Failed to parse tag object: {}", e))?;

            if let Some(obj) = tag_object.get("object") {
                if let Some(commit_sha) = obj.get("sha").and_then(|v| v.as_str()) {
                    return Ok(commit_sha.to_string());
                }
            }
        }
    }

    Ok(sha.to_string())
}

/// Obtiene el commit SHA para un tag específico de GitLab
async fn get_gitlab_tag_commit_inner(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<String, String> {
    // GitLab API v4 para obtener un tag específico
    // For GitLab, 'owner' contains "domain/path" (e.g., "gitlab.gnome.org/World/gedit/gedit")
    // repo is empty and not used

    let (gitlab_domain, project_path) = if repo.is_empty() {
        // New format: "domain/path" in owner
        // Split at first '/' to separate domain from path
        if let Some(first_slash) = owner.find('/') {
            let domain = &owner[..first_slash];
            let path = &owner[first_slash + 1..];
            (domain, path.to_string())
        } else {
            // Fallback: assume gitlab.com if no domain found
            ("gitlab.com", owner.to_string())
        }
    } else {
        // Legacy format: owner/repo (for backward compatibility)
        ("gitlab.com", format!("{}/{}", owner, repo))
    };

    // URL-encode the path (/ becomes %2F)
    let encoded_path = project_path.replace('/', "%2F");

    let tag_url = format!(
        "https://{}/api/v4/projects/{}/repository/tags/{}",
        gitlab_domain, encoded_path, tag
    );

    let response = client
        .get(&tag_url)
        .header("User-Agent", "klia-store-hash-verification")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch GitLab tag: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "GitLab API error: {} - {}",
            status, error_text
        ));
    }

    let tag_info_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read tag info: {}", e))?;
    let tag_info: serde_json::Value = serde_json::from_str(&tag_info_text)
        .map_err(|e| format!("Failed to parse tag info: {}", e))?;

    let commit = tag_info
        .get("commit")
        .ok_or("Could not find commit in tag response")?;

    let sha = commit
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not find commit id in tag response")?;

    Ok(sha.to_string())
}

async fn get_gitlab_tag_commit(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<String, String> {
    // Try original tag first
    match get_gitlab_tag_commit_inner(client, owner, repo, tag).await {
        Ok(commit) => Ok(commit),
        Err(e) => {
            // Try with 'v' prefix
            if !tag.starts_with('v') {
                debug_println!(
                    "[get_gitlab_tag_commit] Tag '{}' not found, trying with 'v' prefix",
                    tag
                );
                get_gitlab_tag_commit_inner(client, owner, repo, &format!("v{}", tag)).await
            } else {
                Err(e)
            }
        }
    }
}

/// Obtiene el commit para un tag según la plataforma
async fn get_tag_commit(
    client: &reqwest::Client,
    platform: &GitPlatform,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<String, String> {
    match platform {
        GitPlatform::GitHub => get_github_tag_commit_inner(client, owner, repo, tag).await,
        GitPlatform::GitLab => get_gitlab_tag_commit(client, owner, repo, tag).await,
        GitPlatform::Unsupported => Err("Unsupported platform".to_string()),
    }
}

/// Gets the commit SHA for a specific tag (con cliente existente y 'v' prefix fallback)
async fn get_tag_commit_with_fallback(
    client: &reqwest::Client,
    platform: &GitPlatform,
    owner: &str,
    repo: &str,
    tag: &str,
) -> Result<String, String> {
    // Try the original tag first
    match get_tag_commit(client, platform, owner, repo, tag).await {
        Ok(commit) => Ok(commit),
        Err(e) => {
            // Try with 'v' prefix if the tag doesn't exist and tag doesn't already start with 'v'
            if !tag.starts_with('v') {
                debug_println!(
                    "[get_tag_commit] Tag '{}' not found, trying with 'v' prefix",
                    tag
                );
                get_tag_commit(client, platform, owner, repo, &format!("v{}", tag)).await
            } else {
                Err(e)
            }
        }
    }
}

/// Versión legacy que crea su propio cliente (mantenida por compatibilidad si es necesaria)
#[allow(dead_code)]
async fn get_github_tag_commit(owner: &str, repo: &str, tag: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    get_tag_commit_with_fallback(&client, &GitPlatform::GitHub, owner, repo, tag).await
}

/// Extracts owner, repo, release tag, and filename from a GitHub/GitLab release URL
/// Example: https://github.com/owner/repo/releases/download/v1.2.2/file.tar.gz
/// Returns: Some((owner, repo, tag, filename))
/// Extracts owner, repo, release tag, and filename from a GitHub/GitLab release URL
/// Also returns whether the URL is an auto-generated archive (not a manually uploaded asset)
/// Example: https://github.com/owner/repo/releases/download/v1.2.2/file.tar.gz
/// Returns: Some((owner, repo, tag, filename, is_generated_archive, platform))
/// platform is "github" or "gitlab"
fn extract_release_info(url: &str) -> Option<(String, String, String, String, bool, String)> {
    // GitHub pattern: https://github.com/owner/repo/releases/download/tag/file
    // These are manually uploaded assets and have SHA256 digest available
    if let Some(caps) = GITHUB_RELEASE_ASSET_REGEX.captures(url) {
        let owner = caps.get(1)?.as_str().to_string();
        let repo = caps.get(2)?.as_str().to_string();
        let tag = caps.get(3)?.as_str().to_string();
        let filename = caps.get(4)?.as_str().to_string();
        return Some((owner, repo, tag, filename, false, "github".to_string()));
    }

    // GitHub archive pattern: https://github.com/owner/repo/archive/refs/tags/tag/file
    // These are auto-generated tarballs and do NOT have SHA256 digest available via API
    if let Some(caps) = GITHUB_RELEASE_ARCHIVE_REGEX.captures(url) {
        let owner = caps.get(1)?.as_str().to_string();
        let repo = caps.get(2)?.as_str().to_string();
        let tag = caps.get(3)?.as_str().to_string();
        let filename = caps.get(4)?.as_str().to_string();
        return Some((owner, repo, tag, filename, true, "github".to_string()));
    }

    // GitLab releases pattern: https://gitlab.DOMAIN/owner/repo/-/releases/tag/downloads/file
    // These are manually uploaded assets; a companion .sha256sum link may be available
    if let Some(caps) = GITLAB_RELEASE_ASSET_REGEX.captures(url) {
        let domain = caps.get(1)?.as_str().to_string();
        let project_path = caps.get(2)?.as_str().to_string();
        let tag = caps.get(3)?.as_str().to_string();
        let filename = caps.get(4)?.as_str().to_string();
        // Encode owner as "domain/project_path" so the caller can reconstruct the API URL
        return Some((domain, project_path, tag, filename, false, "gitlab".to_string()));
    }

    // GitLab archive pattern: https://gitlab.DOMAIN/owner/repo/-/archive/tag/file
    // Auto-generated tarballs, no sha256sum companion expected
    if let Some(caps) = GITLAB_RELEASE_ARCHIVE_REGEX.captures(url) {
        let domain = caps.get(1)?.as_str().to_string();
        let project_path = caps.get(2)?.as_str().to_string();
        let tag = caps.get(3)?.as_str().to_string();
        let filename = caps.get(4)?.as_str().to_string();
        return Some((domain, project_path, tag, filename, true, "gitlab".to_string()));
    }

    None
}

/// Verifies that a GitHub release exists and optionally verifies SHA256
async fn verify_github_release(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    tag: &str,
    filename: Option<&str>,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let release_url = format!(
        "https://api.github.com/repos/{}/{}/releases/tags/{}",
        owner, repo, tag
    );

    debug_println!("[verify_github_release] Checking release: {}", release_url);

    let response = client
        .get(&release_url)
        .header("User-Agent", "klia-store-hash-verification")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Release {} not found or not public (status: {})", tag, status));
    }

    // If we need to verify SHA256, get the release data
    if let (Some(file), Some(expected)) = (filename, expected_sha256) {
        debug_println!("[verify_github_release] Verifying SHA256 for file: {}", file);

        let release_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read release data: {}", e))?;

        let release_data: serde_json::Value = serde_json::from_str(&release_text)
            .map_err(|e| format!("Failed to parse release data: {}", e))?;

        // Find the asset with matching filename
        if let Some(assets) = release_data.get("assets").and_then(|a| a.as_array()) {
            for asset in assets {
                if let Some(name) = asset.get("name").and_then(|n| n.as_str()) {
                    if name == file {
                        // GitHub provides digest in format "sha256:HASH"
                        if let Some(digest) = asset.get("digest").and_then(|d| d.as_str()) {
                            let remote_sha256 = digest.strip_prefix("sha256:").unwrap_or(digest);

                            debug_println!("[verify_github_release] Remote SHA256: {}", remote_sha256);
                            debug_println!("[verify_github_release] Expected SHA256: {}", expected);

                            if remote_sha256.to_lowercase() == expected.to_lowercase() {
                                debug_println!("[verify_github_release] ✓ SHA256 matches!");
                                return Ok(());
                            } else {
                                // CRITICAL ERROR: SHA256 mismatch (file was modified!)
                                return Err(format!(
                                    "Hash mismatch: manifest SHA256 {} does not match release SHA256 {}",
                                    expected, remote_sha256
                                ));
                            }
                        } else {
                            // WARNING: No digest available (not critical, Flatpak will verify)
                            debug_println!("[verify_github_release] ⚠ No digest field in asset");
                            return Err("Could not verify: GitHub release has no SHA256 digest available".to_string());
                        }
                    }
                }
            }
            return Err(format!("Could not verify: File {} not found in release assets", file));
        } else {
            return Err("Could not verify: No assets found in release".to_string());
        }
    }

    // No SHA256 verification requested, just confirm release exists
    debug_println!("[verify_github_release] Release {} exists and is public", tag);
    Ok(())
}

/// Verifies a GitLab release exists and checks SHA256 via the companion .sha256sum link if present.
/// domain: e.g. "gitlab.gnome.org"
/// project_path: e.g. "World/design/app-icon-preview"
async fn verify_gitlab_release(
    client: &reqwest::Client,
    domain: &str,
    project_path: &str,
    tag: &str,
    filename: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let encoded_path = project_path.replace('/', "%2F");
    let api_url = format!(
        "https://{}/api/v4/projects/{}/releases/{}",
        domain, encoded_path, tag
    );

    debug_println!("[verify_gitlab_release] Checking release: {}", api_url);

    let response = client
        .get(&api_url)
        .header("User-Agent", "klia-store-hash-verification")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Release {} not found or not public (status: {})", tag, status));
    }

    let Some(expected) = expected_sha256 else {
        debug_println!("[verify_gitlab_release] Release {} exists (no SHA256 to verify)", tag);
        return Ok(());
    };

    let release_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read release data: {}", e))?;

    let release_data: serde_json::Value = serde_json::from_str(&release_text)
        .map_err(|e| format!("Failed to parse release data: {}", e))?;

    // Look for a .sha256sum companion link in assets.links
    let sha256sum_filename = format!("{}.sha256sum", filename);
    let links = release_data
        .get("assets")
        .and_then(|a| a.get("links"))
        .and_then(|l| l.as_array());

    if let Some(links) = links {
        for link in links {
            let name = link.get("name").and_then(|n| n.as_str()).unwrap_or("");
            if name == sha256sum_filename {
                let sha256sum_url = link
                    .get("direct_asset_url")
                    .or_else(|| link.get("url"))
                    .and_then(|u| u.as_str())
                    .ok_or("No URL for .sha256sum link")?;

                debug_println!("[verify_gitlab_release] Found .sha256sum link: {}", sha256sum_url);

                let sha256sum_content = client
                    .get(sha256sum_url)
                    .header("User-Agent", "klia-store-hash-verification")
                    .send()
                    .await
                    .map_err(|e| format!("Failed to fetch .sha256sum: {}", e))?
                    .text()
                    .await
                    .map_err(|e| format!("Failed to read .sha256sum content: {}", e))?;

                // Format: "<hash>  <filename>" or "<hash> *<filename>"
                let remote_sha256 = sha256sum_content
                    .split_whitespace()
                    .next()
                    .ok_or("Could not parse .sha256sum content")?;

                debug_println!("[verify_gitlab_release] Remote SHA256: {}", remote_sha256);
                debug_println!("[verify_gitlab_release] Expected SHA256: {}", expected);

                return if remote_sha256.to_lowercase() == expected.to_lowercase() {
                    debug_println!("[verify_gitlab_release] ✓ SHA256 matches!");
                    Ok(())
                } else {
                    Err(format!(
                        "Hash mismatch: manifest SHA256 {} does not match release SHA256 {}",
                        expected, remote_sha256
                    ))
                };
            }
        }
    }

    // No .sha256sum companion found — release exists but we can't verify the hash
    Err(format!(
        "Could not verify: No {}.sha256sum found in GitLab release assets",
        filename
    ))
}

#[tauri::command]
pub async fn verify_app_hash(app_id: String) -> Result<VerificationResult, String> {
    debug_println!("[verify_app_hash] Starting hash verification for: {}", app_id);

    // Creamos un único cliente HTTP para todas las operaciones
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Fetch the manifest from flathub (reusando el cliente)
    let manifest_content = match fetch_manifest_from_flathub(&client, &app_id).await {
        Ok(content) => content,
        Err(e) => {
            return Ok(VerificationResult {
                verified: false,
                app_id,
                sources: vec![],
                error: Some(format!("Failed to fetch manifest: {}", e)),
            });
        }
    };

    // Parse the manifest
    let manifest: FlatpakManifest = match serde_yaml::from_str(&manifest_content) {
        Ok(m) => m,
        Err(e) => {
            // Try parsing as JSON if YAML fails
            match serde_json::from_str(&manifest_content) {
                Ok(m) => m,
                Err(_) => {
                    return Ok(VerificationResult {
                        verified: false,
                        app_id,
                        sources: vec![],
                        error: Some(format!("Failed to parse manifest: {}", e)),
                    });
                }
            }
        }
    };

    // Extract the main module - look for module that matches app_id or use the last module
    let main_module = find_main_module(&manifest.modules, &app_id);

    let main_source = match main_module {
        Some(module) => {
            debug_println!("[verify_app_hash] Found main module: {}", module.name);
            debug_println!("[verify_app_hash] Module has {} sources", module.sources.len());
            for (idx, src) in module.sources.iter().enumerate() {
                debug_println!("[verify_app_hash]   Source {}: type={}, url={:?}",
                    idx, src.source_type, src.url);
            }
            // Find the first git source, or archive from GitHub/GitLab release
            module.sources.into_iter().find(|s| {
                s.source_type == "git" ||
                (s.source_type == "archive" && s.url.as_ref().map_or(false, |url|
                    url.contains("github.com") || url.contains("gitlab.com") || url.contains("gitlab.")
                ))
            })
        }
        None => {
            debug_println!("[verify_app_hash] No main module found, looking for any git or archive source");
            // Fallback: find first git or archive source in any module
            manifest.modules.iter().find_map(|module_value| {
                if let Ok(module) = serde_yaml::from_value::<FlatpakModule>(module_value.clone()) {
                    module.sources.into_iter().find(|s| {
                        s.source_type == "git" ||
                        (s.source_type == "archive" && s.url.as_ref().map_or(false, |url|
                            url.contains("github.com") || url.contains("gitlab.com") || url.contains("gitlab.")
                        ))
                    })
                } else if let Some(module_map) = module_value.as_mapping() {
                    if let Some(sources_val) = module_map.get(&serde_yaml::Value::String("sources".to_string())) {
                        if let Some(sources_array) = sources_val.as_sequence() {
                            return sources_array.iter().find_map(|source_val| {
                                if let Ok(source) = serde_yaml::from_value::<FlatpakSource>(source_val.clone()) {
                                    if source.source_type == "git" ||
                                       (source.source_type == "archive" && source.url.as_ref().map_or(false, |url|
                                           url.contains("github.com") || url.contains("gitlab.com") || url.contains("gitlab.")
                                       )) {
                                        return Some(source);
                                    }
                                }
                                None
                            });
                        }
                    }
                    None
                } else {
                    None
                }
            })
        }
    };

    let source = match main_source {
        Some(s) => s,
        None => {
            return Ok(VerificationResult {
                verified: false, // No verifiable source found
                app_id,
                sources: vec![],
                error: Some("Could not verify: No git source or GitHub/GitLab release found in manifest".to_string()),
            });
        }
    };

    let url = source.url.clone().unwrap_or_default();
    let source_type = source.source_type.clone();
    let manifest_commit = source.commit.clone().unwrap_or_default();
    let tag = source.tag.clone();

    // Handle archive sources (GitHub/GitLab releases) differently
    if source_type == "archive" {
        debug_println!("[verify_app_hash] Source is an archive from release");

        // Extract release info from URL (e.g., https://github.com/owner/repo/releases/download/v1.2.2/file.tar.gz)
        if let Some((owner_or_domain, repo_or_path, release_tag, filename, is_generated_archive, platform)) = extract_release_info(&url) {
            debug_println!("[verify_app_hash] Detected release: {}/{} @ {} ({})", owner_or_domain, repo_or_path, release_tag, platform);
            debug_println!("[verify_app_hash] File: {}", filename);
            debug_println!("[verify_app_hash] Is auto-generated archive: {}", is_generated_archive);

            // Get SHA256 from manifest
            let manifest_sha256 = source.sha256.as_deref();
            if let Some(sha) = manifest_sha256 {
                debug_println!("[verify_app_hash] Manifest SHA256: {}", sha);
            } else {
                debug_println!("[verify_app_hash] ⚠ No SHA256 in manifest");
            }

            let release_verified = if platform == "gitlab" {
                if is_generated_archive {
                    // GitLab auto-generated archives: just verify the release exists
                    verify_gitlab_release(
                        &client,
                        &owner_or_domain,
                        &repo_or_path,
                        &release_tag,
                        &filename,
                        None,
                    ).await
                } else {
                    // GitLab manually uploaded asset: verify via companion .sha256sum link
                    verify_gitlab_release(
                        &client,
                        &owner_or_domain,
                        &repo_or_path,
                        &release_tag,
                        &filename,
                        manifest_sha256,
                    ).await
                }
            } else {
                // GitHub
                if is_generated_archive {
                    verify_github_release(
                        &client,
                        &owner_or_domain,
                        &repo_or_path,
                        &release_tag,
                        None,
                        None,
                    ).await
                } else {
                    verify_github_release(
                        &client,
                        &owner_or_domain,
                        &repo_or_path,
                        &release_tag,
                        Some(&filename),
                        manifest_sha256,
                    ).await
                }
            };

            return Ok(VerificationResult {
                verified: release_verified.is_ok(),
                app_id,
                sources: vec![SourceVerification {
                    url: url.clone(),
                    commit: release_tag.clone(),
                    verified: release_verified.is_ok(),
                    remote_commit: Some(release_tag.clone()),
                    error: if is_generated_archive {
                        Some(format!(
                            "SHA256 cannot be verified for auto-generated archives from {}. The release exists but the archive is generated on-demand.",
                            platform
                        ))
                    } else {
                        release_verified.err()
                    },
                    platform: platform.clone(),
                    is_sha256_unverifiable: is_generated_archive,
                }],
                error: if is_generated_archive {
                    Some("SHA256 unverifiable for auto-generated archive".to_string())
                } else {
                    None
                },
            });
        } else {
            return Ok(VerificationResult {
                verified: false,
                app_id,
                sources: vec![SourceVerification {
                    url: url.clone(),
                    commit: String::new(),
                    verified: false,
                    remote_commit: None,
                    error: Some("Could not extract release information from URL".to_string()),
                    platform: "unknown".to_string(),
                        is_sha256_unverifiable: false,
                }],
                error: Some("Invalid release URL format".to_string()),
            });
        }
    }

    if url.is_empty() || manifest_commit.is_empty() {
        return Ok(VerificationResult {
            verified: false,
            app_id,
            sources: vec![SourceVerification {
                url: url.clone(),
                commit: manifest_commit.clone(),
                verified: false,
                remote_commit: None,
                error: Some("Missing URL or commit in source".to_string()),
                platform: "unknown".to_string(),
                is_sha256_unverifiable: false,
            }],
            error: Some("Main source is missing URL or commit".to_string()),
        });
    }

    // Extract repo info and detect platform
    let (owner, repo, platform) = match extract_git_repo(&url) {
        Some((o, r, p)) => (o, r, p),
        None => {
            // Platform not supported (not GitHub or GitLab)
            return Ok(VerificationResult {
                verified: false,
                app_id,
                sources: vec![SourceVerification {
                    url: url.clone(),
                    commit: manifest_commit.clone(),
                    verified: false,
                    remote_commit: None,
                    error: Some("Unsupported platform".to_string()),
                    platform: "unsupported".to_string(),
                    is_sha256_unverifiable: false,
                }],
                error: Some("Unsupported platform".to_string()),
            });
        }
    };

    let platform_name = match platform {
        GitPlatform::GitHub => "github",
        GitPlatform::GitLab => "gitlab",
        GitPlatform::Unsupported => "unsupported",
    };

    // Format the project path based on platform
    let project_display = if repo.is_empty() {
        // GitLab with full path
        owner.to_string()
    } else {
        // GitHub or legacy format
        format!("{}/{}", owner, repo)
    };

    debug_println!(
        "[verify_app_hash] Verifying main source: {} @ {} (platform: {})",
        project_display, manifest_commit, platform_name
    );

    // Si hay un tag, verificamos que el commit del manifest coincida con el del tag
    // Esto también verifica implícitamente que el commit existe en el repo
    let (verified, remote_commit, error) = if let Some(ref tag_name) = tag {
        debug_println!(
            "[verify_app_hash] Tag specified: {}, fetching remote commit for tag",
            tag_name
        );

        // Reusamos el cliente HTTP existente
        match get_tag_commit_with_fallback(&client, &platform, &owner, &repo, tag_name).await {
            Ok(tag_commit) => {
                debug_println!(
                    "[verify_app_hash] Tag {} resolves to commit: {}",
                    tag_name, tag_commit
                );

                // Normalize commit SHAs for comparison (use first 7 chars for comparison)
                let manifest_short = &manifest_commit[..manifest_commit.len().min(7)];
                let remote_short = &tag_commit[..tag_commit.len().min(7)];

                let matches = manifest_short.to_lowercase() == remote_short.to_lowercase();

                if matches {
                    (true, Some(tag_commit), None)
                } else {
                    let error_msg = format!(
                        "Hash mismatch: manifest specifies {} but tag {} resolves to {}",
                        manifest_commit, tag_name, tag_commit
                    );
                    debug_println!("[verify_app_hash] {}", error_msg);
                    (false, Some(tag_commit), Some(error_msg))
                }
            }
            Err(e) => {
                debug_println!(
                    "[verify_app_hash] Could not fetch tag {}: {}",
                    tag_name, e
                );
                // Tag doesn't exist or couldn't be fetched, but commit exists
                // This is a warning situation - commit exists but tag verification failed
                (false, None, Some(format!("Could not verify tag {}: {}", tag_name, e)))
            }
        }
    } else {
        debug_println!(
            "[verify_app_hash] No tag specified, only verifying commit exists"
        );
        // No tag specified, just verify commit exists (already done above)
        (true, None, None)
    };

    debug_println!(
        "[verify_app_hash] Verification complete. Verified: {}, Error: {:?}",
        verified, error
    );

    Ok(VerificationResult {
        verified,
        app_id,
        sources: vec![SourceVerification {
            url,
            commit: manifest_commit,
            verified,
            remote_commit,
            error: error.clone(),
            platform: platform_name.to_string(),
            is_sha256_unverifiable: false,
        }],
        error: error.map(|e| format!("Security verification failed: {}", e)),
    })
}

/// Finds the main module in the manifest - typically the one matching the app_id or the last one
fn find_main_module(modules: &[serde_yaml::Value], app_id: &str) -> Option<FlatpakModule> {
    // Extract the last part of app_id to match against module names
    let app_name = app_id.split('.').last().unwrap_or(app_id).to_lowercase();

    debug_println!("[find_main_module] Looking for main module. App name: {}", app_name);
    debug_println!("[find_main_module] Total modules: {}", modules.len());

    // First pass: look for exact match (case-insensitive)
    for (idx, module_value) in modules.iter().enumerate() {
        match serde_yaml::from_value::<FlatpakModule>(module_value.clone()) {
            Ok(module) => {
                debug_println!("[find_main_module] Module {}: name='{}', sources={}",
                    idx, module.name, module.sources.len());
                let module_name_lower = module.name.to_lowercase();
                if module_name_lower == app_name || module_name_lower == app_id.to_lowercase() {
                    debug_println!("[find_main_module] Found exact match: {}", module.name);
                    return Some(module);
                }
            }
            Err(e) => {
                debug_println!("[find_main_module] Module {}: Failed to parse: {}", idx, e);
                debug_println!("[find_main_module] Module {} raw value: {:?}", idx, module_value);
            }
        }
    }

    // Second pass: look for partial match
    debug_println!("[find_main_module] No exact match, trying partial match...");
    for (_idx, module_value) in modules.iter().enumerate() {
        if let Ok(module) = serde_yaml::from_value::<FlatpakModule>(module_value.clone()) {
            let module_name_lower = module.name.to_lowercase();
            debug_println!("[find_main_module] Checking partial match for '{}' against '{}'",
                module_name_lower, app_name);
            if module_name_lower.contains(&app_name) || app_name.contains(&module_name_lower) {
                debug_println!("[find_main_module] Found partial match: {}", module.name);
                return Some(module);
            }
        }
    }

    // Fallback: return the last module (usually the main app)
    if let Some(last) = modules.last() {
        if let Ok(module) = serde_yaml::from_value::<FlatpakModule>(last.clone()) {
            debug_println!("[find_main_module] Using last module as fallback: {}", module.name);
            return Some(module);
        }
    }

    debug_println!("[find_main_module] No suitable module found");
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_github_https_and_ssh() {
        for url in [
            "https://github.com/owner/repo",
            "https://github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
        ] {
            let (o, r, p) = extract_git_repo(url).unwrap();
            assert_eq!((o.as_str(), r.as_str()), ("owner", "repo"), "{url}");
            assert!(matches!(p, GitPlatform::GitHub));
        }
    }

    #[test]
    fn extracts_gitlab_nested_groups() {
        let (o, r, p) = extract_git_repo("https://gitlab.gnome.org/World/gedit.git").unwrap();
        assert_eq!(o, "gitlab.gnome.org/World/gedit");
        assert!(r.is_empty());
        assert!(matches!(p, GitPlatform::GitLab));
        let (o, _, _) = extract_git_repo("git@gitlab.com:grp/sub/proj.git").unwrap();
        assert_eq!(o, "gitlab.com/grp/sub/proj");
    }

    #[test]
    fn rejects_unknown_hosts() {
        assert!(extract_git_repo("https://example.com/a/b").is_none());
    }

    #[test]
    fn parses_release_urls() {
        let (o, r, t, f, archive, plat) = extract_release_info(
            "https://github.com/owner/repo/releases/download/v1.2.2/file.tar.gz",
        )
        .unwrap();
        assert_eq!((o.as_str(), r.as_str(), t.as_str(), f.as_str()), ("owner", "repo", "v1.2.2", "file.tar.gz"));
        assert!(!archive);
        assert_eq!(plat, "github");

        let (_, _, t, _, archive, _) = extract_release_info(
            "https://github.com/owner/repo/archive/refs/tags/v2/repo-v2.tar.gz",
        )
        .unwrap();
        assert_eq!(t, "v2");
        assert!(archive);

        let (d, p, t, f, archive, plat) = extract_release_info(
            "https://gitlab.com/g/p/-/releases/v3/downloads/x.zip",
        )
        .unwrap();
        assert_eq!((d.as_str(), p.as_str(), t.as_str(), f.as_str()), ("gitlab.com", "g/p", "v3", "x.zip"));
        assert!(!archive);
        assert_eq!(plat, "gitlab");

        let (_, _, _, _, archive, plat) =
            extract_release_info("https://gitlab.com/g/p/-/archive/v3/p-v3.tar.gz").unwrap();
        assert!(archive);
        assert_eq!(plat, "gitlab");

        assert!(extract_release_info("https://example.com/file.tar.gz").is_none());
    }
}
