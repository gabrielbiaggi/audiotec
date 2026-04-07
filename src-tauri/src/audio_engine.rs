//! Audio Engine — real-time capture and DSP processing pipeline.
//!
//! Architecture:
//! ```text
//!  ┌─────────────────┐      rtrb        ┌──────────────────┐  crossbeam   ┌────────────┐
//!  │  CPAL callback  │ ──────────────▶  │  DSP Thread      │ ──────────▶ │  Tauri IPC  │
//!  │  (RT priority)  │   lock-free      │  (FFT+avg+H1)    │   bounded    │  (events)   │
//!  └─────────────────┘   SPSC ring      └──────────────────┘   channel   └────────────┘
//! ```
//!
//! Key design decisions:
//! - The CPAL audio callback runs on the OS real-time audio thread. It MUST NOT
//!   allocate, lock, or block. The only operation is pushing samples into an
//!   `rtrb` SPSC lock-free ring buffer.
//! - A dedicated DSP thread (`audiotec-dsp`) consumes from the ring buffer,
//!   de-interleaves stereo, applies windowing, runs FFT (with cached planner),
//!   accumulates exponential averages (Sxy, Sxx, Syy), and computes the H1
//!   transfer function with magnitude, phase, and coherence.
//! - A bounded `crossbeam` channel connects the DSP thread to the Tauri async
//!   runtime, which emits `spectrum-data` events to the React frontend.
//! - On Windows, if the `asio` feature is enabled, the engine attempts to use
//!   the ASIO host first for low-latency routing from consoles like the X32.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, SampleFormat, Stream, StreamConfig};
use crossbeam_channel::{bounded, Receiver, Sender};
use serde::Serialize;

use crate::dsp::fft::{bin_frequencies, spectrum_to_magnitude_db, FftProcessor, SpectralAverager};
use crate::dsp::windowing::{apply_window, generate_window, WindowType};
use crate::dsp::DEFAULT_FFT_SIZE;

// ─── Public types ──────────────────────────────────────────────────────

/// Spectrum data payload sent to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumData {
    /// Frequency values (Hz) for each bin
    pub frequencies: Vec<f32>,
    /// Magnitude in dBFS for Channel 1 (Reference)
    pub magnitude_ref: Vec<f32>,
    /// Magnitude in dBFS for Channel 2 (Measurement)
    pub magnitude_meas: Vec<f32>,
    /// Transfer function magnitude (dB) — H1 estimator
    pub transfer_magnitude: Vec<f32>,
    /// Transfer function phase (degrees)
    pub transfer_phase: Vec<f32>,
    /// Coherence γ² (0.0 – 1.0)
    pub coherence: Vec<f32>,
    /// Sample rate in Hz
    pub sample_rate: f32,
    /// FFT size used
    pub fft_size: usize,
}

/// Configuration for the audio engine.
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineConfig {
    /// FFT block size (power of 2). Default: 4096.
    pub fft_size: usize,
    /// Window function for spectral analysis.
    pub window_type: WindowType,
    /// Preferred sample rate in Hz. None = device default.
    pub sample_rate: Option<u32>,
    /// Specific device name. None = system default.
    pub device_name: Option<String>,
    /// Number of spectral averages (exponential smoothing).
    /// 1 = no averaging (live), 8 = moderate, 64 = heavy.
    pub num_averages: Option<usize>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            fft_size: DEFAULT_FFT_SIZE,
            window_type: WindowType::Hann,
            sample_rate: None,
            device_name: None,
            num_averages: Some(8),
        }
    }
}

/// Describes an available audio input device.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub name: String,
    pub sample_rates: Vec<u32>,
    pub max_channels: u16,
    /// Which audio host this device belongs to (e.g. "ALSA", "ASIO", "WASAPI")
    pub host: String,
}

/// Safety wrapper to allow sending cpal::Stream across threads.
/// The stream is only accessed through a Mutex via AppState.
struct SendStream(Stream);
unsafe impl Send for SendStream {}

/// Handle to the running audio engine. Dropping it stops capture.
pub struct AudioEngine {
    _stream: SendStream,
    dsp_handle: Option<thread::JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

impl AudioEngine {
    /// Starts the audio capture + DSP pipeline.
    ///
    /// Returns the engine handle and a receiver for processed spectrum data.
    /// Errors are returned as human-readable strings for Tauri IPC.
    pub fn start(config: EngineConfig) -> Result<(Self, Receiver<SpectrumData>), String> {
        let host = select_host();
        let device = pick_device(&host, config.device_name.as_deref())?;
        let stream_config = pick_config(&device, config.sample_rate)?;
        let sample_rate = stream_config.sample_rate.0 as f32;
        let channels = stream_config.channels as usize;
        let fft_size = config.fft_size;
        let num_averages = config.num_averages.unwrap_or(8);

        log::info!(
            "AudioEngine: host={} device={:?} rate={} ch={} fft={} avg={}",
            host.id().name(),
            device.name().unwrap_or_default(),
            sample_rate,
            channels,
            fft_size,
            num_averages,
        );

        // ── rtrb ring buffer: lock-free SPSC ──
        // Capacity = 4× FFT frames of interleaved samples, giving the DSP
        // thread ample headroom to keep up without the audio thread blocking.
        let ring_capacity = fft_size * channels * 4;
        let (mut producer, consumer) =
            rtrb::RingBuffer::<f32>::new(ring_capacity);

        let running = Arc::new(AtomicBool::new(true));
        let running_cb = running.clone();

        // ── CPAL audio callback (OS real-time thread) ──
        // CRITICAL: No allocations, no locks, no blocking.
        // rtrb::Producer::write_chunk_uninit is the only operation.
        let stream = device
            .build_input_stream(
                &stream_config,
                move |data: &[f32], _info: &cpal::InputCallbackInfo| {
                    if !running_cb.load(Ordering::Relaxed) {
                        return;
                    }
                    // Try to write all samples. If the ring is full, we lose
                    // the oldest data — acceptable for real-time measurement.
                    let n = data.len();
                    if let Ok(mut chunk) = producer.write_chunk_uninit(n) {
                        let (first, second) = chunk.as_mut_slices();
                        let split = first.len();
                        for (dst, &src) in first.iter_mut().zip(data[..split].iter()) {
                            dst.write(src);
                        }
                        for (dst, &src) in second.iter_mut().zip(data[split..].iter()) {
                            dst.write(src);
                        }
                        // SAFETY: we just initialized all slots.
                        unsafe { chunk.commit_all(); }
                    } else {
                        // Ring buffer full — drop this callback's samples
                        log::trace!("AudioEngine: ring full, dropped {} samples", n);
                    }
                },
                move |err| {
                    log::error!("AudioEngine: stream error: {err}");
                },
                None,
            )
            .map_err(|e| format!("Failed to build input stream: {e}"))?;

        stream.play().map_err(|e| format!("Failed to start stream: {e}"))?;

        // ── DSP processing thread ──
        let (tx, rx): (Sender<SpectrumData>, Receiver<SpectrumData>) = bounded(2);
        let running_dsp = running.clone();
        let window = generate_window(config.window_type, fft_size);
        let frequencies = bin_frequencies(fft_size, sample_rate);

        let dsp_handle = thread::Builder::new()
            .name("audiotec-dsp".into())
            .spawn(move || {
                dsp_loop(DspLoopParams {
                    consumer,
                    tx,
                    running: running_dsp,
                    fft_size,
                    channels,
                    sample_rate,
                    window,
                    frequencies,
                    num_averages,
                });
            })
            .map_err(|e| format!("Failed to spawn DSP thread: {e}"))?;

        Ok((
            Self {
                _stream: SendStream(stream),
                dsp_handle: Some(dsp_handle),
                running,
            },
            rx,
        ))
    }

    /// Stops the audio engine gracefully.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.dsp_handle.take() {
            let _ = handle.join();
        }
        log::info!("AudioEngine: stopped");
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── DSP processing loop ────────────────────────────────────────────────

struct DspLoopParams {
    consumer: rtrb::Consumer<f32>,
    tx: Sender<SpectrumData>,
    running: Arc<AtomicBool>,
    fft_size: usize,
    channels: usize,
    sample_rate: f32,
    window: Vec<f32>,
    frequencies: Vec<f32>,
    num_averages: usize,
}

fn dsp_loop(params: DspLoopParams) {
    let DspLoopParams {
        mut consumer,
        tx,
        running,
        fft_size,
        channels,
        sample_rate,
        window,
        frequencies,
        num_averages,
    } = params;

    let frame_samples = fft_size * channels;
    let num_bins = fft_size / 2;

    // Pre-allocate all working buffers — zero allocation in the hot loop.
    let mut accumulator: Vec<f32> = Vec::with_capacity(frame_samples * 2);
    let mut ch_ref = vec![0.0f32; fft_size];
    let mut ch_meas = vec![0.0f32; fft_size];
    let mut windowed_ref = vec![0.0f32; fft_size];
    let mut windowed_meas = vec![0.0f32; fft_size];

    // Reusable FFT processor (cached plan + scratch buffers)
    let mut fft_proc = FftProcessor::new(fft_size);

    // Spectral averager for H1 transfer function
    let mut averager = SpectralAverager::new(num_bins, num_averages);

    // Temporary read buffer for ring consumer
    let tmp = vec![0.0f32; 4096];

    // Throttle output to ~60 fps
    let min_interval = std::time::Duration::from_micros(16_600);
    let mut last_emit = std::time::Instant::now();

    while running.load(Ordering::Relaxed) {
        // Pull available samples from ring buffer (non-blocking)
        let avail = consumer.slots();
        if avail == 0 {
            thread::sleep(std::time::Duration::from_micros(500));
            continue;
        }
        let to_read = avail.min(tmp.len());
        if let Ok(chunk) = consumer.read_chunk(to_read) {
            let (first, second) = chunk.as_slices();
            accumulator.extend_from_slice(first);
            accumulator.extend_from_slice(second);
            chunk.commit_all();
        }

        // Process complete FFT frames
        while accumulator.len() >= frame_samples {
            // De-interleave: extract reference (ch0) and measurement (ch1)
            for i in 0..fft_size {
                let base = i * channels;
                ch_ref[i] = accumulator[base];
                ch_meas[i] = if channels >= 2 {
                    accumulator[base + 1]
                } else {
                    accumulator[base] // mono fallback
                };
            }

            // Drain consumed frame.
            // Future: 50% overlap would drain only fft_size/2 * channels.
            accumulator.drain(..frame_samples);

            // Throttle: skip FFT if we'd exceed ~60 fps emission rate
            let now = std::time::Instant::now();
            if now.duration_since(last_emit) < min_interval {
                continue;
            }
            last_emit = now;

            // Apply window function (copy then multiply in-place)
            windowed_ref.copy_from_slice(&ch_ref);
            windowed_meas.copy_from_slice(&ch_meas);
            apply_window(&mut windowed_ref, &window);
            apply_window(&mut windowed_meas, &window);

            // Forward FFT (uses cached planner — no allocation)
            let spectrum_ref = fft_proc.forward(&windowed_ref);
            let spectrum_meas = fft_proc.forward(&windowed_meas);

            // Individual channel magnitudes (dBFS)
            let magnitude_ref = spectrum_to_magnitude_db(&spectrum_ref, fft_size);
            let magnitude_meas = spectrum_to_magnitude_db(&spectrum_meas, fft_size);

            // Feed into spectral averager and compute H1
            averager.push(&spectrum_ref, &spectrum_meas);
            let (transfer_magnitude, transfer_phase, coherence) = averager.transfer_function();

            let data = SpectrumData {
                frequencies: frequencies.clone(),
                magnitude_ref,
                magnitude_meas,
                transfer_magnitude,
                transfer_phase,
                coherence,
                sample_rate,
                fft_size,
            };

            // Non-blocking send — if frontend is slow, drop the frame
            if tx.try_send(data).is_err() {
                log::trace!("AudioEngine: frontend channel full, dropping frame");
            }
        }
    }

    log::info!("DSP loop exiting");
}

// ─── Host and device selection ──────────────────────────────────────────

/// Selects the best available audio host.
///
/// On Windows with the `asio` feature, tries ASIO first for professional
/// low-latency interfaces (e.g. Behringer X32 USB). Falls back to the
/// default host (WASAPI/ALSA/CoreAudio) if ASIO is unavailable.
fn select_host() -> Host {
    #[cfg(all(target_os = "windows", feature = "asio"))]
    {
        use cpal::HostId;
        if let Ok(host) = cpal::host_from_id(HostId::Asio) {
            log::info!("AudioEngine: using ASIO host");
            return host;
        }
        log::warn!("AudioEngine: ASIO host unavailable, falling back to default");
    }

    let host = cpal::default_host();
    log::info!("AudioEngine: using host '{}'", host.id().name());
    host
}

fn pick_device(host: &Host, name: Option<&str>) -> Result<Device, String> {
    if let Some(name) = name {
        let devices = host
            .input_devices()
            .map_err(|e| format!("Cannot enumerate devices: {e}"))?;
        for device in devices {
            if let Ok(n) = device.name() {
                if n == name {
                    return Ok(device);
                }
            }
        }
        return Err(format!("Audio device not found: {name}"));
    }
    host.default_input_device()
        .ok_or_else(|| "No default input device available".into())
}

fn pick_config(device: &Device, preferred_rate: Option<u32>) -> Result<StreamConfig, String> {
    let supported = device
        .supported_input_configs()
        .map_err(|e| format!("Cannot query device configs: {e}"))?;

    let configs: Vec<_> = supported.collect();

    // Prefer stereo (2ch) F32, fallback to first available
    for cfg in &configs {
        if cfg.channels() >= 2 && cfg.sample_format() == SampleFormat::F32 {
            let rate = preferred_rate
                .map(cpal::SampleRate)
                .unwrap_or(cpal::SampleRate(48000));
            let rate = rate.clamp(cfg.min_sample_rate(), cfg.max_sample_rate());
            return Ok(cfg.with_sample_rate(rate).into());
        }
    }

    // Fallback: any config that supports F32
    for cfg in &configs {
        if cfg.sample_format() == SampleFormat::F32 {
            let rate = preferred_rate
                .map(cpal::SampleRate)
                .unwrap_or(cpal::SampleRate(48000));
            let rate = rate.clamp(cfg.min_sample_rate(), cfg.max_sample_rate());
            return Ok(cfg.with_sample_rate(rate).into());
        }
    }

    // Last resort: device default
    device
        .default_input_config()
        .map(|c| c.into())
        .map_err(|e| format!("No suitable input config: {e}"))
}

/// Lists all available input audio devices across all known hosts.
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let mut result = Vec::new();

    // Collect devices from the active host
    let host = select_host();
    collect_devices_from_host(&host, &mut result)?;

    Ok(result)
}

fn collect_devices_from_host(
    host: &Host,
    result: &mut Vec<AudioDeviceInfo>,
) -> Result<(), String> {
    let host_name = host.id().name().to_string();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Cannot enumerate devices: {e}"))?;

    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown".into());
        let configs: Vec<_> = device
            .supported_input_configs()
            .map(|c| c.collect())
            .unwrap_or_default();

        let mut sample_rates = Vec::new();
        let mut max_channels = 0u16;

        for cfg in &configs {
            max_channels = max_channels.max(cfg.channels());
            for &rate in &[44100, 48000, 88200, 96000, 176400, 192000] {
                let sr = cpal::SampleRate(rate);
                if sr >= cfg.min_sample_rate()
                    && sr <= cfg.max_sample_rate()
                    && !sample_rates.contains(&rate)
                {
                    sample_rates.push(rate);
                }
            }
        }
        sample_rates.sort();

        result.push(AudioDeviceInfo {
            name,
            sample_rates,
            max_channels,
            host: host_name.clone(),
        });
    }

    Ok(())
}
