mod audio_engine;
mod dsp;

use std::sync::Mutex;
use std::time::Duration;

use audio_engine::{AudioDeviceInfo, AudioEngine, EngineConfig, SpectrumData};
use crossbeam_channel::Receiver;
use tauri::{AppHandle, Emitter};

/// Application state managed by Tauri.
struct AppState {
    engine: Option<AudioEngine>,
    spectrum_rx: Option<Receiver<SpectrumData>>,
}

// ─── Tauri Commands ─────────────────────────────────────────────────────

/// Lists available audio input devices (name, sample rates, channels).
#[tauri::command]
fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    audio_engine::list_audio_devices()
}

/// Starts the audio engine with the given configuration.
/// Spawns the spectrum forwarding loop that emits events to the frontend.
#[tauri::command]
fn start_engine(
    app: AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    config: Option<EngineConfig>,
) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;

    if state.engine.is_some() {
        return Err("Engine is already running".into());
    }

    let config = config.unwrap_or_default();
    let (engine, rx) = AudioEngine::start(config)?;

    state.engine = Some(engine);
    state.spectrum_rx = Some(rx.clone());

    // Spawn an async task that forwards spectrum data → Tauri events.
    // This decouples the DSP thread from the Tauri runtime.
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        spectrum_forwarder(app_handle, rx).await;
    });

    Ok("Engine started".into())
}

/// Stops the audio engine.
#[tauri::command]
fn stop_engine(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;

    if let Some(mut engine) = state.engine.take() {
        engine.stop();
        state.spectrum_rx = None;
        Ok("Engine stopped".into())
    } else {
        Err("Engine is not running".into())
    }
}

/// Returns whether the engine is currently running.
#[tauri::command]
fn is_engine_running(state: tauri::State<'_, Mutex<AppState>>) -> bool {
    state.lock().map(|s| s.engine.is_some()).unwrap_or(false)
}

// ─── Spectrum event forwarder ───────────────────────────────────────────

/// Reads processed spectrum data from the DSP thread's channel and emits
/// it to the frontend as `spectrum-data` events.
///
/// Runs on the Tauri async runtime (tokio), NOT on the audio thread.
/// Throttled inherently by the DSP thread's emission rate (~60 fps).
async fn spectrum_forwarder(app: AppHandle, rx: Receiver<SpectrumData>) {
    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(data) => {
                if let Err(e) = app.emit("spectrum-data", &data) {
                    log::error!("Failed to emit spectrum event: {e}");
                    break;
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                // Check if engine was stopped (channel disconnected will catch below)
                continue;
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                log::info!("Spectrum forwarder: channel closed, exiting");
                break;
            }
        }
    }
}

// ─── Entry point ────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("AudioTec v{} starting", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(AppState {
            engine: None,
            spectrum_rx: None,
        }))
        .invoke_handler(tauri::generate_handler![
            list_devices,
            start_engine,
            stop_engine,
            is_engine_running,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AudioTec");
}

fn main() {
    run();
}
