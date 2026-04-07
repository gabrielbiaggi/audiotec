//! Auto-EQ — automatic parametric equalizer band computation.
//!
//! Compares measured frequency response against a target curve and
//! proposes PEQ filter bands (frequency, gain, Q) to flatten the
//! response. Uses peak/dip detection on the smoothed difference curve.

use serde::{Deserialize, Serialize};

// ─── Types ──────────────────────────────────────────────────────────────

/// A single parametric EQ band.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeqBand {
    /// Center frequency (Hz)
    pub frequency: f64,
    /// Gain in dB (negative = cut, positive = boost)
    pub gain_db: f64,
    /// Q factor
    pub q: f64,
    /// Bandwidth in octaves (derived from Q)
    pub bandwidth_oct: f64,
}

/// Input for auto-EQ computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoEqRequest {
    /// Frequency bins (Hz)
    pub frequencies: Vec<f64>,
    /// Measured magnitude in dB
    pub measured_db: Vec<f64>,
    /// Target magnitude in dB
    pub target_db: Vec<f64>,
    /// Maximum boost allowed (dB). Default: 6.0
    pub max_boost_db: Option<f64>,
    /// Minimum deviation to create a band (dB). Default: 2.0
    pub threshold_db: Option<f64>,
    /// Maximum number of PEQ bands. Default: 10
    pub max_bands: Option<usize>,
    /// Smoothing resolution in octave fractions. Default: 3 (1/3 octave)
    pub smoothing_resolution: Option<usize>,
}

/// Result of auto-EQ computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoEqResult {
    /// Proposed PEQ bands
    pub bands: Vec<PeqBand>,
    /// Smoothed measured dB (post-smoothing, pre-EQ)
    pub smoothed_measured_db: Vec<f64>,
    /// Predicted response after applying proposed EQ
    pub predicted_db: Vec<f64>,
    /// RMS error before EQ (dB)
    pub rms_error_before: f64,
    /// RMS error after EQ (dB)
    pub rms_error_after: f64,
}

// ─── Computation ────────────────────────────────────────────────────────

/// Computes PEQ bands to match measured response to target.
pub fn compute(req: &AutoEqRequest) -> AutoEqResult {
    let max_boost = req.max_boost_db.unwrap_or(6.0);
    let threshold = req.threshold_db.unwrap_or(2.0);
    let max_bands = req.max_bands.unwrap_or(10);
    let smooth_res = req.smoothing_resolution.unwrap_or(3);

    let n = req.frequencies.len();
    if n == 0 || req.measured_db.len() != n || req.target_db.len() != n {
        return AutoEqResult {
            bands: vec![],
            smoothed_measured_db: vec![],
            predicted_db: vec![],
            rms_error_before: 0.0,
            rms_error_after: 0.0,
        };
    }

    // 1. Smooth the measured curve
    let smoothed = fractional_octave_smooth(&req.frequencies, &req.measured_db, smooth_res);

    // 2. Compute difference: measured - target (positive = need to cut)
    let mut diff: Vec<f64> = smoothed.iter().zip(req.target_db.iter()).map(|(m, t)| m - t).collect();

    // 3. RMS error before EQ
    let rms_before = rms(&diff);

    // 4. Iteratively find peaks/dips and propose bands
    let mut bands = Vec::new();
    let mut predicted = smoothed.clone();

    for _ in 0..max_bands {
        // Recompute diff from predicted
        diff = predicted.iter().zip(req.target_db.iter()).map(|(m, t)| m - t).collect();

        // Find the peak of absolute difference
        let (peak_idx, peak_val) = diff
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.abs().partial_cmp(&b.abs()).unwrap())
            .map(|(i, v)| (i, *v))
            .unwrap_or((0, 0.0));

        if peak_val.abs() < threshold {
            break;
        }

        let freq = req.frequencies[peak_idx];

        // Determine Q by finding the -3dB bandwidth of the peak
        let q = estimate_q(&diff, peak_idx, &req.frequencies);

        // Gain is the negative of the difference (cut peaks, boost dips)
        let mut gain = -peak_val;

        // Limit boost
        if gain > max_boost {
            gain = max_boost;
        }

        let bandwidth_oct = q_to_bandwidth(q);

        let band = PeqBand {
            frequency: (freq * 10.0).round() / 10.0,
            gain_db: (gain * 100.0).round() / 100.0,
            q: (q * 100.0).round() / 100.0,
            bandwidth_oct: (bandwidth_oct * 1000.0).round() / 1000.0,
        };

        // Apply this band to predicted response
        apply_peq_band(&mut predicted, &req.frequencies, &band);

        bands.push(band);
    }

    // 5. Final RMS error
    let diff_after: Vec<f64> = predicted.iter().zip(req.target_db.iter()).map(|(m, t)| m - t).collect();
    let rms_after = rms(&diff_after);

    // Sort bands by frequency
    bands.sort_by(|a, b| a.frequency.partial_cmp(&b.frequency).unwrap());

    AutoEqResult {
        bands,
        smoothed_measured_db: smoothed,
        predicted_db: predicted,
        rms_error_before: (rms_before * 100.0).round() / 100.0,
        rms_error_after: (rms_after * 100.0).round() / 100.0,
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

/// Fractional octave smoothing on a dB magnitude curve.
fn fractional_octave_smooth(freqs: &[f64], db: &[f64], resolution: usize) -> Vec<f64> {
    let n = freqs.len();
    if n == 0 {
        return vec![];
    }

    let factor = 2.0f64.powf(1.0 / (2.0 * resolution as f64));
    let mut smoothed = vec![0.0f64; n];

    for i in 0..n {
        let fc = freqs[i];
        if fc <= 0.0 {
            smoothed[i] = db[i];
            continue;
        }

        let f_lo = fc / factor;
        let f_hi = fc * factor;

        let mut sum = 0.0f64;
        let mut count = 0u32;

        for j in 0..n {
            if freqs[j] >= f_lo && freqs[j] <= f_hi {
                // Power average in dB domain
                sum += 10.0f64.powf(db[j] / 10.0);
                count += 1;
            }
        }

        if count > 0 {
            smoothed[i] = 10.0 * (sum / count as f64).max(1e-20).log10();
        } else {
            smoothed[i] = db[i];
        }
    }

    smoothed
}

/// Estimates Q factor by finding the -3dB bandwidth around a peak.
fn estimate_q(diff: &[f64], peak_idx: usize, freqs: &[f64]) -> f64 {
    let peak_val = diff[peak_idx].abs();
    let half_power = peak_val - 3.0;

    // Search left for -3dB point
    let mut left_freq = freqs[peak_idx];
    for i in (0..peak_idx).rev() {
        if diff[i].abs() <= half_power {
            left_freq = freqs[i];
            break;
        }
    }

    // Search right for -3dB point
    let mut right_freq = freqs[peak_idx];
    for i in (peak_idx + 1)..diff.len() {
        if diff[i].abs() <= half_power {
            right_freq = freqs[i];
            break;
        }
    }

    let bandwidth = right_freq - left_freq;
    if bandwidth > 0.0 {
        let q = freqs[peak_idx] / bandwidth;
        q.clamp(0.5, 20.0)
    } else {
        4.0 // Default Q when bandwidth can't be determined
    }
}

/// Applies a PEQ band to a magnitude response.
///
/// Uses a second-order peaking EQ transfer function magnitude:
/// H(f) = gain at center ± bandwidth, tapering off outside.
fn apply_peq_band(response: &mut [f64], freqs: &[f64], band: &PeqBand) {
    let fc = band.frequency;
    let gain = band.gain_db;
    let q = band.q;

    for (i, &f) in freqs.iter().enumerate() {
        if f <= 0.0 || fc <= 0.0 {
            continue;
        }
        // Normalized frequency ratio
        let ratio = f / fc;
        let log_ratio = ratio.ln();

        // Gaussian-shaped bell in log-frequency space
        // Width determined by Q: higher Q = narrower bell
        let sigma = 1.0 / (2.0 * q);
        let bell = (-0.5 * (log_ratio / sigma).powi(2)).exp();

        response[i] += gain * bell;
    }
}

/// Converts Q factor to bandwidth in octaves.
fn q_to_bandwidth(q: f64) -> f64 {
    if q <= 0.0 {
        return 0.0;
    }
    // BW = (2 / ln(2)) × arcsinh(1 / (2×Q))
    let x = 1.0 / (2.0 * q);
    (2.0 / 2.0f64.ln()) * (x + (x * x + 1.0).sqrt()).ln()
}

/// RMS of a slice.
fn rms(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let sum_sq: f64 = values.iter().map(|v| v * v).sum();
    (sum_sq / values.len() as f64).sqrt()
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flat_response_no_bands() {
        let freqs: Vec<f64> = (1..=100).map(|i| i as f64 * 100.0).collect();
        let measured: Vec<f64> = vec![0.0; 100];
        let target: Vec<f64> = vec![0.0; 100];

        let req = AutoEqRequest {
            frequencies: freqs,
            measured_db: measured,
            target_db: target,
            max_boost_db: None,
            threshold_db: None,
            max_bands: None,
            smoothing_resolution: None,
        };

        let result = compute(&req);
        assert!(result.bands.is_empty(), "Flat response should need no EQ");
        assert!(result.rms_error_before < 0.5);
    }

    #[test]
    fn test_q_to_bandwidth() {
        let bw = q_to_bandwidth(1.414);
        assert!((bw - 1.0).abs() < 0.1, "Q=1.414 ≈ 1 octave, got {bw}");
    }
}
