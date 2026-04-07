//! Real-Time Analyser — Fractional Octave Band spectrum.
//!
//! Converts a linear FFT spectrum into fractional-octave bands (1/1, 1/3,
//! 1/6, 1/12, 1/24, 1/48) following IEC 61260 / ANSI S1.11.
//!
//! For each band, the energy of all FFT bins whose centre frequency falls
//! within the band edges is summed. The result is a vector of band levels
//! in dBFS.
//!
//! Centre frequencies follow the preferred ISO 266 series:
//!   fc = 1000 · 2^(k/N)   where N = fraction, k = band index
//!
//! Band edges:
//!   f_lo = fc · 2^(-1/(2·N))
//!   f_hi = fc · 2^(+1/(2·N))

use serde::{Deserialize, Serialize};

// ─── Public types ───────────────────────────────────────────────────────

/// Fractional octave resolution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OctaveFraction {
    /// Full octave (1/1).
    Octave1,
    /// Third-octave (1/3) — most common for room analysis.
    Octave3,
    /// Sixth-octave (1/6).
    Octave6,
    /// Twelfth-octave (1/12).
    Octave12,
    /// Twenty-fourth-octave (1/24).
    Octave24,
    /// Forty-eighth-octave (1/48) — highest resolution.
    Octave48,
}

impl OctaveFraction {
    /// Returns the denominator of the fraction (1, 3, 6, 12, 24, 48).
    pub fn denominator(self) -> u32 {
        match self {
            OctaveFraction::Octave1 => 1,
            OctaveFraction::Octave3 => 3,
            OctaveFraction::Octave6 => 6,
            OctaveFraction::Octave12 => 12,
            OctaveFraction::Octave24 => 24,
            OctaveFraction::Octave48 => 48,
        }
    }
}

/// A single octave band with centre frequency and level.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OctaveBand {
    /// Centre frequency in Hz.
    pub center_hz: f64,
    /// Lower edge frequency in Hz.
    pub low_hz: f64,
    /// Upper edge frequency in Hz.
    pub high_hz: f64,
    /// Band level in dBFS.
    pub level_db: f32,
}

/// Configuration for the RTA.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RtaConfig {
    /// Octave fraction (1/1, 1/3, etc.).
    pub fraction: OctaveFraction,
    /// Minimum frequency to include (Hz). Default: 20.
    pub min_freq: Option<f64>,
    /// Maximum frequency to include (Hz). Default: 20000.
    pub max_freq: Option<f64>,
    /// Apply A-weighting correction to each band. Default: false.
    pub a_weighted: Option<bool>,
}

impl Default for RtaConfig {
    fn default() -> Self {
        Self {
            fraction: OctaveFraction::Octave3,
            min_freq: Some(20.0),
            max_freq: Some(20000.0),
            a_weighted: Some(false),
        }
    }
}

// ─── Band computation ───────────────────────────────────────────────────

/// Generates centre frequencies for the given fractional octave resolution
/// between `min_freq` and `max_freq`.
pub fn generate_band_centres(fraction: OctaveFraction, min_freq: f64, max_freq: f64) -> Vec<f64> {
    let n = fraction.denominator() as f64;
    let mut centres = Vec::new();

    // ISO 266: fc = 1000 * 2^(k/N)
    // Find k range
    let k_min = (n * (min_freq / 1000.0).log2()).floor() as i32 - 1;
    let k_max = (n * (max_freq / 1000.0).log2()).ceil() as i32 + 1;

    for k in k_min..=k_max {
        let fc = 1000.0 * 2.0_f64.powf(k as f64 / n);
        if fc >= min_freq * 0.95 && fc <= max_freq * 1.05 {
            centres.push(fc);
        }
    }

    centres
}

/// Computes band edges (low, centre, high) for all bands.
pub fn compute_bands(fraction: OctaveFraction, min_freq: f64, max_freq: f64) -> Vec<(f64, f64, f64)> {
    let n = fraction.denominator() as f64;
    let centres = generate_band_centres(fraction, min_freq, max_freq);

    centres
        .into_iter()
        .map(|fc| {
            let f_lo = fc * 2.0_f64.powf(-1.0 / (2.0 * n));
            let f_hi = fc * 2.0_f64.powf(1.0 / (2.0 * n));
            (f_lo, fc, f_hi)
        })
        .collect()
}

/// Converts a linear FFT magnitude spectrum (positive frequencies, in
/// linear amplitude) into fractional-octave band levels (dBFS).
///
/// # Arguments
/// * `magnitude` — One-sided magnitude spectrum (linear). Length = fft_size/2 + 1.
/// * `sample_rate` — The sample rate used for the FFT.
/// * `config` — RTA configuration.
///
/// Returns a vector of `OctaveBand` with levels in dBFS.
pub fn spectrum_to_octave_bands(
    magnitude: &[f32],
    sample_rate: f64,
    config: &RtaConfig,
) -> Vec<OctaveBand> {
    let n_bins = magnitude.len();
    let bin_width = sample_rate / ((n_bins - 1) as f64 * 2.0);
    let min_freq = config.min_freq.unwrap_or(20.0);
    let max_freq = config.max_freq.unwrap_or(20000.0);
    let a_weighted = config.a_weighted.unwrap_or(false);

    let bands = compute_bands(config.fraction, min_freq, max_freq);

    bands
        .into_iter()
        .map(|(f_lo, fc, f_hi)| {
            // Find bin range for this band
            let bin_lo = ((f_lo / bin_width).ceil() as usize).max(1);
            let bin_hi = ((f_hi / bin_width).floor() as usize).min(n_bins - 1);

            // Sum energy (power = magnitude²)
            let mut power_sum = 0.0_f64;
            let mut count = 0;

            for bin in bin_lo..=bin_hi {
                let mag = magnitude[bin] as f64;
                power_sum += mag * mag;
                count += 1;
            }

            // Convert to dBFS
            let mut level_db = if count > 0 && power_sum > 1e-20 {
                (10.0 * power_sum.log10()) as f32
            } else {
                -120.0
            };

            // Optional A-weighting correction
            if a_weighted {
                level_db += a_weight_correction(fc) as f32;
            }

            OctaveBand {
                center_hz: fc,
                low_hz: f_lo,
                high_hz: f_hi,
                level_db,
            }
        })
        .collect()
}

// ─── A-Weighting ────────────────────────────────────────────────────────

/// A-weighting correction in dB for a given frequency.
///
/// IEC 61672-1:2013 frequency weighting.
/// RA(f) = 12194² · f⁴ / ((f²+20.6²)(f²+12194²)·√((f²+107.7²)(f²+737.9²)))
pub fn a_weight_correction(freq: f64) -> f64 {
    let f2 = freq * freq;
    let num = 12194.0_f64.powi(2) * f2 * f2;
    let denom = (f2 + 20.6_f64.powi(2))
        * ((f2 + 107.7_f64.powi(2)) * (f2 + 737.9_f64.powi(2))).sqrt()
        * (f2 + 12194.0_f64.powi(2));

    if denom.abs() < 1e-20 {
        return -120.0;
    }

    let ra = num / denom;
    // Normalize to 0 dB at 1 kHz
    let ra_1k = {
        let f2_1k = 1000.0_f64 * 1000.0;
        let num_1k = 12194.0_f64.powi(2) * f2_1k * f2_1k;
        let denom_1k = (f2_1k + 20.6_f64.powi(2))
            * ((f2_1k + 107.7_f64.powi(2)) * (f2_1k + 737.9_f64.powi(2))).sqrt()
            * (f2_1k + 12194.0_f64.powi(2));
        num_1k / denom_1k
    };

    20.0 * (ra / ra_1k).log10()
}

/// C-weighting correction in dB for a given frequency.
///
/// RC(f) = 12194² · f² / ((f²+20.6²)(f²+12194²))
pub fn c_weight_correction(freq: f64) -> f64 {
    let f2 = freq * freq;
    let num = 12194.0_f64.powi(2) * f2;
    let denom = (f2 + 20.6_f64.powi(2)) * (f2 + 12194.0_f64.powi(2));

    if denom.abs() < 1e-20 {
        return -120.0;
    }

    let rc = num / denom;
    // Normalize to 0 dB at 1 kHz
    let rc_1k = {
        let f2_1k = 1000.0_f64 * 1000.0;
        let num_1k = 12194.0_f64.powi(2) * f2_1k;
        let denom_1k = (f2_1k + 20.6_f64.powi(2)) * (f2_1k + 12194.0_f64.powi(2));
        num_1k / denom_1k
    };

    20.0 * (rc / rc_1k).log10()
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_band_centres_octave1() {
        let centres = generate_band_centres(OctaveFraction::Octave1, 20.0, 20000.0);
        // Should have ~10 bands (31.5, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k)
        assert!(centres.len() >= 9 && centres.len() <= 11, "got {} bands", centres.len());
        // 1 kHz should be present
        assert!(centres.iter().any(|&f| (f - 1000.0).abs() < 1.0));
    }

    #[test]
    fn test_band_centres_octave3() {
        let centres = generate_band_centres(OctaveFraction::Octave3, 20.0, 20000.0);
        // 1/3 octave → ~30 bands
        assert!(centres.len() >= 28 && centres.len() <= 33, "got {} bands", centres.len());
    }

    #[test]
    fn test_a_weight_1khz() {
        let correction = a_weight_correction(1000.0);
        assert!(
            correction.abs() < 0.1,
            "A-weight at 1kHz should be ~0 dB, got {correction}"
        );
    }

    #[test]
    fn test_a_weight_low_freq() {
        // A-weight at 50 Hz should be around -30 dB
        let correction = a_weight_correction(50.0);
        assert!(
            correction < -20.0 && correction > -40.0,
            "A-weight at 50Hz should be ~-30 dB, got {correction}"
        );
    }

    #[test]
    fn test_c_weight_1khz() {
        let correction = c_weight_correction(1000.0);
        assert!(
            correction.abs() < 0.1,
            "C-weight at 1kHz should be ~0 dB, got {correction}"
        );
    }

    #[test]
    fn test_spectrum_to_bands() {
        // Flat spectrum → all bands should have similar levels
        let n_bins = 2049; // fft_size = 4096
        let sr = 48000.0;
        let mag: Vec<f32> = vec![1.0; n_bins]; // flat spectrum

        let config = RtaConfig {
            fraction: OctaveFraction::Octave3,
            min_freq: Some(100.0),
            max_freq: Some(10000.0),
            a_weighted: Some(false),
        };

        let bands = spectrum_to_octave_bands(&mag, sr, &config);
        assert!(!bands.is_empty());

        // All bands from a flat spectrum should be within ~15 dB of each other
        // (wider bands accumulate more bins)
        let levels: Vec<f32> = bands.iter().map(|b| b.level_db).collect();
        let max_level = levels.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        let min_level = levels.iter().copied().fold(f32::INFINITY, f32::min);
        assert!(
            max_level - min_level < 20.0,
            "Level spread too wide: {min_level}..{max_level}"
        );
    }
}
