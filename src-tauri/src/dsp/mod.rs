pub mod fft;
pub mod windowing;

/// Standard FFT block size for real-time analysis.
/// 4096 samples @ 48kHz ≈ 85ms window → ~11.7 Hz bin resolution.
pub const DEFAULT_FFT_SIZE: usize = 4096;

/// Supported DSP processing modes — each future module plugs in here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DspMode {
    /// Dual-channel FFT transfer function (H1 estimator)
    TransferFunction,
    /// Real-Time Analyzer (fractional octave)
    Rta,
    /// Spectrogram / Waterfall
    Spectrogram,
    /// Delay finder
    DelayFinder,
    /// Impulse Response (log sweep / MLS)
    ImpulseResponse,
    /// SPL Meter (A/C/Z weighting)
    SplMeter,
    /// Signal generator output
    SignalGenerator,
    /// Impedance measurement
    Impedance,
}
