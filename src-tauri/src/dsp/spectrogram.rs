//! Spectrogram — Waterfall / Spectrograph data accumulator.
//!
//! Maintains a circular buffer of FFT frames for time-frequency
//! visualization on the frontend. Each frame stores magnitude data
//! in dBFS. The accumulation direction supports both waterfall
//! (newest at front) and spectrograph (newest at bottom) display modes.
//!
//! # Architecture
//! ```text
//! FFT frame (mag_dB) ──► Spectrogram push ──► Circular buffer
//!                                              ├── Frame 0 (oldest)
//!                                              ├── Frame 1
//!                                              ├── ...
//!                                              └── Frame N (newest)
//! ```
//!
//! The frontend reads `get_frames()` to obtain the entire time-frequency
//! matrix for rendering as a colour-map (e.g., viridis, magma).

use serde::{Deserialize, Serialize};

// ─── Public types ───────────────────────────────────────────────────────

/// Configuration for the spectrogram accumulator.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrogramConfig {
    /// Number of FFT bins per frame (positive-frequency half, fft_size/2 + 1).
    pub num_bins: usize,
    /// Maximum number of frames to keep in the circular buffer (time depth).
    pub max_frames: usize,
    /// Minimum dB value (floor). Values below this are clamped. Default: -120.
    pub min_db: Option<f32>,
    /// Maximum dB value (ceiling). Values above this are clamped. Default: 0.
    pub max_db: Option<f32>,
}

impl Default for SpectrogramConfig {
    fn default() -> Self {
        Self {
            num_bins: 2049, // FFT 4096 → 2049 positive bins
            max_frames: 200,
            min_db: Some(-120.0),
            max_db: Some(0.0),
        }
    }
}

/// A single spectrogram frame with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrogramFrame {
    /// Magnitude values in dBFS, one per frequency bin.
    pub magnitudes_db: Vec<f32>,
    /// Timestamp in seconds since the spectrogram was started.
    pub timestamp_secs: f64,
    /// Frame sequence number.
    pub frame_index: u64,
}

/// Serialisable snapshot of the entire spectrogram for IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrogramSnapshot {
    /// Frames ordered oldest → newest.
    pub frames: Vec<SpectrogramFrame>,
    /// Number of frequency bins per frame.
    pub num_bins: usize,
    /// Frequency resolution in Hz per bin.
    pub bin_width_hz: f64,
    /// Sample rate that produced these frames.
    pub sample_rate: f64,
    /// Total number of frames pushed (including discarded old ones).
    pub total_frames: u64,
}

// ─── Spectrogram engine ─────────────────────────────────────────────────

/// Circular-buffer spectrogram accumulator.
pub struct Spectrogram {
    config: SpectrogramConfig,
    frames: Vec<SpectrogramFrame>,
    head: usize,
    count: usize,
    total_frames: u64,
    sample_rate: f64,
    start_time: Option<std::time::Instant>,
}

impl Spectrogram {
    /// Creates a new spectrogram accumulator.
    pub fn new(config: SpectrogramConfig, sample_rate: f64) -> Self {
        let capacity = config.max_frames;
        Self {
            config,
            frames: Vec::with_capacity(capacity),
            head: 0,
            count: 0,
            total_frames: 0,
            sample_rate,
            start_time: None,
        }
    }

    /// Pushes a new magnitude spectrum (linear amplitude) into the buffer.
    ///
    /// Converts to dBFS and clamps. If the buffer is full, overwrites the
    /// oldest frame.
    pub fn push_magnitude(&mut self, magnitude: &[f32]) {
        let now = self.start_time.get_or_insert_with(std::time::Instant::now);
        let elapsed = now.elapsed().as_secs_f64();
        let min_db = self.config.min_db.unwrap_or(-120.0);
        let max_db = self.config.max_db.unwrap_or(0.0);

        // Convert linear magnitude → dBFS, then clamp
        let magnitudes_db: Vec<f32> = magnitude
            .iter()
            .take(self.config.num_bins)
            .map(|&m| {
                let db = if m > 1e-20 {
                    20.0 * m.log10()
                } else {
                    min_db
                };
                db.clamp(min_db, max_db)
            })
            .collect();

        let frame = SpectrogramFrame {
            magnitudes_db,
            timestamp_secs: elapsed,
            frame_index: self.total_frames,
        };

        if self.count < self.config.max_frames {
            // Buffer not yet full — append
            self.frames.push(frame);
            self.count += 1;
        } else {
            // Overwrite oldest
            self.frames[self.head] = frame;
        }

        self.head = (self.head + 1) % self.config.max_frames;
        self.total_frames += 1;
    }

    /// Pushes a pre-computed dBFS spectrum directly.
    pub fn push_db(&mut self, magnitudes_db: &[f32]) {
        let now = self.start_time.get_or_insert_with(std::time::Instant::now);
        let elapsed = now.elapsed().as_secs_f64();
        let min_db = self.config.min_db.unwrap_or(-120.0);
        let max_db = self.config.max_db.unwrap_or(0.0);

        let clamped: Vec<f32> = magnitudes_db
            .iter()
            .take(self.config.num_bins)
            .map(|&db| db.clamp(min_db, max_db))
            .collect();

        let frame = SpectrogramFrame {
            magnitudes_db: clamped,
            timestamp_secs: elapsed,
            frame_index: self.total_frames,
        };

        if self.count < self.config.max_frames {
            self.frames.push(frame);
            self.count += 1;
        } else {
            self.frames[self.head] = frame;
        }

        self.head = (self.head + 1) % self.config.max_frames;
        self.total_frames += 1;
    }

    /// Returns all stored frames ordered oldest → newest.
    pub fn get_frames(&self) -> Vec<&SpectrogramFrame> {
        let n = self.count;
        let cap = self.config.max_frames;

        if n < cap {
            // Buffer not full yet — frames are in order
            self.frames.iter().collect()
        } else {
            // Circular: oldest is at `head`, newest is at `head - 1`
            let mut result = Vec::with_capacity(n);
            for i in 0..n {
                result.push(&self.frames[(self.head + i) % cap]);
            }
            result
        }
    }

    /// Creates a serialisable snapshot of the full spectrogram.
    pub fn snapshot(&self) -> SpectrogramSnapshot {
        let bin_width_hz = self.sample_rate / ((self.config.num_bins - 1) as f64 * 2.0);

        SpectrogramSnapshot {
            frames: self.get_frames().into_iter().cloned().collect(),
            num_bins: self.config.num_bins,
            bin_width_hz,
            sample_rate: self.sample_rate,
            total_frames: self.total_frames,
        }
    }

    /// Clears all stored frames and resets the timer.
    pub fn clear(&mut self) {
        self.frames.clear();
        self.head = 0;
        self.count = 0;
        self.total_frames = 0;
        self.start_time = None;
    }

    /// Returns the current number of stored frames.
    pub fn frame_count(&self) -> usize {
        self.count
    }

    /// Returns true if the buffer is full.
    pub fn is_full(&self) -> bool {
        self.count >= self.config.max_frames
    }

    /// Updates the configuration (e.g., when the user changes max_frames).
    /// Clears the buffer since dimensions may have changed.
    pub fn reconfigure(&mut self, config: SpectrogramConfig) {
        self.config = config;
        self.clear();
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_and_retrieve() {
        let config = SpectrogramConfig {
            num_bins: 5,
            max_frames: 3,
            min_db: Some(-100.0),
            max_db: Some(0.0),
        };
        let mut sg = Spectrogram::new(config, 48000.0);

        // Push 2 frames
        sg.push_magnitude(&[0.1, 0.5, 1.0, 0.3, 0.01]);
        sg.push_magnitude(&[0.2, 0.4, 0.9, 0.2, 0.02]);

        assert_eq!(sg.frame_count(), 2);
        let frames = sg.get_frames();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].frame_index, 0);
        assert_eq!(frames[1].frame_index, 1);
    }

    #[test]
    fn test_circular_overwrite() {
        let config = SpectrogramConfig {
            num_bins: 3,
            max_frames: 2,
            ..Default::default()
        };
        let mut sg = Spectrogram::new(config, 48000.0);

        sg.push_magnitude(&[1.0, 1.0, 1.0]);
        sg.push_magnitude(&[0.5, 0.5, 0.5]);
        sg.push_magnitude(&[0.1, 0.1, 0.1]); // overwrites first

        assert_eq!(sg.frame_count(), 2);
        let frames = sg.get_frames();
        // Oldest should be frame_index=1, newest frame_index=2
        assert_eq!(frames[0].frame_index, 1);
        assert_eq!(frames[1].frame_index, 2);
    }

    #[test]
    fn test_db_clamping() {
        let config = SpectrogramConfig {
            num_bins: 2,
            max_frames: 1,
            min_db: Some(-80.0),
            max_db: Some(0.0),
        };
        let mut sg = Spectrogram::new(config, 48000.0);

        sg.push_magnitude(&[0.0, 100.0]); // 0.0 → should clamp to -80 dB; 100 → +40 dB → clamp 0
        let frames = sg.get_frames();
        assert_eq!(frames[0].magnitudes_db[0], -80.0);
        assert_eq!(frames[0].magnitudes_db[1], 0.0);
    }

    #[test]
    fn test_snapshot() {
        let config = SpectrogramConfig {
            num_bins: 4,
            max_frames: 10,
            ..Default::default()
        };
        let mut sg = Spectrogram::new(config, 48000.0);
        sg.push_magnitude(&[1.0, 0.5, 0.25, 0.1]);

        let snap = sg.snapshot();
        assert_eq!(snap.frames.len(), 1);
        assert_eq!(snap.num_bins, 4);
        assert_eq!(snap.sample_rate, 48000.0);
        assert_eq!(snap.total_frames, 1);
    }
}
