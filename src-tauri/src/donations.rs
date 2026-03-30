use tauri_plugin_http::reqwest;

// ─── BTC ─────────────────────────────────────────────────────────────────────

/// Verify a Bitcoin donation using the Blockstream.info public API (no key needed).
/// Checks recent transactions to `wallet` for an output matching `amount_btc`.
#[tauri::command]
pub async fn verify_btc_donation(
    wallet: String,
    amount_btc: String,
) -> Result<serde_json::Value, String> {
    let amount_f64: f64 = amount_btc
        .parse()
        .map_err(|_| "Invalid BTC amount".to_string())?;

    // 1 BTC = 100_000_000 satoshis
    let target_satoshis = (amount_f64 * 100_000_000.0).round() as u64;

    let client = reqwest::Client::new();

    let endpoints = [
        format!("https://blockstream.info/api/address/{}/txs", wallet),
        format!("https://mempool.space/api/address/{}/txs", wallet),
    ];

    for url in &endpoints {
        let resp = match client
            .get(url)
            .header("Accept", "application/json")
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let text = match resp.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };

        let txs: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(txs_array) = txs.as_array() {
            for tx in txs_array {
                if let Some(vouts) = tx["vout"].as_array() {
                    for vout in vouts {
                        let addr = vout["scriptpubkey_address"].as_str().unwrap_or("");
                        let value = vout["value"].as_u64().unwrap_or(0);

                        if addr == wallet && value == target_satoshis {
                            let txid = tx["txid"].as_str().unwrap_or("").to_string();
                            let confirmed =
                                tx["status"]["confirmed"].as_bool().unwrap_or(false);
                            return Ok(serde_json::json!({
                                "found": true,
                                "txId": txid,
                                "amount": amount_btc,
                                "confirmed": confirmed
                            }));
                        }
                    }
                }
            }
        }

        // Endpoint responded — no matching output found in recent txs
        return Ok(serde_json::json!({ "found": false }));
    }

    Err("All BTC API endpoints failed".to_string())
}

// ─── USDT on Ethereum ────────────────────────────────────────────────────────

/// Verify a USDT (ERC-20) donation on Ethereum using free public RPC nodes.
/// Checks Transfer events to `wallet` in the last ~17 h of blocks (~5000).
#[tauri::command]
pub async fn verify_usdt_eth_donation(
    wallet: String,
    amount_usdt: String,
) -> Result<serde_json::Value, String> {
    let amount_f64: f64 = amount_usdt
        .parse()
        .map_err(|_| "Invalid USDT amount".to_string())?;

    // USDT has 6 decimals
    let target_raw = (amount_f64 * 1_000_000.0).round() as u128;
    let target_str = format!("{:.6}", amount_f64);

    let rpc_endpoints = [
        "https://1rpc.io/eth",
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
    ];

    // USDT contract on Ethereum mainnet
    let usdt_contract = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    // keccak256("Transfer(address,address,uint256)")
    let transfer_topic =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    let receiver_topic = format!(
        "0x{:0>64}",
        wallet.trim_start_matches("0x").to_lowercase()
    );

    let client = reqwest::Client::new();

    for rpc_url in &rpc_endpoints {
        // 1. Get latest block number
        let block_body = serde_json::to_string(&serde_json::json!({
            "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1
        }))
        .unwrap();

        let block_resp = match client
            .post(*rpc_url)
            .header("Content-Type", "application/json")
            .body(block_body)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let block_text = match block_resp.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };

        let block_json: serde_json::Value = match serde_json::from_str(&block_text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let latest_hex = match block_json["result"].as_str() {
            Some(h) => h,
            None => continue,
        };

        let latest_block =
            match u64::from_str_radix(latest_hex.trim_start_matches("0x"), 16) {
                Ok(b) => b,
                Err(_) => continue,
            };

        let from_block = latest_block.saturating_sub(5000);

        // 2. Fetch USDT Transfer events directed to `wallet`
        let logs_body = serde_json::to_string(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "eth_getLogs",
            "params": [{
                "fromBlock": format!("0x{:x}", from_block),
                "toBlock":   format!("0x{:x}", latest_block),
                "address": usdt_contract,
                "topics": [transfer_topic, null, receiver_topic]
            }],
            "id": 2
        }))
        .unwrap();

        let logs_resp = match client
            .post(*rpc_url)
            .header("Content-Type", "application/json")
            .body(logs_body)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let logs_text = match logs_resp.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };

        let logs_json: serde_json::Value = match serde_json::from_str(&logs_text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Some(logs) = logs_json["result"].as_array() {
            for log in logs {
                if let Some(data) = log["data"].as_str() {
                    let hex = data.trim_start_matches("0x");
                    if let Ok(raw) = u128::from_str_radix(hex, 16) {
                        let actual = (raw as f64) / 1_000_000.0;
                        let actual_str = format!("{:.6}", actual);
                        if actual_str == target_str || raw == target_raw {
                            let txid = log["transactionHash"]
                                .as_str()
                                .unwrap_or("")
                                .to_string();
                            return Ok(serde_json::json!({
                                "found": true,
                                "txId": txid,
                                "amount": actual_str
                            }));
                        }
                    }
                }
            }
        }

        // RPC responded — no matching transfer found
        return Ok(serde_json::json!({ "found": false }));
    }

    Err("All Ethereum RPC endpoints failed".to_string())
}
