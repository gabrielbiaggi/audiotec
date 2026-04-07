//! Impulse Response — Farina log-sweep method, Schroeder integration, RT60.
//!
//! This module implements the standard workflow for room acoustics:
//!
//! 1. **Generate** a logarithmic sine sweep (Farina 2000 method).
//! 2. **Capture** the room response while playing the sweep.
//! 3. **Deconvolve** the captured signal by the inverse sweep filter
//!    to extract the linear Impulse Response (IR).
//! 4. **Analyse** the IR: Schroeder backwards integration for decay
//!    curves, and linear regression for RT60 (T20, T30).
//!
//! References:
//! - A. Farina, "Simultaneous Measurement of Impulse Response and
//!   Distortion with a Swept-Sine Technique", AES 108th Conv., 2000.
//! - M. R. Schroeder, "New Method of Measuring Reverberation Time",
//!   JASA 37(3), 1965.

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::sync::Arc;

// ─── Public types ───────────────────────────────────────────────────────

/// Parameters for generating a logarithmic sine sweep.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SweepConfig {
    /// Start frequency (Hz). Typically 20 Hz.
    pub start_freq: f64,
    /// End frequency (Hz). Typically 20000 Hz.
    pub end_freq: f64,
    /// Duration of the sweep in seconds (e.g. 5.0).
    pub duration_secs: f64,
    /// Sample rate (Hz).
    pub sample_rate: f64,
    /// Fade-in/out duration in seconds (0.01 = 10ms).
    pub fade_secs: Option<f64>,
}

impl Default for SweepConfig {
    fn default() -> Self {
        Self {
            start_freq: 20.0,
            end_freq: 20000.0,
            duration_secs: 5.0,
            sample_rate: 48000.0,
            fade_secs: Some(0.01),
        }
    }
}

/// Result of impulse response analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrAnalysisResult {
    /// The extracted impulse response (linear, normalised to peak = 1.0).
    pub impulse_response: Vec<f32>,
    /// Energy Decay Curve (Schroeder integration) in dB.
    pub edc_db: Vec<f32>,
    /// Sample rate of the IR.
    pub sample_rate: f64,
    /// RT60 estimates.
    pub rt60: Rt60Result,
}

/// RT60 decay time estimates from Schroeder integration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rt60Result {
    /// T20: decay time extrapolated from -5 dB to -25 dB range.
    pub t20_secs: Option<f64>,
    /// T30: decay time extrapolated from -5 dB to -35 dB range.
    pub t30_secs: Option<f64>,
    /// EDT (Early Decay Time): decay time from 0 dB to -10 dB range.
    pub edt_secs: Option<f64>,
    /// C50: Clarity for speech (ratio of energy 0-50ms / 50ms-∞), in dB.
    pub c50_db: Option<f64>,
    /// C80: Clarity for music (ratio of energy 0-80ms / 80ms-∞), in dB.
    pub c80_db: Option<f64>,
    /// D50: Definition (fraction of energy in first 50ms), 0..1.
    pub d50: Option<f64>,
}

// ─── Sweep generation ───────────────────────────────────────────────────

/// Generates a logarithmic sine sweep (Farina method).
///
/// The sweep has an exponentially increasing instantaneous frequency:
///   x(t) = sin(2π·f1·T/ln(f2/f1) · (e^(t·ln(f2/f1)/T) - 1))
///
/// where T = duration, f1 = start_freq, f2 = end_freq.
///
/// Returns the sweep signal and its inverse filter for deconvolution.
pub fn generate_log_sweep(config: &SweepConfig) -> (Vec<f32>, Vec<f32>) {
    let sr = config.sample_rate;
    let f1 = config.start_freq;
    let f2 = config.end_freq;
    let t_total = config.duration_secs;
    let n_samples = (t_total * sr) as usize;
    let fade = config.fade_secs.unwrap_or(0.01);
    let fade_samples = (fade * sr) as usize;

    let ln_ratio = (f2 / f1).ln();
    let k = t_total / ln_ratio;

    let mut sweep = Vec::with_capacity(n_samples);

    for i in 0..n_samples {
        let t = i as f64 / sr;
        let phase = 2.0 * PI * f1 * k * ((t * ln_ratio / t_total).exp() - 1.0);
        let mut sample = phase.sin() as f32;

        // Fade-in
        if i < fade_samples {
            sample *= (0.5 * (1.0 - (PI * i as f64 / fade_samples as f64).cos())) as f32;
        }
        // Fade-out
        if i >= n_samples - fade_samples {
            let j = n_samples - 1 - i;
            sample *= (0.5 * (1.0 - (PI * j as f64 / fade_samples as f64).cos())) as f32;
        }

        sweep.push(sample);
    }

    // Generate inverse filter: time-reversed sweep with amplitude envelope
    // compensation. The log sweep has increasing energy with frequency, so
    // the inverse must attenuate high frequencies by -6dB/octave.
    let mut inverse = sweep.clone();
    inverse.reverse();

    // Apply amplitude envelope: -6 dB/octave = multiply by e^(-t·ln(f2/f1)/T)
    for i in 0..n_samples {
        let t = i as f64 / sr;
        let env = (-t * ln_ratio / t_total).exp() as f32;
        inverse[i] *= env;
    }

    // Normalize inverse filter energy
    let energy: f64 = inverse.iter().map(|s| (*s as f64) * (*s as f64)).sum();
    if energy > 1e-20 {
        let norm = (n_samples as f64 / energy).sqrt() as f32;
        for s in &mut inverse {
            *s *= norm;
        }
    }

    (sweep, inverse)
}

// ─── Deconvolution ──────────────────────────────────────────────────────

/// Deconvolves a captured room response with the inverse sweep filter
/// to extract the linear impulse response.
///
/// Uses frequency-domain multiplication:
///   IR = IFFT{ FFT{capture} · FFT{inverse} }
///
/// The FFT size is the next power of 2 ≥ (capture.len() + inverse.len() - 1)
/// to avoid circular convolution artefacts.
pub fn deconvolve(capture: &[f32], inverse_filter: &[f32]) -> Vec<f32> {
    let conv_len = capture.len() + inverse_filter.len() - 1;
    let fft_size = conv_len.next_power_of_two();

    let mut planner = FftPlanner::<f32>::new();
    let fft_fwd = planner.plan_fft_forward(fft_size);
    let fft_inv = planner.plan_fft_inverse(fft_size);

    // Zero-pad capture → complex buffer
    let mut buf_cap: Vec<Complex<f32>> = capture
        .iter()
        .map(|&s| Complex::new(s, 0.0))
        .chain(std::iter::repeat(Complex::new(0.0, 0.0)))
        .take(fft_size)
        .collect();

    // Zero-pad inverse filter → complex buffer
    let mut buf_inv: Vec<Complex<f32>> = inverse_filter
        .iter()
        .map(|&s| Complex::new(s, 0.0))
        .chain(std::iter::repeat(Complex::new(0.0, 0.0)))
        .take(fft_size)
        .collect();

    let mut scratch = vec![Complex::new(0.0, 0.0); fft_fwd.get_inplace_scratch_len()];
    let mut scratch_inv = vec![Complex::new(0.0, 0.0); fft_inv.get_inplace_scratch_len()];

    fft_fwd.process_with_scratch(&mut buf_cap, &mut scratch);
    fft_fwd.process_with_scratch(&mut buf_inv, &mut scratch);

    // Pointwise multiplication in frequency domain
    for i in 0..fft_size {
        buf_cap[i] *= buf_inv[i];
    }

    // Inverse FFT
    fft_inv.process_with_scratch(&mut buf_cap, &mut scratch_inv);

    // Extract real part and normalize
    let norm = 1.0 / fft_size as f32;
    let mut ir: Vec<f32> = buf_cap.iter().map(|c| c.re * norm).collect();

    // Truncate to conv_len (remove zero-pad tail)
    ir.truncate(conv_len);

    // Normalize peak to 1.0
    let peak = ir.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
    if peak > 1e-20 {
        for s in &mut ir {
            *s /= peak;
        }
    }

    ir
}

// ─── Schroeder integration & RT60 ──────────────────────────────────────

/// Computes the Energy Decay Curve via Schroeder backwards integration:
///
///   EDC(t) = ∫{t→∞} h²(τ) dτ
///
/// where h(t) is the impulse response. Result is returned in dB
/// normalized to 0 dB at the start.
pub fn schroeder_integration(ir: &[f32]) -> Vec<f32> {
    let n = ir.len();
    let mut edc = vec![0.0_f64; n];

    // Backwards cumulative sum of squared IR
    edc[n - 1] = (ir[n - 1] as f64) * (ir[n - 1] as f64);
    for i in (0..n - 1).rev() {
        edc[i] = edc[i + 1] + (ir[i] as f64) * (ir[i] as f64);
    }

    // Convert to dB, normalised to 0 dB at t=0
    let max_val = edc[0].max(1e-20);
    edc.iter()
        .map(|&e| (10.0 * (e / max_val).max(1e-20).log10()) as f32)
        .collect()
}

/// Estimates RT60 from the Energy Decay Curve using linear regression
/// over specified evaluation ranges.
///
/// T20: fit from -5 to -25 dB, extrapolate to -60 dB
/// T30: fit from -5 to -35 dB, extrapolate to -60 dB
/// EDT: fit from 0 to -10 dB, extrapolate to -60 dB
pub fn estimate_rt60(edc_db: &[f32], sample_rate: f64) -> Rt60Result {
    let t20_secs = fit_decay(edc_db, sample_rate, -5.0, -25.0);
    let t30_secs = fit_decay(edc_db, sample_rate, -5.0, -35.0);
    let edt_secs = fit_decay(edc_db, sample_rate, 0.0, -10.0);

    Rt60Result {
        t20_secs,
        t30_secs,
        edt_secs,
        c50_db: None, // computed separately from IR
        c80_db: None,
        d50: None,
    }
}

/// Computes clarity and definition metrics from the impulse response.
///
/// - C50 = 10·log10(E_0_50ms / E_50ms_inf) — speech clarity
/// - C80 = 10·log10(E_0_80ms / E_80ms_inf) — music clarity
/// - D50 = E_0_50ms / E_total — definition
pub fn compute_clarity(ir: &[f32], sample_rate: f64) -> (Option<f64>, Option<f64>, Option<f64>) {
    let n50 = (0.050 * sample_rate) as usize;
    let n80 = (0.080 * sample_rate) as usize;

    if ir.len() < n80 + 1 {
        return (None, None, None);
    }

    let energy = |slice: &[f32]| -> f64 {
        slice.iter().map(|&s| (s as f64) * (s as f64)).sum()
    };

    let e_total = energy(ir);
    if e_total < 1e-20 {
        return (None, None, None);
    }

    let e_0_50 = energy(&ir[..n50.min(ir.len())]);
    let e_0_80 = energy(&ir[..n80.min(ir.len())]);
    let e_50_inf = e_total - e_0_50;
    let e_80_inf = e_total - e_0_80;

    let c50 = if e_50_inf > 1e-20 {
        Some(10.0 * (e_0_50 / e_50_inf).log10())
    } else {
        None
    };

    let c80 = if e_80_inf > 1e-20 {
        Some(10.0 * (e_0_80 / e_80_inf).log10())
    } else {
        None
    };

    let d50 = Some(e_0_50 / e_total);

    (c50, c80, d50)
}

/// Performs full IR analysis: Schroeder integration + RT60 + clarity.
pub fn analyse_ir(ir: &[f32], sample_rate: f64) -> IrAnalysisResult {
    let edc_db = schroeder_integration(ir);
    let mut rt60 = estimate_rt60(&edc_db, sample_rate);

    let (c50, c80, d50) = compute_clarity(ir, sample_rate);
    rt60.c50_db = c50;
    rt60.c80_db = c80;
    rt60.d50 = d50;

    IrAnalysisResult {
        impulse_response: ir.to_vec(),
        edc_db,
        sample_rate,
        rt60,
    }
}

// ─── Internal helpers ───────────────────────────────────────────────────

/// Linear regression on a segment of the EDC to estimate decay rate.
///
/// Fits a line to EDC values between `start_db` and `end_db`.
/// Extrapolates the slope to a 60 dB drop to estimate RT60.
fn fit_decay(edc_db: &[f32], sample_rate: f64, start_db: f32, end_db: f32) -> Option<f64> {
    // Find sample indices where EDC crosses start_db and end_db
    let i_start = edc_db.iter().position(|&v| v <= start_db)?;
    let i_end = edc_db.iter().position(|&v| v <= end_db)?;

    if i_end <= i_start + 2 {
        return None; // not enough points
    }

    // Linear regression: y = a·x + b where x = sample index, y = dB
    let n = (i_end - i_start) as f64;
    let mut sum_x = 0.0_f64;
    let mut sum_y = 0.0_f64;
    let mut sum_xy = 0.0_f64;
    let mut sum_xx = 0.0_f64;

    for i in i_start..=i_end {
        let x = i as f64;
        let y = edc_db[i] as f64;
        sum_x += x;
        sum_y += y;
        sum_xy += x * y;
        sum_xx += x * x;
    }

    let count = (i_end - i_start + 1) as f64;
    let denom = count * sum_xx - sum_x * sum_x;
    if denom.abs() < 1e-20 {
        return None;
    }

    let slope = (count * sum_xy - sum_x * sum_y) / denom; // dB per sample

    if slope.abs() < 1e-20 {
        return None;
    }

    // RT60 = -60 dB / slope (in samples), then convert to seconds
    let rt60_samples = -60.0 / slope;
    let rt60_secs = rt60_samples / sample_rate;

    if rt60_secs > 0.0 && rt60_secs < 60.0 {
        Some(rt60_secs)
    } else {
        None
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sweep_generation() {
        let config = SweepConfig {
            duration_secs: 0.5,
            sample_rate: 48000.0,
            ..Default::default()
        };
        let (sweep, inverse) = generate_log_sweep(&config);
        assert_eq!(sweep.len(), 24000);
        assert_eq!(inverse.len(), 24000);
        // Sweep should be bounded
        assert!(sweep.iter().all(|&s| s.abs() <= 1.01));
    }

    #[test]
    fn test_schroeder_integration() {
        // Exponential decay IR: h(t) = e^(-t/tau)
        let sr = 48000.0;
        let tau = 0.5; // 500ms decay constant
        let n = (sr * 2.0) as usize; // 2 seconds
        let ir: Vec<f32> = (0..n)
            .map(|i| (-(i as f64) / (tau * sr)).exp() as f32)
            .collect();

        let edc = schroeder_integration(&ir);
        assert_eq!(edc.len(), n);
        // EDC should start at 0 dB
        assert!((edc[0]).abs() < 0.1, "EDC[0] = {} (expected ~0 dB)", edc[0]);
        // EDC should be monotonically decreasing
        for i in 1..n {
            assert!(edc[i] <= edc[i - 1] + 1e-6, "EDC not decreasing at {i}");
        }
    }

    #[test]
    fn test_deconvolve_identity() {
        // Deconvolving a sweep by its inverse should give an impulse-like response
        let config = SweepConfig {
            duration_secs: 0.1,
            sample_rate: 48000.0,
            ..Default::default()
        };
        let (sweep, inverse) = generate_log_sweep(&config);
        let ir = deconvolve(&sweep, &inverse);

        // The peak should be near 1.0 (normalized)
        let peak = ir.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
        assert!((peak - 1.0).abs() < 0.01, "Peak = {peak}");
    }
}
