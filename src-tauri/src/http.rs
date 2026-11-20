//! Shared HTTP clients. A `reqwest::Client` owns a connection pool and TLS
//! state, so building one per command throws away keep-alive connections
//! (batch verification hits the same hosts dozens of times). Cloning a client
//! is cheap: it is a handle to the shared pool.

use std::sync::LazyLock;
use tauri_plugin_http::reqwest::Client;

static DEFAULT: LazyLock<Client> = LazyLock::new(Client::new);

static GITHUB_API: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent("klia-store")
        .build()
        .expect("failed to build HTTP client")
});

static VERIFICATION: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client")
});

/// No timeout, no custom user agent (image downloads, donation checks).
pub fn default_client() -> Client {
    DEFAULT.clone()
}

/// Identifies itself as `klia-store` (GitHub API requires a user agent).
pub fn github_client() -> Client {
    GITHUB_API.clone()
}

/// 30s overall timeout, used by hash verification.
pub fn verification_client() -> Client {
    VERIFICATION.clone()
}
