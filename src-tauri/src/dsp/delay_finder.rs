//! Delay Finder — Cross-Correlation based time alignment.
//!
//! Computes the time delay between a reference signal and a measurement
//! signal using the Generalized Cross-Correlation (GCC-PHAT) algorithm:
//!
//!   R_xy(τ) = IFFT{ X*(f)·Y(f) / |X*(f)·Y(f)| }
//!
//! The peak index of R_xy gives the delay in samples between the two
//! channels. Subsample resolution is achieved via parabolic interpolation
//! around the peak.
//!
//! # Usage
//! ```ignore
//! let mut finder = DelayFinder::new(4096);
//! let result = finder.find_delay(&reference, &measurement, 48000.0);
//! println!("Delay: {:.3} ms ({:.1} samples)", result.delay_ms, result.delay_samples);
//! ```

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::windowing::{apply_window, generate_window, WindowType};

// ─── Public types ───────────────────────────────────────────────────────

/// Result of a delay-finding operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayResult {
    /// Delay in fractional samples (subsample interpolated).
    pub delay_samples: f64,
    /// Delay in milliseconds.
    pub delay_ms: f64,
    /// Delay in metres (at given speed of sound).
    pub delay_metres: f64,
    /// Peak cross-correlation value (0..1). Low = poor SNR.
    pub confidence: f64,
    /// Polarity: +1.0 (in-phase) or -1.0 (inverted).
    pub polarity: f64,
    /// Speed of sound used for distance calculation (m/s).
    pub speed_of_sound: f64,
}

/// Configuration for the delay finder.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelayFinderConfig {
    /// FFT size for cross-correlation (should be ≥ 2× max expected delay).
    pub fft_size: usize,
    /// Maximum delay to search in samples. Limits the correlation window.
    pub max_delay_samples: Option<usize>,
    /// Temperature in °C for speed-of-sound calculation. Default: 20.0.
    pub temperature_c: Option<f64>,
    /// Use GCC-PHAT weighting (recommended for reverberant environments).
    pub use_phat: bool,
}

impl Default for DelayFinderConfig {
    fn default() -> Self {
        Self {
            fft_size: 8192,
            max_delay_samples: None,
            temperature_c: Some(20.0),
            use_phat: true,
        }
    }
}

// ─── DelayFinder engine ─────────────────────────────────────────────────

/// Reusable delay finder with cached FFT plans and scratch buffers.
pub struct DelayFinder {
    fft_size: usize,
    fft_forward: Arc<dyn rustfft::Fft<f32>>,
    fft_inverse: Arc<dyn rustfft::Fft<f32>>,
    scratch: Vec<Complex<f32>>,
    buf_ref: Vec<Complex<f32>>,
    buf_meas: Vec<Complex<f32>>,
    window: Vec<f32>,
    use_phat: bool,
    max_delay: usize,
    temperature_c: f64,
}

impl DelayFinder {
    /// Creates a new delay finder with a given FFT size.
    pub fn new(config: &DelayFinderConfig) -> Self {
        let fft_size = config.fft_size.next_power_of_two();
        let mut planner = FftPlanner::<f32>::new();
        let fft_forward = planner.plan_fft_forward(fft_size);
        let fft_inverse = planner.plan_fft_inverse(fft_size);
        let scratch_len = fft_forward
            .get_inplace_scratch_len()
            .max(fft_inverse.get_inplace_scratch_len());

        let window = generate_window(WindowType::Hann, fft_size);
        let max_delay = config.max_delay_samples.unwrap_or(fft_size / 2);

        Self {
            fft_size,
            fft_forward,
            fft_inverse,
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            buf_ref: vec![Complex::new(0.0, 0.0); fft_size],
            buf_meas: vec![Complex::new(0.0, 0.0); fft_size],
            window,
            use_phat: config.use_phat,
            max_delay: max_delay.min(fft_size / 2),
            temperature_c: config.temperature_c.unwrap_or(20.0),
        }
    }

    /// Computes delay between reference and measurement signals.
    ///
    /// Both slices should have the same length (ideally `fft_size`).
    /// Shorter inputs are zero-padded; longer inputs are truncated.
    pub fn find_delay(
        &mut self,
        reference: &[f32],
        measurement: &[f32],
        sample_rate: f32,
    ) -> DelayResult {
        let n = self.fft_size;

        // Copy and window reference
        self.fill_and_window(&mut self.buf_ref.clone(), reference);
        // Copy and window measurement
        self.fill_and_window(&mut self.buf_meas.clone(), measurement);

        // We need mutable borrows — use temporary buffers via clone
        let mut buf_x = self.buf_ref.clone();
        let mut buf_y = self.buf_meas.clone();

        // Apply window
        for i in 0..n {
            let w = self.window[i];
            buf_x[i] = Complex::new(buf_x[i].re * w, 0.0);
            buf_y[i] = Complex::new(buf_y[i].re * w, 0.0);
        }

        // Forward FFT
        self.fft_forward
            .process_with_scratch(&mut buf_x, &mut self.scratch);
        self.fft_forward
            .process_with_scratch(&mut buf_y, &mut self.scratch);

        // Cross-spectrum: G_xy = conj(X) * Y
        let mut cross = vec![Complex::new(0.0, 0.0); n];
        for i in 0..n {
            let gxy = buf_x[i].conj() * buf_y[i];

            if self.use_phat {
                // GCC-PHAT: normalize by magnitude → whitens the spectrum
                let mag = gxy.norm();
                cross[i] = if mag > 1e-20 { gxy / mag } else { Complex::new(0.0, 0.0) };
            } else {
                cross[i] = gxy;
            }
        }

        // Inverse FFT → cross-correlation in time domain
        self.fft_inverse
            .process_with_scratch(&mut cross, &mut self.scratch);

        // Normalize IFFT output
        let norm = 1.0 / n as f32;
        for c in &mut cross {
            *c *= norm;
        }

        // Find peak in valid delay range.
        // Positive delays: indices 0..max_delay (measurement lags reference)
        // Negative delays: indices (n-max_delay)..n (measurement leads reference)
        let (peak_idx, peak_val) = self.find_peak(&cross);

        // Convert circular index to signed delay
        let signed_delay = if peak_idx <= n / 2 {
            peak_idx as i64
        } else {
            peak_idx as i64 - n as i64
        };

        // Subsample interpolation via parabolic fit around the peak
        let subsample_offset = parabolic_interpolation(&cross, peak_idx);
        let delay_samples = signed_delay as f64 + subsample_offset;

        // Polarity detection
        let polarity = if peak_val >= 0.0 { 1.0 } else { -1.0 };

        // Find max correlation for confidence normalization
        let max_abs = cross.iter().map(|c| c.re.abs()).fold(0.0_f32, f32::max);
        let confidence = if max_abs > 1e-20 {
            (peak_val.abs() / max_abs) as f64
        } else {
            0.0
        };

        let delay_ms = delay_samples / sample_rate as f64 * 1000.0;
        let speed_of_sound = speed_of_sound_at(self.temperature_c);
        let delay_metres = delay_samples / sample_rate as f64 * speed_of_sound;

        DelayResult {
            delay_samples,
            delay_ms,
            delay_metres,
            confidence,
            polarity,
            speed_of_sound,
        }
    }

    /// Fills a complex buffer with real samples (zero-padded or truncated).
    fn fill_and_window(&self, buf: &mut [Complex<f32>], samples: &[f32]) {
        let n = buf.len().min(samples.len());
        for i in 0..n {
            buf[i] = Complex::new(samples[i], 0.0);
        }
        for i in n..buf.len() {
            buf[i] = Complex::new(0.0, 0.0);
        }
    }

    /// Finds the peak of the cross-correlation within the valid delay range.
    fn find_peak(&self, cross: &[Complex<f32>]) -> (usize, f32) {
        let n = cross.len();
        let mut best_idx = 0;
        let mut best_val = f32::NEG_INFINITY;

        // Positive delay region: 0..max_delay
        for i in 0..self.max_delay.min(n) {
            let val = cross[i].re.abs();
            if val > best_val {
                best_val = val;
                best_idx = i;
            }
        }

        // Negative delay region: (n - max_delay)..n
        let neg_start = n.saturating_sub(self.max_delay);
        for i in neg_start..n {
            let val = cross[i].re.abs();
            if val > best_val {
                best_val = val;
                best_idx = i;
            }
        }

        (best_idx, cross[best_idx].re)
    }
}

// ─── Utilities ──────────────────────────────────────────────────────────

/// Parabolic (3-point) interpolation around a peak for subsample accuracy.
///
/// Given samples at indices (peak-1, peak, peak+1), fits a parabola and
/// returns the fractional offset from `peak` to the true maximum.
fn parabolic_interpolation(data: &[Complex<f32>], peak: usize) -> f64 {
    let n = data.len();
    if n < 3 {
        return 0.0;
    }

    let prev = data[(peak + n - 1) % n].re as f64;
    let curr = data[peak].re as f64;
    let next = data[(peak + 1) % n].re as f64;

    let denom = 2.0 * (2.0 * curr - prev - next);
    if denom.abs() < 1e-20 {
        return 0.0;
    }

    (prev - next) / denom
}

/// Speed of sound in air at a given temperature (°C).
///
/// Formula: c = 331.3 + 0.606 · T  (approximation valid for 0–40°C)
fn speed_of_sound_at(temperature_c: f64) -> f64 {
    331.3 + 0.606 * temperature_c
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_delay() {
        let config = DelayFinderConfig {
            fft_size: 1024,
            use_phat: false,
            ..Default::default()
        };
        let mut finder = DelayFinder::new(&config);

        // Identical signals → delay should be ~0
        let signal: Vec<f32> = (0..1024).map(|i| (i as f32 * 0.1).sin()).collect();
        let result = finder.find_delay(&signal, &signal, 48000.0);
        assert!(
            result.delay_samples.abs() < 1.0,
            "Expected ~0 delay, got {}",
            result.delay_samples
        );
    }

    #[test]
    fn test_known_delay() {
        let config = DelayFinderConfig {
            fft_size: 4096,
            use_phat: false,
            ..Default::default()
        };
        let mut finder = DelayFinder::new(&config);

        // Create reference and delayed measurement
        let delay = 50;
        let reference: Vec<f32> = (0..4096)
            .map(|i| {
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin()
            })
            .collect();
        let mut measurement = vec![0.0_f32; 4096];
        for i in delay..4096 {
            measurement[i] = reference[i - delay];
        }

        let result = finder.find_delay(&reference, &measurement, 48000.0);
        let error = (result.delay_samples - delay as f64).abs();
        assert!(error < 2.0, "Expected delay ~{delay}, got {}", result.delay_samples);
    }

    #[test]
    fn test_speed_of_sound() {
        let c = speed_of_sound_at(20.0);
        assert!((c - 343.42).abs() < 0.1, "Expected ~343.4, got {c}");
    }
}
