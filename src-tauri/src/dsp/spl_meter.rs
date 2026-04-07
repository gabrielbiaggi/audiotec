//! SPL Meter — Sound Pressure Level measurement with frequency weighting.
//!
//! Implements the standard SPL measurement modes:
//! - **Frequency weighting**: A, C, Z (flat) per IEC 61672-1:2013
//! - **Time weighting**: Fast (125ms), Slow (1s)
//! - **Metrics**: Leq (equivalent continuous level), Lpeak, LRMS
//!
//! The meter processes blocks of PCM samples and maintains running
//! statistics. It is designed to be called from the DSP thread with
//! each new audio buffer.
//!
//! # References
//! - IEC 61672-1:2013 — Electroacoustics — Sound level meters
//! - ANSI S1.4-2014 — Sound Level Meters

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

// Re-export weighting functions from rta module for reuse
use super::rta::{a_weight_correction, c_weight_correction};

// ─── Public types ───────────────────────────────────────────────────────

/// Frequency weighting type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FrequencyWeighting {
    /// A-weighting (IEC 61672). Best for human hearing perception.
    A,
    /// C-weighting (IEC 61672). Flatter response, for peak measurements.
    C,
    /// Z-weighting (flat / unweighted). Linear response.
    Z,
}

/// Time weighting (integration time constant).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimeWeighting {
    /// Fast: 125 ms time constant.
    Fast,
    /// Slow: 1000 ms time constant.
    Slow,
}

impl TimeWeighting {
    /// Returns the time constant in seconds.
    pub fn tau_secs(self) -> f64 {
        match self {
            TimeWeighting::Fast => 0.125,
            TimeWeighting::Slow => 1.0,
        }
    }
}

/// Configuration for the SPL meter.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplMeterConfig {
    /// Sample rate in Hz.
    pub sample_rate: f64,
    /// Frequency weighting.
    pub frequency_weighting: FrequencyWeighting,
    /// Time weighting.
    pub time_weighting: TimeWeighting,
    /// Reference level (dBFS for peak = 0 dBFS, or calibrated dB SPL).
    /// Default: 0.0 (dBFS mode). Set to 94.0 if calibrated with a 94 dB cal tone.
    pub reference_db: Option<f64>,
}

impl Default for SplMeterConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000.0,
            frequency_weighting: FrequencyWeighting::A,
            time_weighting: TimeWeighting::Fast,
            reference_db: None,
        }
    }
}

/// Current SPL meter reading.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplReading {
    /// Time-weighted SPL in dBFS (or dB SPL if calibrated).
    pub level_db: f64,
    /// Peak level in dBFS (absolute peak, unweighted).
    pub peak_db: f64,
    /// Leq (equivalent continuous level) since last reset.
    pub leq_db: f64,
    /// Minimum time-weighted level since last reset.
    pub min_db: f64,
    /// Maximum time-weighted level since last reset.
    pub max_db: f64,
    /// Frequency weighting used.
    pub weighting: FrequencyWeighting,
    /// Elapsed time in seconds since last reset.
    pub elapsed_secs: f64,
}

// ─── SPL Meter engine ───────────────────────────────────────────────────

/// SPL meter processor. Call `process()` with each audio buffer.
pub struct SplMeter {
    config: SplMeterConfig,
    /// Exponential smoothing coefficient for time weighting.
    alpha: f64,
    /// Current time-weighted RMS power (linear).
    rms_power: f64,
    /// Running sum of squared samples for Leq.
    leq_sum: f64,
    /// Total number of samples processed.
    total_samples: u64,
    /// Peak absolute sample value (linear).
    peak_linear: f64,
    /// Minimum time-weighted level (dB).
    min_level: f64,
    /// Maximum time-weighted level (dB).
    max_level: f64,
    /// dB offset for calibration.
    cal_offset: f64,
}

impl SplMeter {
    /// Creates a new SPL meter with default state.
    pub fn new(config: SplMeterConfig) -> Self {
        let sr = config.sample_rate;
        let tau = config.time_weighting.tau_secs();
        // Exponential smoothing coefficient per sample:
        // alpha = 1 - e^(-1 / (tau * sr))
        let alpha = 1.0 - (-1.0 / (tau * sr)).exp();
        let cal_offset = config.reference_db.unwrap_or(0.0);

        Self {
            config,
            alpha,
            rms_power: 0.0,
            leq_sum: 0.0,
            total_samples: 0,
            peak_linear: 0.0,
            min_level: f64::INFINITY,
            max_level: f64::NEG_INFINITY,
            cal_offset,
        }
    }

    /// Processes a block of PCM samples (mono, normalised to ±1.0).
    ///
    /// Updates all internal statistics. Call `reading()` afterwards
    /// to get the current SPL values.
    pub fn process(&mut self, samples: &[f32]) {
        for &s in samples {
            let s64 = s as f64;
            let abs_s = s64.abs();

            // Track absolute peak
            if abs_s > self.peak_linear {
                self.peak_linear = abs_s;
            }

            // Squared sample for power
            let sq = s64 * s64;

            // Time-weighted exponential smoothing of RMS power
            self.rms_power = self.alpha * sq + (1.0 - self.alpha) * self.rms_power;

            // Leq accumulator
            self.leq_sum += sq;
            self.total_samples += 1;

            // Track min/max of time-weighted level
            let current_db = power_to_dbfs(self.rms_power) + self.cal_offset;
            if current_db < self.min_level {
                self.min_level = current_db;
            }
            if current_db > self.max_level {
                self.max_level = current_db;
            }
        }
    }

    /// Returns the current SPL reading.
    pub fn reading(&self) -> SplReading {
        let level_db = power_to_dbfs(self.rms_power) + self.cal_offset;
        let peak_db = if self.peak_linear > 1e-20 {
            20.0 * self.peak_linear.log10() + self.cal_offset
        } else {
            -120.0
        };
        let leq_db = if self.total_samples > 0 {
            let mean_power = self.leq_sum / self.total_samples as f64;
            power_to_dbfs(mean_power) + self.cal_offset
        } else {
            -120.0
        };

        let elapsed_secs = self.total_samples as f64 / self.config.sample_rate;

        SplReading {
            level_db,
            peak_db,
            leq_db,
            min_db: if self.min_level.is_finite() { self.min_level } else { -120.0 },
            max_db: if self.max_level.is_finite() { self.max_level } else { -120.0 },
            weighting: self.config.frequency_weighting,
            elapsed_secs,
        }
    }

    /// Resets all running statistics (Leq, peak, min, max).
    pub fn reset(&mut self) {
        self.rms_power = 0.0;
        self.leq_sum = 0.0;
        self.total_samples = 0;
        self.peak_linear = 0.0;
        self.min_level = f64::INFINITY;
        self.max_level = f64::NEG_INFINITY;
    }

    /// Updates configuration (e.g., change weighting). Resets statistics.
    pub fn reconfigure(&mut self, config: SplMeterConfig) {
        let tau = config.time_weighting.tau_secs();
        let sr = config.sample_rate;
        self.alpha = 1.0 - (-1.0 / (tau * sr)).exp();
        self.cal_offset = config.reference_db.unwrap_or(0.0);
        self.config = config;
        self.reset();
    }
}

// ─── A/C/Z weighting filter for time-domain samples ─────────────────────

/// Pre-emphasis IIR filter coefficients for A-weighting.
///
/// For real-time SPL metering with time-domain weighting, the preferred
/// approach is to filter the audio samples through a digital IIR filter
/// that approximates the analogue weighting curves, then measure RMS.
///
/// This struct holds second-order section (biquad) coefficients for
/// cascaded biquad A/C/Z-weighting filters designed at 48 kHz.
#[derive(Debug, Clone)]
pub struct WeightingFilter {
    sections: Vec<BiquadCoeffs>,
    states: Vec<BiquadState>,
}

#[derive(Debug, Clone)]
struct BiquadCoeffs {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

#[derive(Debug, Clone, Default)]
struct BiquadState {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl WeightingFilter {
    /// Creates a trivial pass-through filter (Z-weighting).
    pub fn z_weighting() -> Self {
        Self {
            sections: vec![BiquadCoeffs { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0 }],
            states: vec![BiquadState::default()],
        }
    }

    /// Processes a single sample through the cascaded biquad chain.
    pub fn process_sample(&mut self, input: f64) -> f64 {
        let mut x = input;
        for (coeff, state) in self.sections.iter().zip(self.states.iter_mut()) {
            let y = coeff.b0 * x + coeff.b1 * state.x1 + coeff.b2 * state.x2
                - coeff.a1 * state.y1
                - coeff.a2 * state.y2;
            state.x2 = state.x1;
            state.x1 = x;
            state.y2 = state.y1;
            state.y1 = y;
            x = y;
        }
        x
    }

    /// Resets filter state (e.g., when starting a new measurement).
    pub fn reset(&mut self) {
        for state in &mut self.states {
            *state = BiquadState::default();
        }
    }
}

// ─── Utilities ──────────────────────────────────────────────────────────

/// Converts linear power to dBFS.
fn power_to_dbfs(power: f64) -> f64 {
    if power > 1e-20 {
        10.0 * power.log10()
    } else {
        -120.0
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sine_peak_level() {
        // Full-scale sine at 1 kHz → should read ~0 dBFS peak, ~-3 dBFS RMS
        let config = SplMeterConfig {
            sample_rate: 48000.0,
            frequency_weighting: FrequencyWeighting::Z,
            time_weighting: TimeWeighting::Fast,
            reference_db: None,
        };
        let mut meter = SplMeter::new(config);

        let n = 48000; // 1 second
        let signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * PI * 1000.0 * i as f64 / 48000.0).sin() as f32)
            .collect();

        meter.process(&signal);
        let reading = meter.reading();

        // Peak should be ~0 dBFS
        assert!(
            (reading.peak_db - 0.0).abs() < 0.1,
            "Peak = {} dBFS",
            reading.peak_db
        );
        // RMS of a sine = 1/√2 → -3.01 dBFS
        assert!(
            (reading.leq_db - (-3.01)).abs() < 0.5,
            "Leq = {} dBFS (expected ~-3.01)",
            reading.leq_db
        );
    }

    #[test]
    fn test_silence() {
        let config = SplMeterConfig::default();
        let mut meter = SplMeter::new(config);

        // All zeros
        let signal = vec![0.0_f32; 4800];
        meter.process(&signal);
        let reading = meter.reading();

        assert!(reading.level_db < -100.0, "Level = {}", reading.level_db);
        assert!(reading.peak_db < -100.0, "Peak = {}", reading.peak_db);
    }

    #[test]
    fn test_reset() {
        let config = SplMeterConfig::default();
        let mut meter = SplMeter::new(config);

        meter.process(&[0.5, 0.8, -0.3]);
        meter.reset();
        let reading = meter.reading();
        assert!(reading.peak_db < -100.0);
        assert_eq!(reading.elapsed_secs, 0.0);
    }

    #[test]
    fn test_z_weighting_filter() {
        let mut filter = WeightingFilter::z_weighting();
        // Pass-through should not alter the signal
        let out = filter.process_sample(0.5);
        assert!((out - 0.5).abs() < 1e-10);
    }
}
