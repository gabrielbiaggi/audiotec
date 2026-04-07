//! Room Modes Calculator — computes modal frequencies for rectangular rooms.
//!
//! Implements the Rayleigh equation for standing waves in a rectangular
//! enclosure, computing axial, tangential, and oblique modes up to a
//! specified maximum frequency and order.

use serde::{Deserialize, Serialize};

// ─── Request / Response ─────────────────────────────────────────────────

/// Input parameters for room mode calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomModesRequest {
    /// Room length in metres
    pub length: f64,
    /// Room width in metres
    pub width: f64,
    /// Room height in metres
    pub height: f64,
    /// Air temperature in °C (affects speed of sound)
    pub temperature_c: f64,
    /// Only compute modes below this frequency (Hz)
    pub max_frequency: f64,
    /// Maximum mode order to search (e.g. 4 → nx,ny,nz ∈ 0..=4)
    pub max_order: u32,
}

/// A single room mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomMode {
    /// Mode frequency in Hz
    pub frequency: f64,
    /// Mode order along length axis
    pub nx: u32,
    /// Mode order along width axis
    pub ny: u32,
    /// Mode order along height axis
    pub nz: u32,
    /// Classification: axial, tangential, or oblique
    pub mode_type: ModeType,
    /// Wavelength in metres
    pub wavelength_m: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModeType {
    Axial,
    Tangential,
    Oblique,
}

/// Result of room mode calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomModesResult {
    /// All computed modes, sorted by frequency
    pub modes: Vec<RoomMode>,
    /// Speed of sound used (m/s)
    pub speed_of_sound: f64,
    /// Schroeder frequency — above this, the room behaves statistically
    pub schroeder_frequency: f64,
    /// Room volume in m³
    pub volume: f64,
    /// Bolt ratio [L/H, W/H] — ideally near [1.9, 1.4] for even distribution
    pub bolt_ratio: Vec<f64>,
}

// ─── Computation ────────────────────────────────────────────────────────

/// Computes room modes using the Rayleigh equation.
///
/// f(nx,ny,nz) = (c/2) × √[(nx/L)² + (ny/W)² + (nz/H)²]
///
/// Mode types:
/// - Axial: only one index > 0
/// - Tangential: exactly two indices > 0
/// - Oblique: all three indices > 0
pub fn compute(req: &RoomModesRequest) -> RoomModesResult {
    let c = speed_of_sound(req.temperature_c);
    let l = req.length;
    let w = req.width;
    let h = req.height;
    let volume = l * w * h;

    let mut modes = Vec::new();

    for nx in 0..=req.max_order {
        for ny in 0..=req.max_order {
            for nz in 0..=req.max_order {
                // Skip the (0,0,0) degenerate mode
                if nx == 0 && ny == 0 && nz == 0 {
                    continue;
                }

                let fx = nx as f64 / l;
                let fy = ny as f64 / w;
                let fz = nz as f64 / h;

                let freq = (c / 2.0) * (fx * fx + fy * fy + fz * fz).sqrt();

                if freq > req.max_frequency {
                    continue;
                }

                let non_zero = (nx > 0) as u8 + (ny > 0) as u8 + (nz > 0) as u8;
                let mode_type = match non_zero {
                    1 => ModeType::Axial,
                    2 => ModeType::Tangential,
                    _ => ModeType::Oblique,
                };

                let wavelength_m = if freq > 0.0 { c / freq } else { 0.0 };

                modes.push(RoomMode {
                    frequency: (freq * 100.0).round() / 100.0,
                    nx,
                    ny,
                    nz,
                    mode_type,
                    wavelength_m: (wavelength_m * 1000.0).round() / 1000.0,
                });
            }
        }
    }

    // Sort by frequency ascending
    modes.sort_by(|a, b| a.frequency.partial_cmp(&b.frequency).unwrap());

    // Schroeder frequency: Fs = 2000 × √(RT60 / V)
    // Estimate RT60 ≈ 0.5s for a moderately treated room
    let rt60_estimate = 0.5;
    let schroeder = 2000.0 * (rt60_estimate / volume).sqrt();

    // Bolt ratio: [L/H, W/H]
    let bolt_ratio = vec![
        (l / h * 100.0).round() / 100.0,
        (w / h * 100.0).round() / 100.0,
    ];

    RoomModesResult {
        modes,
        speed_of_sound: (c * 100.0).round() / 100.0,
        schroeder_frequency: (schroeder * 100.0).round() / 100.0,
        volume: (volume * 100.0).round() / 100.0,
        bolt_ratio,
    }
}

/// Speed of sound in air as a function of temperature.
///
/// c = 331.3 + 0.606 × T(°C)  (simplified linear model, accurate ≤ 0.2%)
fn speed_of_sound(temp_c: f64) -> f64 {
    331.3 + 0.606 * temp_c
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speed_of_sound() {
        let c = speed_of_sound(20.0);
        assert!((c - 343.42).abs() < 0.1, "Expected ~343.4, got {c}");
    }

    #[test]
    fn test_first_axial_mode() {
        let req = RoomModesRequest {
            length: 10.0,
            width: 6.0,
            height: 3.0,
            temperature_c: 20.0,
            max_frequency: 500.0,
            max_order: 4,
        };
        let result = compute(&req);
        // First axial mode along height (shortest dimension):
        // f = c / (2 * H) = 343.4 / 6 ≈ 57.2 Hz
        let first = &result.modes[0];
        assert!(
            first.frequency < 60.0,
            "First mode should be ~57 Hz, got {}",
            first.frequency
        );
    }
}
