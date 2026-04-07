//! Spatial Average — power-averages multiple stored measurement traces.
//!
//! When measuring a room, multiple microphone positions are captured.
//! This module computes the energy (power) average across all positions,
//! giving a spatially representative measurement of the room response.

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

/// Result of spatial averaging.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialAverageResult {
    /// Frequency bins (Hz)
    pub frequencies: Vec<f32>,
    /// Power-averaged magnitude (dB)
    pub magnitude_db: Vec<f32>,
    /// Circular-averaged phase (degrees)
    pub phase_deg: Vec<f32>,
    /// Averaged coherence
    pub coherence: Vec<f32>,
    /// Number of traces averaged
    pub num_traces: usize,
}

// ─── Computation ────────────────────────────────────────────────────────

/// Computes the power average of multiple measurement traces.
///
/// Power averaging: convert dB → linear power, average, convert back to dB.
/// This preserves the energy content and avoids cancellation artifacts
/// that occur with direct dB averaging.
///
/// Phase averaging: uses circular mean (atan2 of averaged sin/cos)
/// to handle the ±180° wraparound correctly.
pub fn compute(traces: &[StoredTrace]) -> Result<SpatialAverageResult, String> {
    if traces.is_empty() {
        return Err("No traces to average".into());
    }

    let num_traces = traces.len();
    let num_bins = traces[0].frequencies.len();

    // Validate all traces have the same length
    for (i, trace) in traces.iter().enumerate() {
        if trace.frequencies.len() != num_bins {
            return Err(format!(
                "Trace '{}' has {} bins, expected {} (from first trace)",
                trace.label,
                trace.frequencies.len(),
                num_bins
            ));
        }
    }

    let frequencies = traces[0].frequencies.clone();
    let mut power_sum = vec![0.0f64; num_bins];
    let mut sin_sum = vec![0.0f64; num_bins];
    let mut cos_sum = vec![0.0f64; num_bins];
    let mut coherence_sum = vec![0.0f64; num_bins];

    for trace in traces {
        for i in 0..num_bins {
            // dB → linear power: P = 10^(dB/10)
            let db = trace.magnitude_db[i] as f64;
            power_sum[i] += 10.0f64.powf(db / 10.0);

            // Circular phase components
            let phase_rad = (trace.phase_deg[i] as f64).to_radians();
            sin_sum[i] += phase_rad.sin();
            cos_sum[i] += phase_rad.cos();

            // Coherence: simple arithmetic average
            coherence_sum[i] += trace.coherence[i] as f64;
        }
    }

    let n = num_traces as f64;
    let mut magnitude_db = Vec::with_capacity(num_bins);
    let mut phase_deg = Vec::with_capacity(num_bins);
    let mut coherence = Vec::with_capacity(num_bins);

    for i in 0..num_bins {
        // Power average → dB
        let avg_power = power_sum[i] / n;
        let db = 10.0 * avg_power.max(1e-20).log10();
        magnitude_db.push(db as f32);

        // Circular mean of phase
        let avg_sin = sin_sum[i] / n;
        let avg_cos = cos_sum[i] / n;
        let avg_phase = avg_sin.atan2(avg_cos).to_degrees();
        phase_deg.push(avg_phase as f32);

        // Coherence average
        let avg_coh = (coherence_sum[i] / n).clamp(0.0, 1.0);
        coherence.push(avg_coh as f32);
    }

    Ok(SpatialAverageResult {
        frequencies,
        magnitude_db,
        phase_deg,
        coherence,
        num_traces,
    })
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_trace_identity() {
        let trace = StoredTrace {
            label: "Pos 1".into(),
            frequencies: vec![100.0, 200.0, 400.0],
            magnitude_db: vec![-6.0, -12.0, -18.0],
            phase_deg: vec![0.0, 90.0, -90.0],
            coherence: vec![0.95, 0.90, 0.85],
        };
        let result = compute(&[trace]).unwrap();
        assert_eq!(result.num_traces, 1);
        // Single trace should return approximately the same values
        for i in 0..3 {
            assert!((result.magnitude_db[i] - [-6.0, -12.0, -18.0][i]).abs() < 0.1);
        }
    }

    #[test]
    fn test_empty_traces_error() {
        let result = compute(&[]);
        assert!(result.is_err());
    }
}
