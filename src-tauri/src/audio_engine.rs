///! Audio Engine — real-time capture and DSP processing pipeline.
///!
///! Architecture:
///! ```text
///!  ┌─────────────────┐     ringbuf      ┌─────────────────┐     mpsc      ┌────────────┐
///!  │  CPAL callback  │ ──────────────▶  │  DSP Thread     │ ───────────▶ │  Tauri IPC  │
///!  │  (RT priority)  │   lock-free      │  (FFT + window) │   channel    │  (events)   │
///!  └─────────────────┘                  └─────────────────┘              └────────────┘
///! ```
///!
///! - The CPAL audio callback runs on the OS audio thread (real-time priority).
///!   It pushes interleaved stereo samples into a lock-free ring buffer.
///! - A dedicated DSP thread consumes from the ring buffer, de-interleaves,
///!   applies windowing, runs FFT, and sends the result via crossbeam channel.
///! - The Tauri event loop reads from the channel and emits to the frontend.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use crossbeam_channel::{bounded, Receiver, Sender};
use ringbuf::{
    traits::{Consumer, Producer, Split},
    HeapRb,
};
use serde::Serialize;

use crate::dsp::fft::{bin_frequencies, forward_fft, spectrum_to_magnitude_db, transfer_function_h1};
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
    /// Coherence (0.0 – 1.0)
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
    pub fft_size: usize,
    pub window_type: WindowType,
    pub sample_rate: Option<u32>,
    pub device_name: Option<String>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            fft_size: DEFAULT_FFT_SIZE,
            window_type: WindowType::Hann,
            sample_rate: None,
            device_name: None,
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
}

/// Wrapper to allow sending cpal::Stream across threads.
/// Safety: we only ever access the stream through a Mutex, ensuring
/// exclusive access at any point.
struct SendStream(Stream);
unsafe impl Send for SendStream {}

/// Handle to the running audio engine. Drop it to stop.
pub struct AudioEngine {
    _stream: SendStream,
    dsp_handle: Option<thread::JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

impl AudioEngine {
    /// Starts the audio capture + DSP pipeline.
    ///
    /// Returns the engine handle and a receiver for processed spectrum data.
    pub fn start(config: EngineConfig) -> Result<(Self, Receiver<SpectrumData>), String> {
        let host = cpal::default_host();
        let device = pick_device(&host, config.device_name.as_deref())?;
        let stream_config = pick_config(&device, config.sample_rate)?;
        let sample_rate = stream_config.sample_rate.0 as f32;
        let channels = stream_config.channels as usize;

        log::info!(
            "AudioEngine: device={:?} rate={} ch={} fft={}",
            device.name().unwrap_or_default(),
            sample_rate,
            channels,
            config.fft_size
        );

        // Ring buffer: hold up to 4x FFT frames of interleaved samples.
        // This gives plenty of headroom for the DSP thread to keep up.
        let ring_capacity = config.fft_size * channels * 4;
        let ring = HeapRb::<f32>::new(ring_capacity);
        let (mut producer, consumer) = ring.split();

        let running = Arc::new(AtomicBool::new(true));
        let running_stream = running.clone();

        // ── CPAL audio callback (runs on OS real-time audio thread) ──
        let stream = device
            .build_input_stream(
                &stream_config,
                move |data: &[f32], _info: &cpal::InputCallbackInfo| {
                    if !running_stream.load(Ordering::Relaxed) {
                        return;
                    }
                    // Push interleaved samples into ring buffer.
                    // If the ring is full we drop the oldest implicitly (producer will
                    // only write what fits — this is acceptable for real-time).
                    let written = producer.push_slice(data);
                    if written < data.len() {
                        log::trace!("AudioEngine: ring buffer overflow, dropped {} samples", data.len() - written);
                    }
                },
                |err| {
                    log::error!("AudioEngine: stream error: {err}");
                },
                None, // no timeout
            )
            .map_err(|e| format!("Failed to build input stream: {e}"))?;

        stream.play().map_err(|e| format!("Failed to start stream: {e}"))?;

        // ── DSP processing thread ──
        let (tx, rx): (Sender<SpectrumData>, Receiver<SpectrumData>) = bounded(2);
        let running_dsp = running.clone();
        let fft_size = config.fft_size;
        let window = generate_window(config.window_type, fft_size);
        let frequencies = bin_frequencies(fft_size, sample_rate);

        let dsp_handle = thread::Builder::new()
            .name("audiotec-dsp".into())
            .spawn(move || {
                dsp_loop(
                    consumer,
                    tx,
                    running_dsp,
                    fft_size,
                    channels,
                    sample_rate,
                    window,
                    frequencies,
                );
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

fn dsp_loop(
    mut consumer: impl Consumer<Item = f32>,
    tx: Sender<SpectrumData>,
    running: Arc<AtomicBool>,
    fft_size: usize,
    channels: usize,
    sample_rate: f32,
    window: Vec<f32>,
    frequencies: Vec<f32>,
) {
    // Accumulation buffer for interleaved samples
    let frame_samples = fft_size * channels;
    let mut accumulator: Vec<f32> = Vec::with_capacity(frame_samples);

    // Throttle: minimum interval between outputs (~60 fps = 16.6ms)
    let min_interval = std::time::Duration::from_micros(16_600);
    let mut last_emit = std::time::Instant::now();

    // De-interleave buffers
    let mut ch1 = vec![0.0f32; fft_size]; // Reference
    let mut ch2 = vec![0.0f32; fft_size]; // Measurement

    while running.load(Ordering::Relaxed) {
        // Pull available samples from ring buffer
        let mut tmp = [0.0f32; 1024];
        let n = consumer.pop_slice(&mut tmp);
        if n == 0 {
            // No data yet — yield briefly to avoid busy-spin
            thread::sleep(std::time::Duration::from_micros(500));
            continue;
        }
        accumulator.extend_from_slice(&tmp[..n]);

        // Process complete frames
        while accumulator.len() >= frame_samples {
            let frame = &accumulator[..frame_samples];

            // De-interleave stereo (or pick first 2 channels of multi-channel)
            for i in 0..fft_size {
                ch1[i] = frame[i * channels];
                ch2[i] = if channels >= 2 {
                    frame[i * channels + 1]
                } else {
                    frame[i * channels] // mono fallback
                };
            }

            // Remove consumed frame (we don't overlap yet — future: 50% overlap)
            accumulator.drain(..frame_samples);

            // Throttle check
            let now = std::time::Instant::now();
            if now.duration_since(last_emit) < min_interval {
                continue;
            }
            last_emit = now;

            // Apply window
            let mut windowed_ref = ch1.clone();
            let mut windowed_meas = ch2.clone();
            apply_window(&mut windowed_ref, &window);
            apply_window(&mut windowed_meas, &window);

            // Forward FFT
            let spectrum_ref = forward_fft(&windowed_ref, fft_size);
            let spectrum_meas = forward_fft(&windowed_meas, fft_size);

            // Individual channel magnitudes (dBFS)
            let magnitude_ref = spectrum_to_magnitude_db(&spectrum_ref, fft_size);
            let magnitude_meas = spectrum_to_magnitude_db(&spectrum_meas, fft_size);

            // Transfer function H1
            let (transfer_magnitude, transfer_phase, coherence) =
                transfer_function_h1(&spectrum_ref, &spectrum_meas, fft_size);

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

            // Non-blocking send — if the frontend is slow, drop the frame
            if tx.try_send(data).is_err() {
                log::trace!("AudioEngine: frontend channel full, dropping frame");
            }
        }
    }
}

// ─── Device selection helpers ───────────────────────────────────────────

fn pick_device(host: &cpal::Host, name: Option<&str>) -> Result<Device, String> {
    if let Some(name) = name {
        let devices = host.input_devices().map_err(|e| format!("Cannot enumerate devices: {e}"))?;
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

    // Prefer stereo (2ch), fallback to first available
    let target_channels = 2u16;

    for cfg in &configs {
        if cfg.channels() >= target_channels && cfg.sample_format() == SampleFormat::F32 {
            let rate = preferred_rate
                .map(|r| cpal::SampleRate(r))
                .unwrap_or(cpal::SampleRate(48000));
            let rate = rate.clamp(cfg.min_sample_rate(), cfg.max_sample_rate());
            return Ok(cfg.with_sample_rate(rate).into());
        }
    }

    // Fallback: use default config
    device
        .default_input_config()
        .map(|c| c.into())
        .map_err(|e| format!("No suitable input config: {e}"))
}

/// Lists all available input audio devices.
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Cannot enumerate devices: {e}"))?;

    let mut result = Vec::new();
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
            // Report common rates within the supported range
            for &rate in &[44100, 48000, 88200, 96000, 176400, 192000] {
                let sr = cpal::SampleRate(rate);
                if sr >= cfg.min_sample_rate() && sr <= cfg.max_sample_rate() && !sample_rates.contains(&rate) {
                    sample_rates.push(rate);
                }
            }
        }
        sample_rates.sort();

        result.push(AudioDeviceInfo {
            name,
            sample_rates,
            max_channels,
        });
    }

    Ok(result)
}
