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

export type ViewMode = "spectrum" | "transfer" | "phase" | "impulse" | "coherence";

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

// Canvas padding for axis labels (compact — pro-audio density)
export const PAD_LEFT = 38;
export const PAD_RIGHT = 8;
export const PAD_TOP = 4;
export const PAD_BOTTOM = 18;

// ─── Simulation config ──────────────────────────────────────────────

export type SimSignalType = "pinkNoise" | "whiteNoise" | "sineSweep" | "multiTone";

export const SIM_SIGNAL_OPTIONS: { value: SimSignalType; label: string }[] = [
  { value: "pinkNoise", label: "Ruído Rosa" },
  { value: "whiteNoise", label: "Ruído Branco" },
  { value: "sineSweep", label: "Varredura Senoidal" },
  { value: "multiTone", label: "Multi-Tom" },
];

export interface SimConfig {
  signalType: SimSignalType;
  fftSize?: number;
  sampleRate?: number;
  numAverages?: number;
  amplitude?: number;
  delaySamples?: number;
  noiseLevel?: number;
}

// ─── Wave calculator types (matches Rust wave_calc.rs) ──────────────

export interface WaveCalcRequest {
  frequencyHz: number;
  distanceM: number;
  temperatureC: number;
}

export interface WaveCalcResult {
  speedOfSound: number;
  wavelengthM: number;
  wavelengthFt: number;
  delayMs: number;
  delaySamples48k: number;
  delaySamples96k: number;
  cyclesInDistance: number;
}

// ─── Room modes types (matches Rust room_modes.rs) ──────────────────

export interface RoomModesRequest {
  length: number;
  width: number;
  height: number;
  temperatureC: number;
  maxFrequency: number;
  maxOrder: number;
}

export type ModeType = "axial" | "tangential" | "oblique";

export interface RoomMode {
  frequency: number;
  nx: number;
  ny: number;
  nz: number;
  modeType: ModeType;
  wavelengthM: number;
}

export interface RoomModesResult {
  modes: RoomMode[];
  speedOfSound: number;
  schroederFrequency: number;
  volume: number;
  boltRatio: number[];
}

// ─── Spatial average types (matches Rust spatial_average.rs) ────────

export interface StoredTrace {
  label: string;
  frequencies: number[];
  magnitudeDb: number[];
  phaseDeg: number[];
  coherence: number[];
}

export interface SpatialAverageResult {
  frequencies: number[];
  magnitudeDb: number[];
  phaseDeg: number[];
  coherence: number[];
  numTraces: number;
}

// ─── Auto-EQ types (matches Rust auto_eq.rs) ────────────────────────

export interface PeqBand {
  frequency: number;
  gainDb: number;
  q: number;
  bandwidthOct: number;
}

export interface AutoEqRequest {
  frequencies: number[];
  measuredDb: number[];
  targetDb: number[];
  maxBoostDb?: number;
  thresholdDb?: number;
  maxBands?: number;
  smoothingResolution?: number;
}

export interface AutoEqResult {
  bands: PeqBand[];
  smoothedMeasuredDb: number[];
  predictedDb: number[];
  rmsErrorBefore: number;
  rmsErrorAfter: number;
}

// ─── OSC client types (matches Rust osc_client.rs) ──────────────────

export interface OscConfig {
  host: string;
  port: number;
}

export interface OscStatus {
  connected: boolean;
  host: string;
  port: number;
  lastError: string | null;
}

export interface OscEqTarget {
  targetType: string;
  number: number;
}
