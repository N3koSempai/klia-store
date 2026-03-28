use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use sysinfo::System;
use tauri::{AppHandle, Manager};
use tracing::{debug, warn};

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license_key: String, // New format: base64(hardware_hash + expiration_timestamp + checksum)
    pub magic_amount: String,
    pub activated_at: Option<i64>, // Timestamp when license was activated
}

#[derive(Debug, Serialize, Deserialize)]
struct InstallInfo {
    first_run: i64, // Timestamp of first installation
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupInfo {
    pub first_start: bool, // false = needs setup, true = setup completed
}

// License duration: 6 months
const LICENSE_DURATION_DAYS: i64 = 182;
const TRIAL_PERIOD_DAYS: i64 = 3;

// DEBUG: Set to true to simulate expired trial (for testing UI)
const DEBUG_FORCE_EXPIRED_TRIAL: bool = false;

/// Get hardware fingerprint based on CPU ID, MAC address, and CPU core count
fn get_hardware_fingerprint() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    // Get CPU info
    let cpu_brand = sys.cpus().first().map(|cpu| cpu.brand()).unwrap_or("0");

    let core_count = sys.cpus().len().to_string();

    // Get system name/hostname as additional identifier
    let hostname = System::host_name().unwrap_or_else(|| "0".to_string());

    // Combine all identifiers
    let fingerprint = format!("{}:{}:{}", cpu_brand, core_count, hostname);

    fingerprint
}

/// Generate hardware hash (internal use)
fn generate_hardware_hash() -> String {
    let fingerprint = get_hardware_fingerprint();
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

/// Generate a secure license key with expiration and checksum
/// Format: base64(hardware_hash + "|" + expiration_timestamp + "|" + checksum)
fn generate_license_key(expiration_date: DateTime<Utc>) -> String {
    let hardware_hash = generate_hardware_hash();
    let expiration_timestamp = expiration_date.timestamp();

    // Create data string: hardware_hash|timestamp
    let data = format!("{}|{}", hardware_hash, expiration_timestamp);

    // Generate checksum: SHA256(data + secret_salt)
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    // Add hardware fingerprint as salt to prevent tampering
    hasher.update(get_hardware_fingerprint().as_bytes());
    let checksum = hex::encode(hasher.finalize());

    // Final format: hardware_hash|timestamp|checksum
    let license_data = format!("{}|{}", data, checksum);

    // Encode in base64
    general_purpose::STANDARD.encode(license_data.as_bytes())
}

/// Validate a license key
/// Returns (is_valid, is_expired, expiration_date)
fn validate_license_key(license_key: &str) -> (bool, bool, Option<DateTime<Utc>>) {
    // Decode base64
    let decoded = match general_purpose::STANDARD.decode(license_key.as_bytes()) {
        Ok(d) => d,
        Err(_) => return (false, true, None),
    };

    let license_data = match String::from_utf8(decoded) {
        Ok(s) => s,
        Err(_) => return (false, true, None),
    };

    // Parse: hardware_hash|timestamp|checksum
    let parts: Vec<&str> = license_data.split('|').collect();
    if parts.len() != 3 {
        return (false, true, None);
    }

    let stored_hardware_hash = parts[0];
    let expiration_timestamp = match parts[1].parse::<i64>() {
        Ok(t) => t,
        Err(_) => return (false, true, None),
    };
    let stored_checksum = parts[2];

    // Verify hardware match
    let current_hardware_hash = generate_hardware_hash();
    if stored_hardware_hash != current_hardware_hash {
        return (false, true, None);
    }

    // Verify checksum
    let data = format!("{}|{}", stored_hardware_hash, expiration_timestamp);
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hasher.update(get_hardware_fingerprint().as_bytes());
    let computed_checksum = hex::encode(hasher.finalize());

    if stored_checksum != computed_checksum {
        return (false, true, None); // Tampered
    }

    // Check expiration
    let expiration_date = DateTime::from_timestamp(expiration_timestamp, 0).unwrap();
    let now = Utc::now();
    let is_expired = now > expiration_date;

    (true, is_expired, Some(expiration_date))
}

/// Generate a public key for payment (for backward compatibility)
#[tauri::command]
pub fn generate_public_key() -> String {
    generate_hardware_hash()
}

/// Generate a magic amount (12.0 base + unique decimals based on hardware)
#[tauri::command]
pub fn generate_magic_amount() -> String {
    let fingerprint = get_hardware_fingerprint();
    let mut hasher = Sha256::new();
    hasher.update(fingerprint.as_bytes());
    let hash = hasher.finalize();

    // Take first 8 bytes and convert to a number
    let mut decimal_value = 0u64;
    for i in 0..8 {
        decimal_value = (decimal_value << 8) | (hash[i] as u64);
    }

    // Create a decimal part with 6 digits (0-999999)
    // This gives us range from 12.000000 to 12.999999
    let decimal_part = decimal_value % 1_000_000;

    // Base amount is 12 USDT + unique 6 decimals
    format!("12.{:06}", decimal_part)
}

/// Get the app data directory path (Flatpak compatible)
fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))
}

/// Get or create install info (tracks first installation time)
fn get_install_info(app: &AppHandle) -> Result<InstallInfo, String> {
    let data_dir = get_app_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    let install_path = data_dir.join("install.json");

    if install_path.exists() {
        let json = fs::read_to_string(&install_path)
            .map_err(|e| format!("Failed to read install info: {}", e))?;
        let info: InstallInfo = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse install info: {}", e))?;
        Ok(info)
    } else {
        // First installation
        let info = InstallInfo {
            first_run: Utc::now().timestamp(),
        };
        let json = serde_json::to_string_pretty(&info)
            .map_err(|e| format!("Failed to serialize install info: {}", e))?;
        fs::write(&install_path, json)
            .map_err(|e| format!("Failed to write install info: {}", e))?;
        Ok(info)
    }
}

/// Save license to app data folder
#[tauri::command]
pub fn save_license_to_cache(
    app: AppHandle,
    _public_key: String,
    magic_amount: String,
) -> Result<(), String> {
    let data_dir = get_app_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    // Generate license key with 6 months expiration
    let expiration_date = Utc::now() + Duration::days(LICENSE_DURATION_DAYS);
    let license_key = generate_license_key(expiration_date);

    let license_info = LicenseInfo {
        license_key,
        magic_amount,
        activated_at: Some(Utc::now().timestamp()),
    };

    let json = serde_json::to_string_pretty(&license_info)
        .map_err(|e| format!("Failed to serialize license: {}", e))?;

    // Save to "publiclic" file as requested
    let license_path = data_dir.join("publiclic");
    fs::write(&license_path, json).map_err(|e| format!("Failed to write license file: {}", e))?;

    Ok(())
}

/// Load license from app data folder
#[tauri::command]
pub fn load_license_from_cache(app: AppHandle) -> Result<LicenseInfo, String> {
    let data_dir = get_app_data_dir(&app)?;
    let license_path = data_dir.join("publiclic");

    if !license_path.exists() {
        return Err("License file not found".to_string());
    }

    let json = fs::read_to_string(&license_path)
        .map_err(|e| format!("Failed to read license file: {}", e))?;

    let license_info: LicenseInfo =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse license file: {}", e))?;

    Ok(license_info)
}

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub is_valid: bool,
    pub is_trial: bool,
    pub is_expired: bool,
    pub days_remaining: i64,
    pub expiration_date: Option<String>,
    pub requires_payment: bool,
}

/// Get or create setup info
fn get_setup_info(app: &AppHandle) -> Result<SetupInfo, String> {
    let data_dir = get_app_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    let setup_path = data_dir.join("publicsetup");

    if setup_path.exists() {
        let json = fs::read_to_string(&setup_path)
            .map_err(|e| format!("Failed to read setup info: {}", e))?;
        let info: SetupInfo = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse setup info: {}", e))?;
        Ok(info)
    } else {
        // First run - needs setup, don't create file yet
        let info = SetupInfo { first_start: false };
        // Don't write the file yet - let complete_first_start do it
        Ok(info)
    }
}

/// Check if first start setup is needed
#[tauri::command]
pub fn check_first_start(app: AppHandle) -> Result<bool, String> {
    let setup_info = get_setup_info(&app)?;
    Ok(!setup_info.first_start) // Returns true if setup is needed
}

/// Mark first start as completed
#[tauri::command]
pub fn complete_first_start(app: AppHandle) -> Result<(), String> {
    let data_dir = get_app_data_dir(&app)?;
    let setup_path = data_dir.join("publicsetup");

    let setup_info = SetupInfo { first_start: true };

    let json = serde_json::to_string_pretty(&setup_info)
        .map_err(|e| format!("Failed to serialize setup info: {}", e))?;

    fs::write(&setup_path, json).map_err(|e| format!("Failed to write setup info: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupConfig {
    pub model_tier: String,   // "basic", "medium", "powerful"
    pub total_memory_gb: f64, // Total RAM in GB
    #[serde(default)]
    pub update_no_ask: std::collections::HashMap<String, bool>, // Model update preferences
    /// Whether to use AMD iGPU via Vulkan for LLM inference.
    /// Defaults to false (safe). Populated by first-setup or by migrate_vulkan_config on update.
    #[serde(default)]
    pub vulkan_igpu_enabled: bool,
}

/// Ensure `vulkan_igpu_enabled` is present in config.json.
///
/// Called on every app startup (from lib.rs setup).
/// - If the field already exists → do nothing (respect saved value).
/// - If the field is absent (user updated from a pre-Vulkan version) →
///   run hardware detection silently and write the result so future startups
///   use the cached value without re-detecting.
pub fn migrate_vulkan_config(app: &AppHandle) {
    let data_dir = match get_app_data_dir(app) {
        Ok(d) => d,
        Err(_) => return,
    };
    let config_path = data_dir.join("config.json");
    if !config_path.exists() {
        return; // No config yet — first setup will create it with the correct value.
    }

    let json = match fs::read_to_string(&config_path) {
        Ok(j) => j,
        Err(_) => return,
    };

    // Parse as raw JSON to check if the key is already present.
    let raw: serde_json::Value = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(_) => return,
    };

    if raw.get("vulkan_igpu_enabled").is_some() {
        return; // Field exists — nothing to migrate.
    }

    // Field is missing: detect hardware and persist the result.
    let detected = crate::hardware::detect_vulkan_amd_igpu();

    let mut config: SetupConfig = match serde_json::from_str(&json) {
        Ok(c) => c,
        Err(_) => return,
    };
    config.vulkan_igpu_enabled = detected;

    if let Ok(new_json) = serde_json::to_string_pretty(&config) {
        let _ = fs::write(&config_path, new_json);
    }
    debug!("Vulkan config migrated: vulkan_igpu_enabled = {}", detected);
}

/// Save setup configuration
#[tauri::command]
pub fn save_setup_config(
    app: AppHandle,
    model_tier: String,
    total_memory_gb: f64,
    vulkan_igpu_enabled: bool,
) -> Result<(), String> {
    let data_dir = get_app_data_dir(&app)?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    let config = SetupConfig {
        model_tier,
        total_memory_gb,
        update_no_ask: std::collections::HashMap::new(),
        vulkan_igpu_enabled,
    };

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    let config_path = data_dir.join("config.json");
    fs::write(&config_path, json).map_err(|e| format!("Failed to write config file: {}", e))?;

    debug!("Setup config saved: {:?}", config);

    Ok(())
}

/// Toggle GPU acceleration in the saved config (can be called post-setup).
#[tauri::command]
pub fn set_gpu_acceleration_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let data_dir = get_app_data_dir(&app)?;
    let config_path = data_dir.join("config.json");

    let mut config = if config_path.exists() {
        let json = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str::<SetupConfig>(&json).unwrap_or_else(|_| SetupConfig {
            model_tier: "basic".to_string(),
            total_memory_gb: 0.0,
            update_no_ask: std::collections::HashMap::new(),
            vulkan_igpu_enabled: true,
        })
    } else {
        return Err("Config file not found".to_string());
    };

    config.vulkan_igpu_enabled = enabled;

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, json).map_err(|e| format!("Failed to write config: {}", e))?;

    debug!("GPU acceleration set to: {}", enabled);
    Ok(())
}

/// Load setup configuration
#[tauri::command]
pub fn load_setup_config(app: AppHandle) -> Result<SetupConfig, String> {
    let data_dir = get_app_data_dir(&app)?;
    let config_path = data_dir.join("config.json");

    if !config_path.exists() {
        return Err("Config file not found".to_string());
    }

    let json = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let config: SetupConfig =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse config file: {}", e))?;

    Ok(config)
}

/// Read EULA content from LICENSE_EULA.md file
#[tauri::command]
pub fn read_eula_content() -> Result<String, String> {
    // Embed the EULA directly into the binary
    Ok(include_str!("LICENSE_EULA.md").to_string())
}

/// Set model update preference (no ask again)
#[tauri::command]
pub fn set_model_update_no_ask(
    app: AppHandle,
    model_name: String,
    no_ask: bool,
) -> Result<(), String> {
    let data_dir = get_app_data_dir(&app)?;
    let config_path = data_dir.join("config.json");

    // Load existing config or create new one
    let mut config = if config_path.exists() {
        let json = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        serde_json::from_str::<SetupConfig>(&json)
            .unwrap_or_else(|_| SetupConfig {
                model_tier: "basic".to_string(),
                total_memory_gb: 0.0,
                update_no_ask: std::collections::HashMap::new(),
                vulkan_igpu_enabled: true,
            })
    } else {
        SetupConfig {
            model_tier: "basic".to_string(),
            total_memory_gb: 0.0,
            update_no_ask: std::collections::HashMap::new(),
            vulkan_igpu_enabled: true,
        }
    };

    // Update the preference
    config.update_no_ask.insert(model_name, no_ask);

    // Save config
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, json).map_err(|e| format!("Failed to write config file: {}", e))?;

    debug!("Model update preference saved");

    Ok(())
}

/// Copy license file to docs directory
#[tauri::command]
pub fn copy_license_to_docs(app: AppHandle) -> Result<String, String> {
    let data_dir = get_app_data_dir(&app)?;
    let docs_dir = data_dir.join("docs");

    // Create docs directory if it doesn't exist
    fs::create_dir_all(&docs_dir).map_err(|e| format!("Failed to create docs directory: {}", e))?;

    // Write LICENSE_LIQUID.txt (embedded in binary, same pattern as EULA)
    let liquid_content = include_str!("LICENSE_LIQUID.txt");
    let liquid_dest = docs_dir.join("LICENSE_LIQUID.txt");
    if let Err(e) = fs::write(&liquid_dest, liquid_content) {
        warn!("Failed to write LICENSE_LIQUID.txt: {}", e);
    }

    // Write LICENSE_EULA.md (embedded in binary)
    let eula_content = include_str!("LICENSE_EULA.md");
    let eula_dest = docs_dir.join("LICENSE_EULA.md");
    fs::write(&eula_dest, eula_content)
        .map_err(|e| format!("Failed to write LICENSE_EULA.md: {}", e))?;

    // Return the license file path
    liquid_dest
        .to_str()
        .ok_or("Failed to convert path to string".to_string())
        .map(|s| s.to_string())
}

/// Check payment on blockchain via RPC
#[tauri::command]
pub async fn check_blockchain_payment(magic_amount: String) -> Result<serde_json::Value, String> {
    // RPC endpoints to try
    let rpc_endpoints = vec![
        "https://1rpc.io/eth",
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
    ];

    let receiver_address = "0xC849612e4f29b81e5e6A40C9c6D543e0C41C863C";
    let usdt_contract = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

    // Try each RPC
    for rpc_url in &rpc_endpoints {
        debug!("[Licensing] Trying RPC: {}", rpc_url);

        match check_payment_on_rpc(rpc_url, &magic_amount, receiver_address, usdt_contract).await {
            Ok(result) => {
                debug!("[Licensing] RPC {} returned result", rpc_url);
                return Ok(result);
            }
            Err(e) => {
                debug!("[Licensing] RPC {} failed: {}", rpc_url, e);
                continue;
            }
        }
    }

    Err("All RPC endpoints failed".to_string())
}

async fn check_payment_on_rpc(
    rpc_url: &str,
    magic_amount: &str,
    receiver_address: &str,
    usdt_contract: &str,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    // Get latest block number
    let block_request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_blockNumber",
        "params": [],
        "id": 1
    });

    let block_response = client
        .post(rpc_url)
        .json(&block_request)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to get block number: {}", e))?;

    let block_json: serde_json::Value = block_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse block response: {}", e))?;

    let latest_block_hex = block_json["result"]
        .as_str()
        .ok_or("No block number in response")?;

    // Convert hex to u64
    let latest_block = u64::from_str_radix(latest_block_hex.trim_start_matches("0x"), 16)
        .map_err(|e| format!("Failed to parse block number: {}", e))?;

    // Check last 5000 blocks (~17 hours) - compatible with most public RPCs
    let from_block = latest_block.saturating_sub(5000);

    debug!("[Licensing] Checking blocks {} to {} (last ~17 hours)", from_block, latest_block);

    // Get USDT Transfer logs
    // Transfer event signature: keccak256("Transfer(address,address,uint256)")
    let transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    let receiver_topic = format!("0x{:0>64}", receiver_address.trim_start_matches("0x"));

    let logs_request = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_getLogs",
        "params": [{
            "fromBlock": format!("0x{:x}", from_block),
            "toBlock": format!("0x{:x}", latest_block),
            "address": usdt_contract,
            "topics": [transfer_topic, null, receiver_topic]
        }],
        "id": 2
    });

    let logs_response = client
        .post(rpc_url)
        .json(&logs_request)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to get logs: {}", e))?;

    let logs_json: serde_json::Value = logs_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse logs response: {}", e))?;

    // Check if we found matching payment
    if let Some(logs) = logs_json["result"].as_array() {
        debug!("[Licensing] Found {} transfer logs", logs.len());

        for log in logs {
            if let Some(data) = log["data"].as_str() {
                // Parse USDT amount (6 decimals)
                let amount_hex = data.trim_start_matches("0x");
                if let Ok(amount_raw) = u128::from_str_radix(amount_hex, 16) {
                    let amount = (amount_raw as f64) / 1_000_000.0;
                    let amount_str = format!("{:.6}", amount);

                    debug!("[Licensing] Found transfer: {}", amount_str);

                    if amount_str == magic_amount {
                        debug!("[Licensing] Payment matched!");
                        return Ok(serde_json::json!({
                            "found": true,
                            "transactionHash": log["transactionHash"],
                            "blockNumber": log["blockNumber"],
                            "amount": amount_str
                        }));
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "found": false,
        "latestBlock": latest_block
    }))
}

/// Check license validity with trial period support
#[tauri::command]
pub fn check_license_validity(app: AppHandle) -> LicenseStatus {
    // DEBUG: Force expired trial for testing
    if DEBUG_FORCE_EXPIRED_TRIAL {
        return LicenseStatus {
            is_valid: false,
            is_trial: true,
            is_expired: true,
            days_remaining: 0,
            expiration_date: None,
            requires_payment: true,
        };
    }

    // Try to load license
    if let Ok(license) = load_license_from_cache(app.clone()) {
        let (is_valid, is_expired, expiration_date) = validate_license_key(&license.license_key);

        if is_valid && !is_expired {
            let now = Utc::now();
            let exp_date = expiration_date.unwrap();
            let days_remaining = (exp_date - now).num_days();

            return LicenseStatus {
                is_valid: true,
                is_trial: false,
                is_expired: false,
                days_remaining,
                expiration_date: Some(exp_date.to_rfc3339()),
                requires_payment: false,
            };
        }
    }

    // No valid license, check trial period
    match get_install_info(&app) {
        Ok(install_info) => {
            let install_time = DateTime::from_timestamp(install_info.first_run, 0).unwrap();
            let now = Utc::now();
            let days_since_install = (now - install_time).num_days();

            if days_since_install < TRIAL_PERIOD_DAYS {
                // Still in trial period
                let days_remaining = TRIAL_PERIOD_DAYS - days_since_install;
                LicenseStatus {
                    is_valid: true,
                    is_trial: true,
                    is_expired: false,
                    days_remaining,
                    expiration_date: None,
                    requires_payment: false,
                }
            } else {
                // Trial expired, payment required
                LicenseStatus {
                    is_valid: false,
                    is_trial: true,
                    is_expired: true,
                    days_remaining: 0,
                    expiration_date: None,
                    requires_payment: true,
                }
            }
        }
        Err(_) => {
            // Can't determine install time, require payment
            LicenseStatus {
                is_valid: false,
                is_trial: false,
                is_expired: true,
                days_remaining: 0,
                expiration_date: None,
                requires_payment: true,
            }
        }
    }
}
