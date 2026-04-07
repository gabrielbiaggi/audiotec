use std::f32::consts::PI;

/// Supported window functions for spectral analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum WindowType {
    /// Rectangular (no windowing)
    Rectangular,
    /// Hann (raised cosine) — good general-purpose, low spectral leakage
    Hann,
    /// Hamming — slightly better side-lobe attenuation than Hann
    Hamming,
    /// Blackman-Harris 4-term — excellent side-lobe suppression
    BlackmanHarris,
    /// Flat-top — best amplitude accuracy, poor frequency resolution
    FlatTop,
}

/// Pre-computes a window function lookup table of `size` samples.
///
/// This avoids recalculating trig per-frame in the real-time path.
pub fn generate_window(window_type: WindowType, size: usize) -> Vec<f32> {
    match window_type {
        WindowType::Rectangular => vec![1.0; size],
        WindowType::Hann => hann(size),
        WindowType::Hamming => hamming(size),
        WindowType::BlackmanHarris => blackman_harris(size),
        WindowType::FlatTop => flat_top(size),
    }
}

/// Applies a pre-computed window to a sample buffer in-place.
///
/// `samples` and `window` must have the same length.
#[inline]
pub fn apply_window(samples: &mut [f32], window: &[f32]) {
    debug_assert_eq!(
        samples.len(),
        window.len(),
        "Window size mismatch: samples={} window={}",
        samples.len(),
        window.len()
    );
    for (s, w) in samples.iter_mut().zip(window.iter()) {
        *s *= *w;
    }
}

/// Computes the coherent gain of a window (sum of coefficients / N).
/// Used to normalize amplitude after windowing.
pub fn coherent_gain(window: &[f32]) -> f32 {
    let sum: f32 = window.iter().sum();
    sum / window.len() as f32
}

// ─── Window implementations ────────────────────────────────────────────

fn hann(size: usize) -> Vec<f32> {
    (0..size)
        .map(|n| {
            let x = 2.0 * PI * n as f32 / (size - 1) as f32;
            0.5 * (1.0 - x.cos())
        })
        .collect()
}

fn hamming(size: usize) -> Vec<f32> {
    (0..size)
        .map(|n| {
            let x = 2.0 * PI * n as f32 / (size - 1) as f32;
            0.54 - 0.46 * x.cos()
        })
        .collect()
}

fn blackman_harris(size: usize) -> Vec<f32> {
    let a0 = 0.35875;
    let a1 = 0.48829;
    let a2 = 0.14128;
    let a3 = 0.01168;
    (0..size)
        .map(|n| {
            let t = 2.0 * PI * n as f32 / (size - 1) as f32;
            a0 - a1 * t.cos() + a2 * (2.0 * t).cos() - a3 * (3.0 * t).cos()
        })
        .collect()
}

fn flat_top(size: usize) -> Vec<f32> {
    let a0 = 0.21557895;
    let a1 = 0.41663158;
    let a2 = 0.277263158;
    let a3 = 0.083578947;
    let a4 = 0.006947368;
    (0..size)
        .map(|n| {
            let t = 2.0 * PI * n as f32 / (size - 1) as f32;
            a0 - a1 * t.cos() + a2 * (2.0 * t).cos() - a3 * (3.0 * t).cos()
                + a4 * (4.0 * t).cos()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hann_endpoints_zero() {
        let w = generate_window(WindowType::Hann, 1024);
        assert!(w[0].abs() < 1e-6);
        assert!(w[1023].abs() < 1e-6);
    }

    #[test]
    fn test_hann_midpoint_one() {
        let w = generate_window(WindowType::Hann, 1024);
        assert!((w[512] - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_rectangular_all_ones() {
        let w = generate_window(WindowType::Rectangular, 256);
        assert!(w.iter().all(|&v| (v - 1.0).abs() < 1e-6));
    }

    #[test]
    fn test_coherent_gain_rectangular() {
        let w = generate_window(WindowType::Rectangular, 256);
        assert!((coherent_gain(&w) - 1.0).abs() < 1e-6);
    }
}
