//! Signal Generator — Output signal synthesis for measurement excitation.
//!
//! Generates test signals for acoustic measurement playback:
//! - **Pink noise**: 1/f power spectral density, flat per octave
//! - **White noise**: flat power spectral density
//! - **Sine sweep** (linear and logarithmic)
//! - **MLS**: Maximum Length Sequence (pseudo-random binary)
//! - **Multi-tone**: superposition of sine waves at specified frequencies
//!
//! Each generator implements a common trait for uniform usage in the
//! audio engine's output path.

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

// ─── Public types ───────────────────────────────────────────────────────

/// Available signal types for generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SignalType {
    /// Pink noise (1/f spectrum).
    PinkNoise { amplitude: f64 },
    /// White noise (flat spectrum).
    WhiteNoise { amplitude: f64 },
    /// Sine wave at a single frequency.
    Sine { frequency: f64, amplitude: f64 },
    /// Linear sine sweep from start to end frequency.
    LinearSweep {
        start_freq: f64,
        end_freq: f64,
        duration_secs: f64,
        amplitude: f64,
    },
    /// Logarithmic sine sweep (exponential, Farina-style).
    LogSweep {
        start_freq: f64,
        end_freq: f64,
        duration_secs: f64,
        amplitude: f64,
    },
    /// Maximum Length Sequence (MLS) for impulse response measurement.
    Mls {
        order: u32, // Sequence length = 2^order - 1
        amplitude: f64,
    },
    /// Multi-tone: sum of individual sinusoids.
    MultiTone {
        frequencies: Vec<f64>,
        amplitude: f64,
    },
    /// Silence (zero samples).
    Silence,
}

/// Configuration for the signal generator.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratorConfig {
    /// Signal type to generate.
    pub signal: SignalType,
    /// Sample rate in Hz.
    pub sample_rate: f64,
    /// Whether the signal repeats (loops). Default: true for noise, false for sweeps.
    pub looping: Option<bool>,
}

// ─── Signal Generator ───────────────────────────────────────────────────

/// Stateful signal generator. Call `generate()` to fill a buffer.
pub struct SignalGenerator {
    config: GeneratorConfig,
    /// Current phase accumulator (for sine-based signals).
    phase: f64,
    /// Sample counter (for sweeps with finite duration).
    sample_index: u64,
    /// Total samples for finite signals (0 = infinite).
    total_samples: u64,
    /// Pink noise state (Voss-McCartney algorithm).
    pink_state: PinkNoiseState,
    /// MLS shift register state.
    mls_state: MlsState,
    /// RNG state for white noise (xorshift64).
    rng_state: u64,
    /// Whether the signal has finished (for non-looping finite signals).
    finished: bool,
}

impl SignalGenerator {
    /// Creates a new signal generator.
    pub fn new(config: GeneratorConfig) -> Self {
        let sr = config.sample_rate;
        let total_samples = match &config.signal {
            SignalType::LinearSweep { duration_secs, .. }
            | SignalType::LogSweep { duration_secs, .. } => {
                (*duration_secs * sr) as u64
            }
            SignalType::Mls { order, .. } => (1u64 << *order) - 1,
            _ => 0, // infinite
        };

        let mls_state = match &config.signal {
            SignalType::Mls { order, .. } => MlsState::new(*order),
            _ => MlsState::new(16), // default, unused
        };

        Self {
            config,
            phase: 0.0,
            sample_index: 0,
            total_samples,
            pink_state: PinkNoiseState::new(),
            mls_state,
            rng_state: 0x5DEECE66D_u64, // seed
            finished: false,
        }
    }

    /// Fills the output buffer with generated samples.
    ///
    /// Returns the number of samples actually written (may be < buf.len()
    /// if the signal has finished and is not looping).
    pub fn generate(&mut self, buf: &mut [f32]) -> usize {
        if self.finished {
            buf.iter_mut().for_each(|s| *s = 0.0);
            return 0;
        }

        let sr = self.config.sample_rate;
        let looping = self.config.looping.unwrap_or(self.total_samples == 0);
        let mut written = 0;

        for sample_out in buf.iter_mut() {
            // Check if finite signal is done
            if self.total_samples > 0 && self.sample_index >= self.total_samples {
                if looping {
                    self.sample_index = 0;
                    self.phase = 0.0;
                } else {
                    self.finished = true;
                    *sample_out = 0.0;
                    continue;
                }
            }

            let t = self.sample_index as f64 / sr;

            let sample = match &self.config.signal {
                SignalType::PinkNoise { amplitude } => {
                    *amplitude * self.pink_state.next_sample(&mut self.rng_state)
                }
                SignalType::WhiteNoise { amplitude } => {
                    *amplitude * white_noise(&mut self.rng_state)
                }
                SignalType::Sine { frequency, amplitude } => {
                    let val = (2.0 * PI * frequency * t).sin();
                    *amplitude * val
                }
                SignalType::LinearSweep {
                    start_freq,
                    end_freq,
                    duration_secs,
                    amplitude,
                } => {
                    // Instantaneous frequency: f(t) = f1 + (f2-f1) * t / T
                    // Phase: φ(t) = 2π ∫ f(τ)dτ = 2π(f1·t + (f2-f1)·t²/(2T))
                    let phase = 2.0 * PI * (start_freq * t + (end_freq - start_freq) * t * t / (2.0 * duration_secs));
                    *amplitude * phase.sin()
                }
                SignalType::LogSweep {
                    start_freq,
                    end_freq,
                    duration_secs,
                    amplitude,
                } => {
                    let ln_ratio = (end_freq / start_freq).ln();
                    let k = duration_secs / ln_ratio;
                    let phase = 2.0 * PI * start_freq * k * ((t * ln_ratio / duration_secs).exp() - 1.0);
                    *amplitude * phase.sin()
                }
                SignalType::Mls { amplitude, .. } => {
                    let bit = self.mls_state.next_bit();
                    *amplitude * if bit { 1.0 } else { -1.0 }
                }
                SignalType::MultiTone { frequencies, amplitude } => {
                    if frequencies.is_empty() {
                        0.0
                    } else {
                        let n = frequencies.len() as f64;
                        let sum: f64 = frequencies
                            .iter()
                            .map(|&f| (2.0 * PI * f * t).sin())
                            .sum();
                        *amplitude * sum / n
                    }
                }
                SignalType::Silence => 0.0,
            };

            *sample_out = sample as f32;
            self.sample_index += 1;
            written += 1;
        }

        written
    }

    /// Returns true if the signal has finished (non-looping finite signals).
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    /// Resets the generator to the beginning of the signal.
    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.sample_index = 0;
        self.finished = false;
        self.pink_state = PinkNoiseState::new();
        if let SignalType::Mls { order, .. } = &self.config.signal {
            self.mls_state = MlsState::new(*order);
        }
    }

    /// Returns the current playback position in seconds.
    pub fn position_secs(&self) -> f64 {
        self.sample_index as f64 / self.config.sample_rate
    }
}

// ─── Pink Noise (Voss-McCartney) ────────────────────────────────────────

/// Pink noise generator using the Voss-McCartney algorithm.
///
/// Uses multiple octave-band white noise generators whose update rates
/// are halved at each octave, producing a 1/f power spectrum.
const PINK_NUM_ROWS: usize = 12;

#[derive(Debug, Clone)]
struct PinkNoiseState {
    rows: [f64; PINK_NUM_ROWS],
    running_sum: f64,
    count: u32,
}

impl PinkNoiseState {
    fn new() -> Self {
        Self {
            rows: [0.0; PINK_NUM_ROWS],
            running_sum: 0.0,
            count: 0,
        }
    }

    fn next_sample(&mut self, rng: &mut u64) -> f64 {
        self.count = self.count.wrapping_add(1);

        // Find the lowest set bit — that determines which row to update
        let zeroes = self.count.trailing_zeros() as usize;
        if zeroes < PINK_NUM_ROWS {
            // Remove old contribution, add new
            self.running_sum -= self.rows[zeroes];
            let new_val = white_noise(rng);
            self.rows[zeroes] = new_val;
            self.running_sum += new_val;
        }

        // Add one more white noise sample for the fastest octave
        let extra = white_noise(rng);

        // The sum of PINK_NUM_ROWS + 1 values, each in [-1, 1],
        // so normalize by (PINK_NUM_ROWS + 1) to stay in [-1, 1]
        (self.running_sum + extra) / (PINK_NUM_ROWS + 1) as f64
    }
}

// ─── MLS (Maximum Length Sequence) ──────────────────────────────────────

/// Linear Feedback Shift Register for MLS generation.
///
/// Generates a sequence of length 2^order - 1 with white-noise-like
/// spectrum and perfect circular autocorrelation (delta function).
#[derive(Debug, Clone)]
struct MlsState {
    register: u32,
    taps: u32,
    order: u32,
}

impl MlsState {
    fn new(order: u32) -> Self {
        let order = order.clamp(2, 24);
        // Primitive polynomial tap masks for common orders
        let taps = match order {
            2 => 0b11,
            3 => 0b110,
            4 => 0b1100,
            5 => 0b10100,
            6 => 0b110000,
            7 => 0b1100000,
            8 => 0b10111000,
            9 => 0b100010000,
            10 => 0b1001000000,
            11 => 0b10100000000,
            12 => 0b111000001000,
            13 => 0b1110010000000,
            14 => 0b11100000000010,
            15 => 0b110000000000000,
            16 => 0b1101000000001000,
            _ => {
                // For other orders, use taps [order, order-1] as a simple fallback
                (1 << (order - 1)) | (1 << (order - 2))
            }
        };

        Self {
            register: 1, // non-zero seed
            taps,
            order,
        }
    }

    fn next_bit(&mut self) -> bool {
        let feedback = (self.register & self.taps).count_ones() & 1;
        self.register = (self.register << 1) | feedback;
        self.register &= (1 << self.order) - 1;
        feedback == 1
    }
}

// ─── White noise (xorshift64) ───────────────────────────────────────────

/// Generates a single white noise sample in [-1, 1] using xorshift64.
fn white_noise(state: &mut u64) -> f64 {
    // xorshift64
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;

    // Map to [-1, 1]
    (x as i64 as f64) / (i64::MAX as f64)
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silence() {
        let config = GeneratorConfig {
            signal: SignalType::Silence,
            sample_rate: 48000.0,
            looping: None,
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 1024];
        gen.generate(&mut buf);
        assert!(buf.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn test_sine_bounded() {
        let config = GeneratorConfig {
            signal: SignalType::Sine {
                frequency: 1000.0,
                amplitude: 0.8,
            },
            sample_rate: 48000.0,
            looping: None,
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 4800];
        gen.generate(&mut buf);

        assert!(buf.iter().all(|&s| s.abs() <= 0.81));
        // Should not be all zeros
        assert!(buf.iter().any(|&s| s.abs() > 0.1));
    }

    #[test]
    fn test_white_noise_distribution() {
        let config = GeneratorConfig {
            signal: SignalType::WhiteNoise { amplitude: 1.0 },
            sample_rate: 48000.0,
            looping: None,
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 48000];
        gen.generate(&mut buf);

        // Mean should be near zero
        let mean: f64 = buf.iter().map(|&s| s as f64).sum::<f64>() / buf.len() as f64;
        assert!(mean.abs() < 0.1, "Mean = {mean}");

        // RMS should be reasonably high (not silence)
        let rms: f64 = (buf.iter().map(|&s| (s as f64) * (s as f64)).sum::<f64>() / buf.len() as f64).sqrt();
        assert!(rms > 0.1, "RMS = {rms}");
    }

    #[test]
    fn test_pink_noise_bounded() {
        let config = GeneratorConfig {
            signal: SignalType::PinkNoise { amplitude: 1.0 },
            sample_rate: 48000.0,
            looping: None,
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 48000];
        gen.generate(&mut buf);

        // Should be bounded
        assert!(buf.iter().all(|&s| s.abs() <= 1.5), "Pink noise out of bounds");
        // Should not be all zeros
        assert!(buf.iter().any(|&s| s.abs() > 0.01));
    }

    #[test]
    fn test_mls_length() {
        let order = 8;
        let config = GeneratorConfig {
            signal: SignalType::Mls { order, amplitude: 1.0 },
            sample_rate: 48000.0,
            looping: Some(false),
        };
        let mut gen = SignalGenerator::new(config);
        let seq_len = (1u64 << order) - 1;
        let mut buf = vec![0.0_f32; seq_len as usize + 100];
        let written = gen.generate(&mut buf);

        // Should write exactly seq_len samples before finishing
        assert_eq!(written, seq_len as usize + 100); // some zeros at end
        assert!(gen.is_finished());
    }

    #[test]
    fn test_multi_tone() {
        let config = GeneratorConfig {
            signal: SignalType::MultiTone {
                frequencies: vec![100.0, 1000.0, 10000.0],
                amplitude: 0.9,
            },
            sample_rate: 48000.0,
            looping: None,
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 4800];
        gen.generate(&mut buf);

        // Bounded by amplitude
        assert!(buf.iter().all(|&s| s.abs() <= 1.0));
        assert!(buf.iter().any(|&s| s.abs() > 0.1));
    }

    #[test]
    fn test_log_sweep() {
        let config = GeneratorConfig {
            signal: SignalType::LogSweep {
                start_freq: 20.0,
                end_freq: 20000.0,
                duration_secs: 0.5,
                amplitude: 1.0,
            },
            sample_rate: 48000.0,
            looping: Some(false),
        };
        let mut gen = SignalGenerator::new(config);
        let mut buf = vec![0.0_f32; 24000]; // 0.5s at 48kHz
        let written = gen.generate(&mut buf);
        assert_eq!(written, 24000);
        assert!(buf.iter().all(|&s| s.abs() <= 1.01));
    }
}
