use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Copies a file the user picked into the app's attachment folder and returns the stored path.
#[tauri::command]
fn import_attachment(app: AppHandle, source: String) -> Result<String, String> {
    let source = PathBuf::from(source);
    let name = source
        .file_name()
        .ok_or("Ungültiger Dateiname")?
        .to_string_lossy()
        .to_string();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let target = attachments_dir(&app)?.join(format!("{stamp}_{name}"));
    fs::copy(&source, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

/// Deletes a stored attachment. Only files inside the attachment folder may be removed.
#[tauri::command]
fn delete_attachment(app: AppHandle, path: String) -> Result<(), String> {
    let dir = attachments_dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let target = match PathBuf::from(&path).canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(()), // already gone
    };
    if !target.starts_with(&dir) {
        return Err("Datei liegt außerhalb des Anhang-Ordners".into());
    }
    fs::remove_file(target).map_err(|e| e.to_string())
}

/// Opens a stored attachment with the system's default program.
#[tauri::command]
fn open_attachment(app: AppHandle, path: String) -> Result<(), String> {
    let dir = attachments_dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let target = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if !target.starts_with(&dir) {
        return Err("Datei liegt außerhalb des Anhang-Ordners".into());
    }
    tauri_plugin_opener::open_path(target, None::<&str>).map_err(|e| e.to_string())
}

/// Opens a folder the user linked as attachment in the file explorer.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.is_dir() {
        return Err("Ordner wurde nicht gefunden".into());
    }
    tauri_plugin_opener::open_path(target, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            import_attachment,
            delete_attachment,
            open_attachment,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
