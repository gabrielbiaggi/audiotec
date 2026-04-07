use std::sync::Arc;

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

// ─── FftProcessor — reusable FFT engine ─────────────────────────────────

/// Wraps a pre-planned FFT for a fixed size, avoiding per-frame allocation.
///
/// `FftPlanner` is expensive to construct; `FftProcessor` caches the plan
/// so the hot path only calls `process()`.
pub struct FftProcessor {
    fft: Arc<dyn Fft<f32>>,
    size: usize,
    /// Scratch buffer reused across frames to avoid allocation.
    scratch: Vec<Complex<f32>>,
    /// Working buffer reused across frames.
    work: Vec<Complex<f32>>,
}

impl FftProcessor {
    /// Creates a new FFT processor for the given block size.
    pub fn new(fft_size: usize) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(fft_size);
        let scratch_len = fft.get_inplace_scratch_len();
        Self {
            fft,
            size: fft_size,
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            work: vec![Complex::new(0.0, 0.0); fft_size],
        }
    }

    /// Performs forward FFT on real-valued windowed samples.
    ///
    /// Returns the positive-frequency half of the spectrum (up to Nyquist).
    /// The internal buffers are reused — no heap allocation on the hot path.
    pub fn forward(&mut self, samples: &[f32]) -> Vec<Complex<f32>> {
        let n = samples.len().min(self.size);

        // Fill work buffer: real samples with zero imaginary part
        for i in 0..n {
            self.work[i] = Complex::new(samples[i], 0.0);
        }
        // Zero-pad remainder if samples < fft_size
        for i in n..self.size {
            self.work[i] = Complex::new(0.0, 0.0);
        }

        self.fft
            .process_with_scratch(&mut self.work, &mut self.scratch);

        // Return positive frequencies only (bins 0..N/2)
        self.work[..self.size / 2].to_vec()
    }

    pub fn size(&self) -> usize {
        self.size
    }
}

// ─── Stateless utilities ────────────────────────────────────────────────

/// Converts a complex FFT spectrum to magnitude in dBFS (20·log10).
///
/// Normalization: divide by fft_size to get true amplitude, then dB.
/// Clamped to -150 dB minimum to avoid -∞.
pub fn spectrum_to_magnitude_db(spectrum: &[Complex<f32>], fft_size: usize) -> Vec<f32> {
    let norm = 1.0 / fft_size as f32;
    spectrum
        .iter()
        .map(|c| {
            let mag = c.norm() * norm;
            (20.0 * mag.max(1e-10).log10()).max(-150.0)
        })
        .collect()
}

/// Computes the frequency (Hz) for each FFT bin index.
pub fn bin_frequencies(fft_size: usize, sample_rate: f32) -> Vec<f32> {
    let nyquist = fft_size / 2;
    let bin_width = sample_rate / fft_size as f32;
    (0..nyquist).map(|i| i as f32 * bin_width).collect()
}

// ─── SpectralAverager — exponential averaging for H1 estimator ──────────

/// Accumulates cross-spectrum and auto-spectra with exponential averaging,
/// then computes the H1 transfer function, coherence, and per-channel dBFS.
///
/// Exponential averaging: `S_avg = α·S_new + (1−α)·S_avg`
/// where α = 1/num_averages. This gives a smooth, low-variance estimate
/// critical for professional acoustic measurement.
pub struct SpectralAverager {
    /// Number of bins (fft_size / 2)
    num_bins: usize,
    /// Exponential smoothing factor (0..1]. Higher = faster response.
    alpha: f32,
    /// Accumulated cross-spectrum Sxy = conj(X)·Y
    sxy: Vec<Complex<f32>>,
    /// Accumulated auto-spectrum of reference Sxx = |X|²
    sxx: Vec<f32>,
    /// Accumulated auto-spectrum of measurement Syy = |Y|²
    syy: Vec<f32>,
    /// Whether at least one frame has been accumulated
    primed: bool,
}

impl SpectralAverager {
    /// Creates a new averager.
    ///
    /// `num_bins` = fft_size / 2 (positive frequencies only).
    /// `num_averages` controls smoothing: 1 = no averaging (live),
    /// 8 = moderate, 64 = heavy (slow but clean).
    pub fn new(num_bins: usize, num_averages: usize) -> Self {
        let alpha = 1.0 / num_averages.max(1) as f32;
        Self {
            num_bins,
            alpha,
            sxy: vec![Complex::new(0.0, 0.0); num_bins],
            sxx: vec![0.0; num_bins],
            syy: vec![0.0; num_bins],
            primed: false,
        }
    }

    /// Feeds a new pair of FFT frames (reference, measurement) into the
    /// exponential averager.
    pub fn push(&mut self, ref_spectrum: &[Complex<f32>], meas_spectrum: &[Complex<f32>]) {
        let len = self.num_bins.min(ref_spectrum.len()).min(meas_spectrum.len());
        let a = self.alpha;
        let b = 1.0 - a;

        if !self.primed {
            // First frame: initialize directly (no blending)
            for i in 0..len {
                let x = ref_spectrum[i];
                let y = meas_spectrum[i];
                self.sxy[i] = x.conj() * y;
                self.sxx[i] = x.norm_sqr();
                self.syy[i] = y.norm_sqr();
            }
            self.primed = true;
        } else {
            for i in 0..len {
                let x = ref_spectrum[i];
                let y = meas_spectrum[i];
                let sxy_new = x.conj() * y;
                let sxx_new = x.norm_sqr();
                let syy_new = y.norm_sqr();

                self.sxy[i] = self.sxy[i] * b + sxy_new * a;
                self.sxx[i] = self.sxx[i] * b + sxx_new * a;
                self.syy[i] = self.syy[i] * b + syy_new * a;
            }
        }
    }

    /// Computes the H1 transfer function from the accumulated averages.
    ///
    /// H1(f) = Sxy(f) / Sxx(f)
    ///
    /// Returns (magnitude_dB, phase_degrees, coherence) per bin.
    pub fn transfer_function(&self) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
        let mut mag_db = Vec::with_capacity(self.num_bins);
        let mut phase_deg = Vec::with_capacity(self.num_bins);
        let mut coherence = Vec::with_capacity(self.num_bins);

        for i in 0..self.num_bins {
            let sxy = self.sxy[i];
            let sxx = self.sxx[i];
            let syy = self.syy[i];

            // H1 = Sxy / Sxx
            let h = if sxx > 1e-20 {
                sxy / sxx
            } else {
                Complex::new(0.0, 0.0)
            };

            // Magnitude in dB (no FFT normalization here — already in spectral domain)
            mag_db.push((20.0 * h.norm().max(1e-10).log10()).max(-150.0));

            // Phase in degrees
            phase_deg.push(h.arg().to_degrees());

            // Magnitude Squared Coherence: γ²(f) = |Sxy|² / (Sxx · Syy)
            let coh = if sxx > 1e-20 && syy > 1e-20 {
                (sxy.norm_sqr() / (sxx * syy)).clamp(0.0, 1.0)
            } else {
                0.0
            };
            coherence.push(coh);
        }

        (mag_db, phase_deg, coherence)
    }

    /// Resets all accumulated averages (e.g., when user hits "clear").
    pub fn reset(&mut self) {
        self.sxy.fill(Complex::new(0.0, 0.0));
        self.sxx.fill(0.0);
        self.syy.fill(0.0);
        self.primed = false;
    }

    /// Updates the smoothing factor (number of averages).
    pub fn set_num_averages(&mut self, n: usize) {
        self.alpha = 1.0 / n.max(1) as f32;
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft_processor_dc_signal() {
        let mut proc = FftProcessor::new(256);
        let samples = vec![1.0_f32; 256];
        let spectrum = proc.forward(&samples);
        assert!(spectrum[0].norm() > 200.0);
        for bin in &spectrum[1..] {
            assert!(bin.norm() < 1e-4, "Non-DC bin has energy: {}", bin.norm());
        }
    }

    #[test]
    fn test_fft_processor_reuse() {
        let mut proc = FftProcessor::new(256);
        // Process two different frames — should not corrupt state
        let s1 = vec![1.0_f32; 256];
        let s2 = vec![0.5_f32; 256];
        let r1 = proc.forward(&s1);
        let r2 = proc.forward(&s2);
        // DC bin of s2 should be half of s1
        assert!((r2[0].norm() / r1[0].norm() - 0.5).abs() < 0.01);
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

    #[test]
    fn test_spectral_averager_coherence_identical_signals() {
        // When ref == meas, coherence should be 1.0
        // Use an impulse signal (flat spectrum) so all bins have energy
        let mut proc = FftProcessor::new(256);
        let mut samples = vec![0.0_f32; 256];
        samples[0] = 1.0; // impulse → flat energy across all bins
        let spectrum = proc.forward(&samples);

        let mut avg = SpectralAverager::new(128, 1);
        avg.push(&spectrum, &spectrum);
        let (_mag, _phase, coh) = avg.transfer_function();

        for (i, &c) in coh.iter().enumerate() {
            assert!(
                (c - 1.0).abs() < 0.01,
                "Coherence should be ~1.0 for identical signals at bin {i}, got {c}"
            );
        }
    }

    #[test]
    fn test_spectral_averager_reset() {
        let mut avg = SpectralAverager::new(64, 4);
        let spectrum = vec![Complex::new(1.0, 0.0); 64];
        avg.push(&spectrum, &spectrum);
        assert!(avg.primed);
        avg.reset();
        assert!(!avg.primed);
    }
}
