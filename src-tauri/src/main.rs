mod audio_engine;
mod auto_eq;
mod dsp;
mod osc_client;
mod room_modes;
mod simulation;
mod spatial_average;
mod wave_calc;

use std::sync::Mutex;
use std::time::Duration;

use audio_engine::{AudioDeviceInfo, AudioEngine, EngineConfig, SpectrumData};
use crossbeam_channel::Receiver;
use simulation::{SimConfig, SimulationEngine};
use tauri::{AppHandle, Emitter};

/// Application state managed by Tauri.
struct AppState {
    engine: Option<AudioEngine>,
    simulation: Option<SimulationEngine>,
    spectrum_rx: Option<Receiver<SpectrumData>>,
    osc: osc_client::OscClient,
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

// ─── Simulation Commands ────────────────────────────────────────────────

/// Starts the simulation engine with synthetic audio signals.
#[tauri::command]
fn start_simulation(
    app: AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    config: Option<SimConfig>,
) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    if state.simulation.is_some() {
        return Err("Simulation is already running".into());
    }
    if state.engine.is_some() {
        return Err("Stop the real engine before starting simulation".into());
    }
    let config = config.unwrap_or_default();
    let signal_label = format!("{:?}", config.signal_type);
    let (sim, rx) = SimulationEngine::start(config)?;
    state.simulation = Some(sim);
    state.spectrum_rx = Some(rx.clone());
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        spectrum_forwarder(app_handle, rx).await;
    });
    Ok(format!("Simulation started: {signal_label}"))
}

/// Stops the simulation engine.
#[tauri::command]
fn stop_simulation(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    if let Some(mut sim) = state.simulation.take() {
        sim.stop();
        state.spectrum_rx = None;
        Ok("Simulation stopped".into())
    } else {
        Err("Simulation is not running".into())
    }
}

/// Returns whether the simulation is currently running.
#[tauri::command]
fn is_simulation_running(state: tauri::State<'_, Mutex<AppState>>) -> bool {
    state.lock().map(|s| s.simulation.is_some()).unwrap_or(false)
}

// ─── Wave Calculator Commands ───────────────────────────────────────────

/// Computes wavelength, delay, and speed-of-sound for given parameters.
#[tauri::command]
fn calculate_wave(req: wave_calc::WaveCalcRequest) -> wave_calc::WaveCalcResult {
    wave_calc::compute(&req)
}

// ─── Room Modes Commands ────────────────────────────────────────────────

/// Computes room modal frequencies for a rectangular enclosure.
#[tauri::command]
fn calculate_room_modes(req: room_modes::RoomModesRequest) -> room_modes::RoomModesResult {
    room_modes::compute(&req)
}

// ─── Spatial Average Commands ───────────────────────────────────────────

/// Power-averages multiple stored measurements into a single trace.
#[tauri::command]
fn compute_spatial_average(
    traces: Vec<spatial_average::StoredTrace>,
) -> Result<spatial_average::SpatialAverageResult, String> {
    spatial_average::compute(&traces).map_err(|e| e.to_string())
}

// ─── Auto-EQ Commands ───────────────────────────────────────────────────

/// Runs the auto-EQ algorithm: compares measured vs target and proposes PEQ bands.
#[tauri::command]
fn compute_auto_eq(req: auto_eq::AutoEqRequest) -> auto_eq::AutoEqResult {
    auto_eq::compute(&req)
}

// ─── OSC Commands ───────────────────────────────────────────────────────

/// Connects to a Behringer X32 / Midas M32 console via OSC.
#[tauri::command]
fn osc_connect(
    state: tauri::State<'_, Mutex<AppState>>,
    config: osc_client::OscConfig,
) -> Result<osc_client::OscStatus, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    state.osc.connect(config)
}

/// Disconnects from the OSC console.
#[tauri::command]
fn osc_disconnect(state: tauri::State<'_, Mutex<AppState>>) -> Result<String, String> {
    let mut state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    state.osc.disconnect();
    Ok("Disconnected".into())
}

/// Returns the current OSC connection status.
#[tauri::command]
fn osc_status(state: tauri::State<'_, Mutex<AppState>>) -> Result<osc_client::OscStatus, String> {
    let state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    Ok(state.osc.status())
}

/// Pushes PEQ bands to a channel/bus on the X32 via OSC.
#[tauri::command]
fn osc_push_eq(
    state: tauri::State<'_, Mutex<AppState>>,
    target: osc_client::OscEqTarget,
    bands: Vec<auto_eq::PeqBand>,
) -> Result<usize, String> {
    let state = state.lock().map_err(|e| format!("Lock error: {e}"))?;
    state.osc.push_eq(&target, &bands)
}

// ─── Spectrum event forwarder ───────────────────────────────────────────

/// Serialises [`SpectrumData`] to a flat `Vec<u8>` of little-endian `f32` values.
///
/// Wire format (all f32, LE):
///   [sampleRate, fftSize, ...frequencies, ...magnitudeRef, ...magnitudeMeas,
///    ...transferMagnitude, ...transferPhase, ...coherence]
///
/// Total length: `(2 + 6 * binCount) * 4` bytes.
fn spectrum_to_binary(data: &SpectrumData) -> Vec<u8> {
    let bin_count = data.frequencies.len();
    let total_floats = 2 + 6 * bin_count;
    let mut buf = Vec::with_capacity(total_floats * 4);

    buf.extend_from_slice(&(data.sample_rate).to_le_bytes());
    buf.extend_from_slice(&(data.fft_size as f32).to_le_bytes());

    for slice in [
        &data.frequencies,
        &data.magnitude_ref,
        &data.magnitude_meas,
        &data.transfer_magnitude,
        &data.transfer_phase,
        &data.coherence,
    ] {
        for &v in slice.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
    }

    buf
}

/// Reads processed spectrum data from the DSP thread's channel and emits
/// it to the frontend as both `spectrum-data` (JSON) and `audio-frame`
/// (binary) events.
///
/// Runs on the Tauri async runtime (tokio), NOT on the audio thread.
/// Throttled inherently by the DSP thread's emission rate (~60 fps).
async fn spectrum_forwarder(app: AppHandle, rx: Receiver<SpectrumData>) {
    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(data) => {
                // Binary path — zero-copy Float32Array on the JS side
                let binary = spectrum_to_binary(&data);
                let _ = app.emit("audio-frame", binary);

                // JSON path — kept for backward compatibility
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
            simulation: None,
            spectrum_rx: None,
            osc: osc_client::OscClient::new(),
        }))
        .invoke_handler(tauri::generate_handler![
            list_devices,
            start_engine,
            stop_engine,
            is_engine_running,
            start_simulation,
            stop_simulation,
            is_simulation_running,
            calculate_wave,
            calculate_room_modes,
            compute_spatial_average,
            compute_auto_eq,
            osc_connect,
            osc_disconnect,
            osc_status,
            osc_push_eq,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AudioTec");
}

fn main() {
    run();
}
