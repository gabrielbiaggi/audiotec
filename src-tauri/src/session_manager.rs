//! Session Manager — Persist & restore DSP engine state + stored traces.
//!
//! Each session is a JSON file under `<app-data-dir>/sessions/`.
//! Path traversal is prevented by sanitising the session name before
//! building the file path.

use serde::{Deserialize, Serialize};
use std::path::Path;

// ─── Data Structures ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub engine_config: SessionEngineConfig,
    pub view_settings: SessionViewSettings,
    pub stored_traces: Vec<SessionTrace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEngineConfig {
    pub fft_size: usize,
    pub window_type: String,
    pub sample_rate: u32,
    pub num_averages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionViewSettings {
    pub view_mode: String,
    pub coherence_threshold: f32,
    pub show_ref: bool,
    pub show_meas: bool,
    pub show_coherence: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTrace {
    pub label: String,
    pub frequencies: Vec<f32>,
    pub magnitude_db: Vec<f32>,
    pub phase_deg: Vec<f32>,
    pub coherence: Vec<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub name: String,
    pub created_at: String,
    pub file_path: String,
    pub size_bytes: u64,
}

// ─── Public API ─────────────────────────────────────────────────────────

/// Save a session to `<sessions_dir>/<sanitised-name>.json`.
pub fn save(sessions_dir: &Path, data: &SessionData) -> Result<String, String> {
    std::fs::create_dir_all(sessions_dir)
        .map_err(|e| format!("Cannot create sessions directory: {e}"))?;

    let filename = sanitize_filename(&data.name);
    if filename.is_empty() {
        return Err("Session name is invalid (empty after sanitisation)".into());
    }

    let file_path = sessions_dir.join(format!("{filename}.json"));
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Serialization error: {e}"))?;
    std::fs::write(&file_path, &json)
        .map_err(|e| format!("Cannot write session file: {e}"))?;

    Ok(file_path.display().to_string())
}

/// Load a session from `<sessions_dir>/<sanitised-name>.json`.
pub fn load(sessions_dir: &Path, name: &str) -> Result<SessionData, String> {
    let filename = sanitize_filename(name);
    let file_path = sessions_dir.join(format!("{filename}.json"));

    if !file_path.exists() {
        return Err(format!("Session not found: {name}"));
    }

    let json = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Cannot read session file: {e}"))?;
    let data: SessionData = serde_json::from_str(&json)
        .map_err(|e| format!("Deserialization error: {e}"))?;

    Ok(data)
}

/// List all saved sessions, sorted newest-first by `created_at`.
pub fn list(sessions_dir: &Path) -> Result<Vec<SessionInfo>, String> {
    if !sessions_dir.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(sessions_dir)
        .map_err(|e| format!("Cannot read sessions directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Metadata error: {e}"))?;
        let json = std::fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;

        if let Ok(data) = serde_json::from_str::<SessionData>(&json) {
            sessions.push(SessionInfo {
                name: data.name,
                created_at: data.created_at,
                file_path: path.display().to_string(),
                size_bytes: metadata.len(),
            });
        }
    }

    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

/// Delete a session file.
pub fn delete(sessions_dir: &Path, name: &str) -> Result<(), String> {
    let filename = sanitize_filename(name);
    let file_path = sessions_dir.join(format!("{filename}.json"));

    if !file_path.exists() {
        return Err(format!("Session not found: {name}"));
    }

    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Cannot delete session: {e}"))?;

    Ok(())
}

// ─── Helpers ────────────────────────────────────────────────────────────

/// Sanitise a user-supplied name so it is safe to use as a filename.
/// Only alphanumeric characters, hyphens, underscores and spaces survive.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>()
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_blocks_path_traversal() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_filename("my session"), "my session");
        assert_eq!(sanitize_filename("a/b\\c"), "abc");
    }

    #[test]
    fn sanitize_empty() {
        assert_eq!(sanitize_filename("///"), "");
    }
}
