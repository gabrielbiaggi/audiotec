//! Spatial Average — Coherence-Weighted Power Average of multiple traces.
//!
//! When measuring a room (church, auditorium), multiple microphone positions
//! are captured to characterise the spatial response. A naïve arithmetic
//! average of dB values is physically meaningless and can mask real problems.
//!
//! ## Algorithm: Coherence-Weighted RMS (Power) Average
//!
//! For each frequency bin f:
//!
//!   1. Convert dB → linear power:  P_i(f) = 10^(dB_i(f)/10)
//!   2. Weight by coherence:         w_i(f) = γ²_i(f)  (if γ² ≥ threshold)
//!                                            = 0       (if γ² < threshold — BLANKED)
//!   3. Weighted sum:                P_avg(f) = Σ(w_i · P_i) / Σ(w_i)
//!   4. Convert back:                dB_avg(f) = 10 · log10(P_avg)
//!
//! ## Coherence Blanking
//!
//! Bins where coherence γ² < threshold (default 0.2 / 20%) receive weight
//! zero. This prevents measurements with poor SNR or heavy room contamination
//! from corrupting the average. The blanking threshold is configurable.
//!
//! Without coherence blanking, a single bad measurement position (e.g. in a
//! null zone) would drag down the entire average. With blanking, only
//! positions that have statistically valid data at each frequency contribute.
//!
//! ## Phase Averaging
//!
//! Phase is averaged using coherence-weighted circular mean (atan2 of
//! weighted sin/cos components) to handle the ±180° wraparound correctly.
//!
//! ## Performance
//!
//! All computation is O(N·B) where N = num_traces and B = num_bins.
//! No FFT or heavy math — runs in microseconds on the Tauri async runtime.
//!
//! ## References
//!
//! - Smaart v9: "Spatial Average" with coherence blanking threshold.
//! - ISO 3382: Measurement of room acoustic parameters — spatial sampling.
//! - Herlufsen, H. (1984): "Dual Channel FFT Analysis" — coherence as quality metric.

use serde::{Deserialize, Serialize};

// ─── Types ──────────────────────────────────────────────────────────────

/// A single stored trace with frequency-domain data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredTrace {
    pub label: String,
    pub frequencies: Vec<f32>,
    pub magnitude_db: Vec<f32>,
    pub phase_deg: Vec<f32>,
    pub coherence: Vec<f32>,
}

/// Configuration for the spatial average computation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialAverageConfig {
    /// Coherence blanking threshold (0.0–1.0). Bins below this are excluded.
    /// Default: 0.2 (20%). Smaart v9 uses a similar default.
    /// Set to 0.0 to disable blanking (all bins contribute equally).
    pub coherence_threshold: Option<f32>,

    /// If true, use coherence as weight (γ² weighting). If false, all
    /// non-blanked bins get equal weight (binary blanking only).
    /// Default: true. Coherence weighting gives more importance to
    /// positions with cleaner data at each frequency.
    pub use_coherence_weighting: Option<bool>,
}

impl Default for SpatialAverageConfig {
    fn default() -> Self {
        Self {
            coherence_threshold: Some(0.2),
            use_coherence_weighting: Some(true),
        }
    }
}

/// Result of spatial averaging.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialAverageResult {
    /// Frequency bins (Hz)
    pub frequencies: Vec<f32>,
    /// Coherence-weighted power-averaged magnitude (dB)
    pub magnitude_db: Vec<f32>,
    /// Coherence-weighted circular-averaged phase (degrees)
    pub phase_deg: Vec<f32>,
    /// Averaged coherence (arithmetic mean of non-blanked traces)
    pub coherence: Vec<f32>,
    /// Number of traces averaged
    pub num_traces: usize,
    /// Per-bin count of how many traces contributed (after blanking).
    /// Useful for the UI to show "data density" or flag sparse regions.
    pub contributing_traces: Vec<usize>,
    /// Coherence threshold that was applied
    pub coherence_threshold: f32,
}

// ─── Computation ────────────────────────────────────────────────────────

/// Computes the coherence-weighted power average of multiple measurement traces.
///
/// ## Power Averaging with Coherence Weighting
///
/// For each bin f across all traces i:
///
///   P_i(f) = 10^(dB_i(f) / 10)       — convert to linear power
///   w_i(f) = γ²_i(f)                  — coherence weight (or 0 if blanked)
///   P_avg(f) = Σ(w_i · P_i) / Σ(w_i) — weighted mean in power domain
///   dB_avg(f) = 10 · log10(P_avg)     — back to dB
///
/// This preserves energy content while giving more importance to measurements
/// with high coherence (high SNR, low contamination).
///
/// ## Phase Averaging
///
/// Uses coherence-weighted circular mean:
///   θ_avg(f) = atan2(Σ(w_i · sin(θ_i)), Σ(w_i · cos(θ_i)))
///
/// This handles the ±180° wraparound correctly — essential for transfer
/// function phase which routinely crosses ±180°.
pub fn compute(
    traces: &[StoredTrace],
    config: Option<&SpatialAverageConfig>,
) -> Result<SpatialAverageResult, String> {
    if traces.is_empty() {
        return Err("No traces to average".into());
    }

    let default_config = SpatialAverageConfig::default();
    let config = config.unwrap_or(&default_config);

    let coherence_threshold = config.coherence_threshold.unwrap_or(0.2).clamp(0.0, 1.0);
    let use_weighting = config.use_coherence_weighting.unwrap_or(true);

    let num_traces = traces.len();
    let num_bins = traces[0].frequencies.len();

    // Validate all traces have consistent bin counts
    for (i, trace) in traces.iter().enumerate() {
        if trace.frequencies.len() != num_bins
            || trace.magnitude_db.len() != num_bins
            || trace.phase_deg.len() != num_bins
            || trace.coherence.len() != num_bins
        {
            return Err(format!(
                "Trace '{}' (index {}) has inconsistent bin count. Expected {} bins \
                 (freq={}, mag={}, phase={}, coh={})",
                trace.label,
                i,
                num_bins,
                trace.frequencies.len(),
                trace.magnitude_db.len(),
                trace.phase_deg.len(),
                trace.coherence.len(),
            ));
        }
    }

    let frequencies = traces[0].frequencies.clone();

    // Accumulators for weighted sums — use f64 to maintain precision
    // across many traces (32-bit would accumulate rounding errors).
    let mut weighted_power_sum = vec![0.0f64; num_bins];
    let mut weight_sum = vec![0.0f64; num_bins];
    let mut weighted_sin_sum = vec![0.0f64; num_bins];
    let mut weighted_cos_sum = vec![0.0f64; num_bins];
    let mut coherence_sum = vec![0.0f64; num_bins];
    let mut contributing = vec![0usize; num_bins];

    for trace in traces {
        for bin in 0..num_bins {
            let coh = trace.coherence[bin].clamp(0.0, 1.0);

            // ── Coherence Blanking ──────────────────────────────────
            //
            // If γ² < threshold, this bin from this trace contributes
            // ZERO weight. This prevents low-SNR data from corrupting
            // the average. Common in nulls, far off-axis positions,
            // or frequencies where the room has severe modal issues.
            if coh < coherence_threshold {
                continue; // Blanked — skip this trace for this bin
            }

            // ── Compute weight ──────────────────────────────────────
            //
            // With coherence weighting (default): w = γ²
            //   High coherence → high weight → this trace's data at
            //   this frequency is trustworthy.
            //
            // Without weighting (binary mode): w = 1.0
            //   All non-blanked traces contribute equally. Simpler but
            //   less robust when coherence varies across positions.
            let w = if use_weighting { coh as f64 } else { 1.0 };

            // ── Power domain accumulation ───────────────────────────
            //
            // Convert dB → linear power: P = 10^(dB/10)
            // This is the correct physical quantity to average (energy).
            // Averaging dB directly would underestimate the true level.
            let db = trace.magnitude_db[bin] as f64;
            let power = 10.0f64.powf(db / 10.0);
            weighted_power_sum[bin] += w * power;

            // ── Phase circular components (weighted) ────────────────
            let phase_rad = (trace.phase_deg[bin] as f64).to_radians();
            weighted_sin_sum[bin] += w * phase_rad.sin();
            weighted_cos_sum[bin] += w * phase_rad.cos();

            // ── Coherence accumulation (unweighted, for averaging) ──
            coherence_sum[bin] += coh as f64;
            weight_sum[bin] += w;
            contributing[bin] += 1;
        }
    }

    // ── Compute final averaged values ───────────────────────────────────
    let mut magnitude_db = Vec::with_capacity(num_bins);
    let mut phase_deg = Vec::with_capacity(num_bins);
    let mut coherence = Vec::with_capacity(num_bins);

    for bin in 0..num_bins {
        let w_total = weight_sum[bin];
        let n_contrib = contributing[bin];

        if w_total > 1e-20 && n_contrib > 0 {
            // ── Weighted power average → dB ─────────────────────────
            //
            // P_avg = Σ(w_i · P_i) / Σ(w_i)
            // dB_avg = 10 · log10(P_avg)
            //
            // Clamped to -150 dB minimum to avoid -∞ in display.
            let avg_power = weighted_power_sum[bin] / w_total;
            let db = 10.0 * avg_power.max(1e-15).log10();
            magnitude_db.push(db as f32);

            // ── Coherence-weighted circular mean of phase ───────────
            //
            // θ_avg = atan2(Σ(w·sin(θ)), Σ(w·cos(θ)))
            //
            // This naturally handles the ±180° wraparound. If all phases
            // are similar, the result is their approximate arithmetic mean.
            // If phases are scattered, the resultant length shrinks — the
            // average "confidence" in the phase is low (captured by coherence).
            let avg_sin = weighted_sin_sum[bin] / w_total;
            let avg_cos = weighted_cos_sum[bin] / w_total;
            let avg_phase = avg_sin.atan2(avg_cos).to_degrees();
            phase_deg.push(avg_phase as f32);

            // ── Arithmetic mean of coherence (from contributing traces) ─
            let avg_coh = (coherence_sum[bin] / n_contrib as f64).clamp(0.0, 1.0);
            coherence.push(avg_coh as f32);
        } else {
            // ── All traces blanked at this bin → no valid data ──────
            //
            // Output a defined "no data" marker. Using -150 dB for magnitude
            // (essentially silence) and 0.0 for coherence signals "untrusted".
            magnitude_db.push(-150.0);
            phase_deg.push(0.0);
            coherence.push(0.0);
        }
    }

    Ok(SpatialAverageResult {
        frequencies,
        magnitude_db,
        phase_deg,
        coherence,
        num_traces,
        contributing_traces: contributing,
        coherence_threshold,
    })
}

// ─── Convenience wrappers ───────────────────────────────────────────────

/// Computes spatial average with default config (coherence threshold = 0.2).
/// Convenience wrapper for the Tauri command layer.
pub fn compute_default(traces: &[StoredTrace]) -> Result<SpatialAverageResult, String> {
    compute(traces, None)
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trace(label: &str, mag_db: &[f32], phase: &[f32], coh: &[f32]) -> StoredTrace {
        StoredTrace {
            label: label.into(),
            frequencies: vec![100.0, 200.0, 400.0],
            magnitude_db: mag_db.to_vec(),
            phase_deg: phase.to_vec(),
            coherence: coh.to_vec(),
        }
    }

    #[test]
    fn test_single_trace_identity() {
        let trace = make_trace("Pos 1", &[-6.0, -12.0, -18.0], &[0.0, 90.0, -90.0], &[0.95, 0.90, 0.85]);
        let result = compute(&[trace], None).unwrap();

        assert_eq!(result.num_traces, 1);
        // Single trace should return approximately the same magnitude values
        for i in 0..3 {
            assert!(
                (result.magnitude_db[i] - [-6.0, -12.0, -18.0][i]).abs() < 0.1,
                "Bin {i}: expected ~{}, got {}",
                [-6.0, -12.0, -18.0][i],
                result.magnitude_db[i]
            );
        }
    }

    #[test]
    fn test_empty_traces_error() {
        let result = compute(&[], None);
        assert!(result.is_err());
    }

    #[test]
    fn test_coherence_blanking() {
        // Trace 1: good coherence everywhere
        let t1 = make_trace("Good", &[-6.0, -6.0, -6.0], &[0.0, 0.0, 0.0], &[0.9, 0.9, 0.9]);
        // Trace 2: bin 1 has terrible coherence (should be blanked)
        let t2 = make_trace("Bad@200", &[-60.0, -60.0, -6.0], &[0.0, 0.0, 0.0], &[0.9, 0.05, 0.9]);

        let config = SpatialAverageConfig {
            coherence_threshold: Some(0.2),
            use_coherence_weighting: Some(false), // binary mode for simpler testing
        };
        let result = compute(&[t1, t2], Some(&config)).unwrap();

        // Bin 0: both traces contribute → average of -6 and -60 dB (power domain)
        // Bin 1: only trace 1 contributes (trace 2 blanked) → should be ~-6 dB
        // Bin 2: both contribute → average of -6 and -6 → -6 dB
        assert!(
            result.magnitude_db[1] > -7.0 && result.magnitude_db[1] < -5.0,
            "Blanked bin should be ~-6 dB (from good trace only), got {}",
            result.magnitude_db[1]
        );
        assert_eq!(result.contributing_traces[1], 1, "Only 1 trace should contribute at bin 1");
        assert_eq!(result.contributing_traces[0], 2, "Both traces contribute at bin 0");
    }

    #[test]
    fn test_coherence_weighting() {
        // Two traces: one with high coherence, one with low coherence
        let t_good = make_trace("Good", &[0.0, 0.0, 0.0], &[0.0, 0.0, 0.0], &[0.9, 0.9, 0.9]);
        let t_weak = make_trace("Weak", &[-20.0, -20.0, -20.0], &[0.0, 0.0, 0.0], &[0.3, 0.3, 0.3]);

        let config = SpatialAverageConfig {
            coherence_threshold: Some(0.2),
            use_coherence_weighting: Some(true),
        };
        let result = compute(&[t_good, t_weak], Some(&config)).unwrap();

        // With weighting, the high-coherence trace (0 dB) should dominate
        // over the low-coherence trace (-20 dB). The average should be
        // closer to 0 dB than the unweighted midpoint.
        assert!(
            result.magnitude_db[0] > -5.0,
            "Coherence-weighted average should favour the high-coh trace, got {} dB",
            result.magnitude_db[0]
        );
    }

    #[test]
    fn test_all_blanked_bin() {
        // Both traces have terrible coherence at all bins
        let t1 = make_trace("Bad1", &[-6.0, -6.0, -6.0], &[0.0, 0.0, 0.0], &[0.1, 0.1, 0.1]);
        let t2 = make_trace("Bad2", &[-12.0, -12.0, -12.0], &[0.0, 0.0, 0.0], &[0.1, 0.1, 0.1]);

        let config = SpatialAverageConfig {
            coherence_threshold: Some(0.2),
            ..Default::default()
        };
        let result = compute(&[t1, t2], Some(&config)).unwrap();

        // All bins should be blanked → -150 dB marker
        for i in 0..3 {
            assert_eq!(result.magnitude_db[i], -150.0, "Blanked bin should be -150 dB");
            assert_eq!(result.coherence[i], 0.0, "Blanked bin coherence should be 0");
            assert_eq!(result.contributing_traces[i], 0, "No traces should contribute");
        }
    }

    #[test]
    fn test_phase_wraparound() {
        // Two traces with phases near ±180° — should average correctly
        let t1 = make_trace("A", &[-6.0, -6.0, -6.0], &[170.0, -170.0, 90.0], &[0.9, 0.9, 0.9]);
        let t2 = make_trace("B", &[-6.0, -6.0, -6.0], &[-170.0, 170.0, -90.0], &[0.9, 0.9, 0.9]);

        let result = compute(&[t1, t2], None).unwrap();

        // Bins 0 and 1: phases near ±180° → circular mean should be ~±180°
        assert!(
            result.phase_deg[0].abs() > 170.0,
            "Phase near ±180° should average to ~±180°, got {}",
            result.phase_deg[0]
        );

        // Bin 2: +90° and -90° → circular mean should be ~0°
        assert!(
            result.phase_deg[2].abs() < 10.0,
            "Phase +90/-90 should average to ~0°, got {}",
            result.phase_deg[2]
        );
    }

    #[test]
    fn test_threshold_zero_disables_blanking() {
        let t1 = make_trace("T1", &[-6.0, -6.0, -6.0], &[0.0, 0.0, 0.0], &[0.05, 0.05, 0.05]);

        let config = SpatialAverageConfig {
            coherence_threshold: Some(0.0), // disable blanking
            use_coherence_weighting: Some(false),
        };
        let result = compute(&[t1], Some(&config)).unwrap();

        // With threshold = 0, even very low coherence is accepted
        for i in 0..3 {
            assert_eq!(result.contributing_traces[i], 1, "Should contribute with threshold=0");
        }
    }

    #[test]
    fn test_mismatched_bins_error() {
        let t1 = StoredTrace {
            label: "OK".into(),
            frequencies: vec![100.0, 200.0],
            magnitude_db: vec![-6.0, -12.0],
            phase_deg: vec![0.0, 0.0],
            coherence: vec![0.9, 0.9],
        };
        let t2 = StoredTrace {
            label: "Bad".into(),
            frequencies: vec![100.0, 200.0, 400.0],
            magnitude_db: vec![-6.0, -12.0, -18.0],
            phase_deg: vec![0.0, 0.0, 0.0],
            coherence: vec![0.9, 0.9, 0.9],
        };
        let result = compute(&[t1, t2], None);
        assert!(result.is_err(), "Should reject traces with different bin counts");
    }
}
