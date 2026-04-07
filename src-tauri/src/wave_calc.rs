//! Wave Calculator — speed of sound, wavelength, delay, and period.
//!
//! A quick-reference tool for live sound engineers to compute
//! acoustic properties from frequency, distance, and temperature.

use serde::{Deserialize, Serialize};

// ─── Types ──────────────────────────────────────────────────────────────

/// Input parameters for wave calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveCalcRequest {
    /// Frequency in Hz
    pub frequency_hz: f64,
    /// Distance in metres
    pub distance_m: f64,
    /// Air temperature in °C
    pub temperature_c: f64,
}

/// Result of wave calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveCalcResult {
    /// Speed of sound in m/s
    pub speed_of_sound: f64,
    /// Wavelength in metres
    pub wavelength_m: f64,
    /// Wavelength in feet
    pub wavelength_ft: f64,
    /// Propagation delay in milliseconds
    pub delay_ms: f64,
    /// Delay in samples at 48 kHz
    pub delay_samples_48k: f64,
    /// Delay in samples at 96 kHz
    pub delay_samples_96k: f64,
    /// Number of complete wave cycles in the given distance
    pub cycles_in_distance: f64,
}

// ─── Computation ────────────────────────────────────────────────────────

/// Computes wave properties from frequency, distance, and temperature.
pub fn compute(req: &WaveCalcRequest) -> WaveCalcResult {
    let c = speed_of_sound(req.temperature_c);
    let freq = req.frequency_hz.max(0.001); // avoid division by zero

    let wavelength_m = c / freq;
    let wavelength_ft = wavelength_m * 3.28084;

    let delay_ms = if c > 0.0 {
        (req.distance_m / c) * 1000.0
    } else {
        0.0
    };

    let delay_samples_48k = delay_ms * 48.0;
    let delay_samples_96k = delay_ms * 96.0;

    let cycles_in_distance = if wavelength_m > 0.0 {
        req.distance_m / wavelength_m
    } else {
        0.0
    };

    WaveCalcResult {
        speed_of_sound: round2(c),
        wavelength_m: round4(wavelength_m),
        wavelength_ft: round4(wavelength_ft),
        delay_ms: round4(delay_ms),
        delay_samples_48k: round2(delay_samples_48k),
        delay_samples_96k: round2(delay_samples_96k),
        cycles_in_distance: round4(cycles_in_distance),
    }
}

/// Computes distance from propagation delay.
#[allow(dead_code)]
pub fn distance_from_delay(delay_ms: f64, temp_celsius: f64) -> f64 {
    let c = speed_of_sound(temp_celsius);
    c * delay_ms / 1000.0
}

// ─── Helpers ────────────────────────────────────────────────────────────

/// Speed of sound in air: c = 331.3 + 0.606 × T(°C)
fn speed_of_sound(temp_c: f64) -> f64 {
    331.3 + 0.606 * temp_c
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn round4(v: f64) -> f64 {
    (v * 10000.0).round() / 10000.0
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_1khz_at_20c() {
        let req = WaveCalcRequest {
            frequency_hz: 1000.0,
            distance_m: 10.0,
            temperature_c: 20.0,
        };
        let r = compute(&req);
        // c = 331.3 + 12.12 = 343.42 m/s
        assert!((r.speed_of_sound - 343.42).abs() < 0.1);
        // λ = 343.42 / 1000 = 0.3434 m
        assert!((r.wavelength_m - 0.3434).abs() < 0.01);
        // delay = 10 / 343.42 * 1000 = 29.12 ms
        assert!((r.delay_ms - 29.12).abs() < 0.5);
        // cycles = 10 / 0.3434 ≈ 29.12
        assert!((r.cycles_in_distance - 29.12).abs() < 0.5);
    }

    #[test]
    fn test_distance_from_delay() {
        let d = distance_from_delay(29.12, 20.0);
        assert!((d - 10.0).abs() < 0.1);
    }
}
