//! Simulation Engine — synthetic signal generator for offline testing.
//!
//! Mirrors the real AudioEngine pipeline: generates test signals in a
//! dedicated thread, processes through the same DSP (FFT + H1 averager),
//! and feeds SpectrumData to the frontend via crossbeam channel.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use crossbeam_channel::{bounded, Receiver, Sender};
use serde::{Deserialize, Serialize};

use crate::audio_engine::SpectrumData;
use crate::dsp::fft::{bin_frequencies, spectrum_to_magnitude_db, FftProcessor, SpectralAverager};
use crate::dsp::windowing::{apply_window, generate_window, WindowType};
use crate::dsp::DEFAULT_FFT_SIZE;

// ─── Configuration ──────────────────────────────────────────────────────

/// Type of synthetic signal to generate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SimSignalType {
    PinkNoise,
    WhiteNoise,
    SineSweep,
    MultiTone,
}

impl Default for SimSignalType {
    fn default() -> Self {
        Self::PinkNoise
    }
}

/// Configuration for the simulation engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimConfig {
    pub signal_type: SimSignalType,
    pub fft_size: Option<usize>,
    pub sample_rate: Option<u32>,
    pub num_averages: Option<usize>,
    /// Amplitude of the generated signal (0.0 – 1.0).
    pub amplitude: Option<f64>,
    /// Delay in samples applied to the "measurement" channel.
    pub delay_samples: Option<usize>,
    /// Noise level added to the measurement channel (0.0 – 1.0).
    pub noise_level: Option<f64>,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            signal_type: SimSignalType::PinkNoise,
            fft_size: None,
            sample_rate: None,
            num_averages: None,
            amplitude: Some(0.5),
            delay_samples: Some(12),
            noise_level: Some(0.05),
        }
    }
}

// ─── SimulationEngine ───────────────────────────────────────────────────

/// Handle to the simulation engine. Dropping it stops the generator.
pub struct SimulationEngine {
    running: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl SimulationEngine {
    /// Starts the simulation with the given configuration.
    ///
    /// Returns the engine handle and a receiver for processed spectrum data.
    pub fn start(config: SimConfig) -> Result<(Self, Receiver<SpectrumData>), String> {
        let fft_size = config.fft_size.unwrap_or(DEFAULT_FFT_SIZE);
        let sample_rate = config.sample_rate.unwrap_or(48000) as f32;
        let num_averages = config.num_averages.unwrap_or(8);
        let amplitude = config.amplitude.unwrap_or(0.5) as f32;
        let delay_samples = config.delay_samples.unwrap_or(12);
        let noise_level = config.noise_level.unwrap_or(0.05) as f32;
        let signal_type = config.signal_type;

        let (tx, rx): (Sender<SpectrumData>, Receiver<SpectrumData>) = bounded(2);
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        let handle = thread::Builder::new()
            .name("audiotec-sim".into())
            .spawn(move || {
                sim_loop(SimLoopParams {
                    tx,
                    running: running_clone,
                    fft_size,
                    sample_rate,
                    num_averages,
                    amplitude,
                    delay_samples,
                    noise_level,
                    signal_type,
                });
            })
            .map_err(|e| format!("Failed to spawn simulation thread: {e}"))?;

        log::info!(
            "SimulationEngine: signal={:?} rate={} fft={} avg={} delay={}",
            signal_type,
            sample_rate,
            fft_size,
            num_averages,
            delay_samples,
        );

        Ok((
            Self {
                running,
                handle: Some(handle),
            },
            rx,
        ))
    }

    /// Stops the simulation gracefully.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        log::info!("SimulationEngine: stopped");
    }
}

impl Drop for SimulationEngine {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── Signal generator loop ──────────────────────────────────────────────

struct SimLoopParams {
    tx: Sender<SpectrumData>,
    running: Arc<AtomicBool>,
    fft_size: usize,
    sample_rate: f32,
    num_averages: usize,
    amplitude: f32,
    delay_samples: usize,
    noise_level: f32,
    signal_type: SimSignalType,
}

fn sim_loop(params: SimLoopParams) {
    let SimLoopParams {
        tx,
        running,
        fft_size,
        sample_rate,
        num_averages,
        amplitude,
        delay_samples,
        noise_level,
        signal_type,
    } = params;

    let num_bins = fft_size / 2;
    let window = generate_window(WindowType::Hann, fft_size);
    let frequencies = bin_frequencies(fft_size, sample_rate);

    let mut fft_proc = FftProcessor::new(fft_size);
    let mut averager = SpectralAverager::new(num_bins, num_averages);

    // Pink noise state: 3-pole filter (Voss-McCartney algorithm simplified)
    let mut pink_state = [0.0f32; 3];
    let mut rng_state: u32 = 0xDEAD_BEEF;

    let mut phase: f64 = 0.0; // for sweep/sine
    let mut frame_count: u64 = 0;

    // Pre-allocate buffers
    let mut ref_buf = vec![0.0f32; fft_size];
    let mut meas_buf = vec![0.0f32; fft_size];
    let mut windowed_ref = vec![0.0f32; fft_size];
    let mut windowed_meas = vec![0.0f32; fft_size];

    // Circular delay buffer for measurement channel
    let delay_buf_size = delay_samples.max(1) + fft_size;
    let mut delay_buf = vec![0.0f32; delay_buf_size];
    let mut delay_write_pos = 0usize;

    // Throttle to ~60 fps
    let frame_interval = std::time::Duration::from_micros(16_600);

    while running.load(Ordering::Relaxed) {
        let t0 = std::time::Instant::now();

        // Generate reference signal
        for i in 0..fft_size {
            let sample = match signal_type {
                SimSignalType::PinkNoise => {
                    let white = xorshift_f32(&mut rng_state);
                    // 3-pole pink filter
                    pink_state[0] = 0.99886 * pink_state[0] + white * 0.0555179;
                    pink_state[1] = 0.99332 * pink_state[1] + white * 0.0750759;
                    pink_state[2] = 0.96900 * pink_state[2] + white * 0.1538520;
                    let pink = pink_state[0] + pink_state[1] + pink_state[2] + white * 0.5362;
                    pink * 0.11 * amplitude
                }
                SimSignalType::WhiteNoise => {
                    xorshift_f32(&mut rng_state) * amplitude
                }
                SimSignalType::SineSweep => {
                    // Log sweep from 20Hz to 20kHz over ~5 seconds
                    let t = (frame_count as f64 * fft_size as f64 + i as f64) / sample_rate as f64;
                    let sweep_duration = 5.0;
                    let t_mod = t % sweep_duration;
                    let ratio = t_mod / sweep_duration;
                    let freq = 20.0 * (1000.0f64).powf(ratio);
                    phase += 2.0 * std::f64::consts::PI * freq / sample_rate as f64;
                    if phase > 2.0 * std::f64::consts::PI {
                        phase -= 2.0 * std::f64::consts::PI;
                    }
                    (phase.sin() as f32) * amplitude
                }
                SimSignalType::MultiTone => {
                    // Sum of 31 ISO frequencies (1/3 octave from 20Hz to 20kHz)
                    let t = (frame_count as f64 * fft_size as f64 + i as f64) / sample_rate as f64;
                    let iso_freqs = [
                        20.0, 25.0, 31.5, 40.0, 50.0, 63.0, 80.0, 100.0, 125.0,
                        160.0, 200.0, 250.0, 315.0, 400.0, 500.0, 630.0, 800.0,
                        1000.0, 1250.0, 1600.0, 2000.0, 2500.0, 3150.0, 4000.0,
                        5000.0, 6300.0, 8000.0, 10000.0, 12500.0, 16000.0, 20000.0,
                    ];
                    let mut sum = 0.0f64;
                    for &f in &iso_freqs {
                        sum += (2.0 * std::f64::consts::PI * f * t).sin();
                    }
                    (sum / iso_freqs.len() as f64) as f32 * amplitude
                }
            };

            ref_buf[i] = sample;

            // Measurement channel = delayed reference + noise
            delay_buf[delay_write_pos % delay_buf_size] = sample;
            let read_pos = (delay_write_pos + delay_buf_size - delay_samples) % delay_buf_size;
            let noise = xorshift_f32(&mut rng_state) * noise_level;
            meas_buf[i] = delay_buf[read_pos] + noise;
            delay_write_pos = (delay_write_pos + 1) % delay_buf_size;
        }

        frame_count += 1;

        // Apply windowing
        windowed_ref.copy_from_slice(&ref_buf);
        windowed_meas.copy_from_slice(&meas_buf);
        apply_window(&mut windowed_ref, &window);
        apply_window(&mut windowed_meas, &window);

        // FFT
        let spectrum_ref = fft_proc.forward(&windowed_ref);
        let spectrum_meas = fft_proc.forward(&windowed_meas);

        // Magnitudes
        let magnitude_ref = spectrum_to_magnitude_db(&spectrum_ref, fft_size);
        let magnitude_meas = spectrum_to_magnitude_db(&spectrum_meas, fft_size);

        // H1 transfer function
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

        // Non-blocking send
        let _ = tx.try_send(data);

        // Throttle
        let elapsed = t0.elapsed();
        if elapsed < frame_interval {
            thread::sleep(frame_interval - elapsed);
        }
    }
}

// ─── Pseudo-random number generator (xorshift32) ────────────────────────

/// Fast xorshift32 PRNG returning a value in [-1.0, 1.0].
/// Suitable for audio noise generation — not cryptographic.
#[inline]
fn xorshift_f32(state: &mut u32) -> f32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    // Map u32 to [-1.0, 1.0]
    (x as i32) as f32 / i32::MAX as f32
}
