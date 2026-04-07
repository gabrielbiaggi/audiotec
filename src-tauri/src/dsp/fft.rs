use rustfft::{num_complex::Complex, FftPlanner};

/// Performs an in-place forward FFT on real-valued samples.
///
/// Accepts a slice of `f32` windowed samples, zero-pads or truncates to
/// `fft_size`, and returns the complex spectrum (first half — up to Nyquist).
pub fn forward_fft(samples: &[f32], fft_size: usize) -> Vec<Complex<f32>> {
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    // Build complex input from real samples (imaginary = 0)
    let mut buffer: Vec<Complex<f32>> = samples
        .iter()
        .take(fft_size)
        .map(|&s| Complex::new(s, 0.0))
        .collect();

    // Zero-pad if samples < fft_size
    buffer.resize(fft_size, Complex::new(0.0, 0.0));

    fft.process(&mut buffer);

    // Return only the first half (positive frequencies up to Nyquist)
    let nyquist = fft_size / 2;
    buffer.truncate(nyquist);
    buffer
}

/// Converts a complex FFT spectrum to magnitude in dB (20·log10).
///
/// The normalization factor divides by `fft_size` to get true amplitude,
/// then converts to dB relative to full-scale (0 dBFS).
/// Values are clamped to a minimum of -150 dB to avoid -∞.
pub fn spectrum_to_magnitude_db(spectrum: &[Complex<f32>], fft_size: usize) -> Vec<f32> {
    let norm = 1.0 / fft_size as f32;
    spectrum
        .iter()
        .map(|c| {
            let mag = c.norm() * norm;
            let db = 20.0 * mag.max(1e-10).log10();
            db.max(-150.0)
        })
        .collect()
}

/// Computes the frequency (Hz) for each FFT bin index.
pub fn bin_frequencies(fft_size: usize, sample_rate: f32) -> Vec<f32> {
    let nyquist = fft_size / 2;
    let bin_width = sample_rate / fft_size as f32;
    (0..nyquist).map(|i| i as f32 * bin_width).collect()
}

/// Computes magnitude and phase from a dual-channel FFT (H1 estimator).
///
/// H1(f) = Sxy(f) / Sxx(f)
/// where Sxy = cross-spectrum (conj(X) * Y) and Sxx = auto-spectrum of X.
///
/// Returns (magnitude_db, phase_degrees, coherence) per bin.
pub fn transfer_function_h1(
    reference: &[Complex<f32>],
    measurement: &[Complex<f32>],
    fft_size: usize,
) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
    let norm = 1.0 / fft_size as f32;
    let len = reference.len().min(measurement.len());

    let mut magnitude_db = Vec::with_capacity(len);
    let mut phase_deg = Vec::with_capacity(len);
    let mut coherence = Vec::with_capacity(len);

    for i in 0..len {
        let x = reference[i];
        let y = measurement[i];

        // Cross-spectrum: conj(X) * Y
        let sxy = x.conj() * y;
        // Auto-spectra
        let sxx = x.norm_sqr();
        let syy = y.norm_sqr();

        // H1 = Sxy / Sxx
        let h = if sxx > 1e-20 {
            sxy / sxx
        } else {
            Complex::new(0.0, 0.0)
        };

        // Magnitude in dB
        let mag = h.norm() * norm;
        magnitude_db.push((20.0 * mag.max(1e-10).log10()).max(-150.0));

        // Phase in degrees
        phase_deg.push(h.arg().to_degrees());

        // Coherence γ² = |Sxy|² / (Sxx · Syy)
        let coh = if sxx > 1e-20 && syy > 1e-20 {
            (sxy.norm_sqr() / (sxx * syy)).min(1.0)
        } else {
            0.0
        };
        coherence.push(coh);
    }

    (magnitude_db, phase_deg, coherence)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_forward_fft_dc_signal() {
        // A constant signal should produce energy only in bin 0
        let samples = vec![1.0_f32; 256];
        let spectrum = forward_fft(&samples, 256);
        assert!(spectrum[0].norm() > 200.0); // DC component
        // All other bins should be near zero
        for bin in &spectrum[1..] {
            assert!(bin.norm() < 1e-4, "Non-DC bin has energy: {}", bin.norm());
        }
    }

    #[test]
    fn test_magnitude_db_clamp() {
        let spectrum = vec![Complex::new(0.0, 0.0)];
        let db = spectrum_to_magnitude_db(&spectrum, 1024);
        assert_eq!(db[0], -150.0);
    }

    #[test]
    fn test_bin_frequencies() {
        let freqs = bin_frequencies(1024, 48000.0);
        assert_eq!(freqs.len(), 512);
        assert!((freqs[1] - 46.875).abs() < 0.01);
    }
}
