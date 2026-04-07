// ─── Audio types matching Rust backend (camelCase via serde) ────────

/** Spectrum data payload from `spectrum-data` event (JSON path). */
export interface SpectrumData {
  frequencies: number[];
  magnitudeRef: number[];
  magnitudeMeas: number[];
  transferMagnitude: number[];
  transferPhase: number[];
  coherence: number[];
  sampleRate: number;
  fftSize: number;
}

/**
 * Binary audio frame received via `audio-frame` event.
 * Format:  [sampleRate:f32, fftSize:f32, ...frequencies:f32[], ...magRef:f32[],
 *           ...magMeas:f32[], ...transferMag:f32[], ...transferPhase:f32[],
 *           ...coherence:f32[]]
 * Total floats = 2 + 6*binCount
 */
export interface AudioFrameBinary {
  sampleRate: number;
  fftSize: number;
  frequencies: Float32Array;
  magnitudeRef: Float32Array;
  magnitudeMeas: Float32Array;
  transferMagnitude: Float32Array;
  transferPhase: Float32Array;
  coherence: Float32Array;
}

/** Audio device descriptor from `list_devices` command. */
export interface AudioDeviceInfo {
  name: string;
  sampleRates: number[];
  maxChannels: number;
  host: string;
}

/** Engine configuration sent to `start_engine` command. */
export interface EngineConfig {
  fftSize: number;
  windowType: string;
  sampleRate: number | null;
  deviceName: string | null;
  numAverages: number | null;
}

// ─── View types ─────────────────────────────────────────────────────

export type ViewMode = "spectrum" | "transfer" | "phase";

export type SignalGenType = "off" | "pink" | "white" | "sine";

// ─── Trace descriptor ───────────────────────────────────────────────

export interface TraceInfo {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  data?: SpectrumData;
}

// ─── Constants ──────────────────────────────────────────────────────

export const FFT_SIZES = [1024, 2048, 4096, 8192, 16384] as const;
export const WINDOW_TYPES = ["Hann", "Hamming", "BlackmanHarris", "FlatTop", "Rectangular"] as const;
export const AVERAGING_OPTIONS = [1, 2, 4, 8, 16, 32, 64] as const;
export const SAMPLE_RATES = [44100, 48000, 88200, 96000] as const;

export const FREQ_MIN = 20;
export const FREQ_MAX = 20_000;

// Per-view Y-axis ranges
export const SPECTRUM_DB_MIN = -90;
export const SPECTRUM_DB_MAX = 6;
export const TRANSFER_DB_MIN = -30;
export const TRANSFER_DB_MAX = 30;
export const PHASE_MIN = -180;
export const PHASE_MAX = 180;

// Canvas padding for axis labels
export const PAD_LEFT = 52;
export const PAD_RIGHT = 14;
export const PAD_TOP = 8;
export const PAD_BOTTOM = 24;
