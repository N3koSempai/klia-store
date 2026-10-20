use std::fs;
use tauri::Manager;
use tauri_plugin_http::reqwest;

#[tauri::command]
pub fn get_cache_image_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    Ok(cache_images_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn clear_old_cache(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    let index_path = cache_images_dir.join("index.json");

    if index_path.exists() {
        debug_println!("[Cache] Old cache system detected (index.json found). Clearing...");
        if cache_images_dir.exists() {
            fs::remove_dir_all(&cache_images_dir)
                .map_err(|e| format!("Failed to clear old cache directory: {}", e))?;

            // Recreate the directory
            fs::create_dir_all(&cache_images_dir)
                .map_err(|e| format!("Failed to recreate cache directory: {}", e))?;
        }
    }
    Ok(())
}

// Shared by every cache-image command: picks the hashing key (cacheKey takes
// priority over the raw URL when provided and different) and the extension
// inferred from the image URL, then returns the resulting cache filename.
fn compute_cache_filename(cache_key: &str, image_url: &str) -> String {
    use xxhash_rust::xxh3::xxh3_64;

    let key_to_hash = if !cache_key.is_empty() && cache_key != image_url {
        cache_key
    } else {
        image_url
    };

    let extension = if image_url.ends_with(".svg") || image_url.contains(".svg?") {
        "svg"
    } else if image_url.ends_with(".webp") || image_url.contains(".webp?") {
        "webp"
    } else if image_url.ends_with(".jpg")
        || image_url.ends_with(".jpeg")
        || image_url.contains(".jpg?")
        || image_url.contains(".jpeg?")
    {
        "jpg"
    } else {
        "png" // default
    };

    let hash = xxh3_64(key_to_hash.as_bytes());
    format!("{:x}.{}", hash, extension)
}

pub(crate) fn canonical_path_string(path: &std::path::Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub async fn download_and_cache_image(
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

    let filename = compute_cache_filename(&app_id, &image_url);
    let file_path = cache_images_dir.join(&filename);

    // Si el archivo ya existe, no descargar de nuevo
    if file_path.exists() {
        return Ok(canonical_path_string(&file_path));
    }

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

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Error reading image bytes: {}", e))?;

    fs::write(&file_path, &bytes).map_err(|e| format!("Error saving image: {}", e))?;

    Ok(canonical_path_string(&file_path))
}

#[tauri::command]
pub fn get_cached_image_path(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let file_path = app_data_dir.join("cacheImages").join(filename);
    Ok(canonical_path_string(&file_path))
}

#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn get_cached_image_info(
    app: tauri::AppHandle,
    cache_key: String,
    image_url: String,
) -> Result<String, String> {
    // Combina check_cached_image_exists + get_cached_image_path en una sola llamada
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let cache_images_dir = app_data_dir.join("cacheImages");
    let filename = compute_cache_filename(&cache_key, &image_url);
    let file_path = cache_images_dir.join(&filename);

    if file_path.exists() {
        Ok(canonical_path_string(&file_path))
    } else {
        Err("Image not found in cache".to_string())
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_filename_is_deterministic_and_key_sensitive() {
        let a = compute_cache_filename("k1", "https://x/y.png");
        assert_eq!(a, compute_cache_filename("k1", "https://x/y.png"));
        assert_ne!(a, compute_cache_filename("k2", "https://x/y.png"));
    }
}
