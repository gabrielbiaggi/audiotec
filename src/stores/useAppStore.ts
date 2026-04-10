/**
 * useAppStore — Zustand global store.
 *
 * Centralises ALL UI / config / engine state that was previously scattered
 * across ~15 useState calls in App.tsx.
 *
 * Real-time audio data (SpectrumData) intentionally stays outside the store
 * as a React ref — it mutates at 60 fps and must never trigger re-renders.
 */

import { create } from "zustand";
import type { AudioDeviceInfo, StoredTrace, ViewMode, SimSignalType } from "../types";

export interface AppState {
  // ── Engine ──────────────────────────────────────────────────────
  running: boolean;
  simulating: boolean;
  devices: AudioDeviceInfo[];
  selectedDevice: string;
  fps: number;

  // ── Config ──────────────────────────────────────────────────────
  fftSize: number;
  windowType: string;
  numAverages: number;
  sampleRate: number;

  // ── View ────────────────────────────────────────────────────────
  viewMode: ViewMode;
  showRef: boolean;
  showMeas: boolean;
  showCoherence: boolean;
  /** Coherence blanking threshold (0.0–1.0). Default 0.2 (20 %). */
  coherenceThreshold: number;

  // ── UI ──────────────────────────────────────────────────────────
  sidebarOpen: boolean;
  activeActivity: string | null;
  wizardOpen: boolean;
  engineSettingsOpen: boolean;

  // ── Simulation ──────────────────────────────────────────────────
  simSignal: SimSignalType;

  // ── Traces / OSC ────────────────────────────────────────────────
  storedTraces: StoredTrace[];
  oscConnected: boolean;

  // ── Actions ─────────────────────────────────────────────────────
  setRunning: (v: boolean) => void;
  setSimulating: (v: boolean) => void;
  setDevices: (v: AudioDeviceInfo[]) => void;
  setSelectedDevice: (v: string) => void;
  setFps: (v: number) => void;

  setFftSize: (v: number) => void;
  setWindowType: (v: string) => void;
  setNumAverages: (v: number) => void;
  setSampleRate: (v: number) => void;

  setViewMode: (v: ViewMode) => void;
  toggleShowRef: () => void;
  toggleShowMeas: () => void;
  toggleShowCoherence: () => void;
  setCoherenceThreshold: (v: number) => void;

  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setActiveActivity: (v: string | null) => void;
  setWizardOpen: (v: boolean) => void;
  setEngineSettingsOpen: (v: boolean) => void;

  setSimSignal: (v: SimSignalType) => void;

  setStoredTraces: (v: StoredTrace[]) => void;
  setOscConnected: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // ── Engine defaults ──
  running: false,
  simulating: false,
  devices: [],
  selectedDevice: "",
  fps: 0,

  // ── Config defaults ──
  fftSize: 4096,
  windowType: "Hann",
  numAverages: 8,
  sampleRate: 48000,

  // ── View defaults ──
  viewMode: "spectrum",
  showRef: true,
  showMeas: true,
  showCoherence: true,
  coherenceThreshold: 0.2,

  // ── UI defaults ──
  sidebarOpen: true,
  activeActivity: null,
  wizardOpen: false,
  engineSettingsOpen: false,

  // ── Simulation defaults ──
  simSignal: "pinkNoise",

  // ── Traces / OSC defaults ──
  storedTraces: [],
  oscConnected: false,

  // ── Actions ──
  setRunning: (v) => set({ running: v }),
  setSimulating: (v) => set({ simulating: v }),
  setDevices: (v) => set({ devices: v }),
  setSelectedDevice: (v) => set({ selectedDevice: v }),
  setFps: (v) => set({ fps: v }),

  setFftSize: (v) => set({ fftSize: v }),
  setWindowType: (v) => set({ windowType: v }),
  setNumAverages: (v) => set({ numAverages: v }),
  setSampleRate: (v) => set({ sampleRate: v }),

  setViewMode: (v) => set({ viewMode: v }),
  toggleShowRef: () => set((s) => ({ showRef: !s.showRef })),
  toggleShowMeas: () => set((s) => ({ showMeas: !s.showMeas })),
  toggleShowCoherence: () => set((s) => ({ showCoherence: !s.showCoherence })),
  setCoherenceThreshold: (v) => set({ coherenceThreshold: v }),

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveActivity: (v) => set({ activeActivity: v }),
  setWizardOpen: (v) => set({ wizardOpen: v }),
  setEngineSettingsOpen: (v) => set({ engineSettingsOpen: v }),

  setSimSignal: (v) => set({ simSignal: v }),

  setStoredTraces: (v) => set({ storedTraces: v }),
  setOscConnected: (v) => set({ oscConnected: v }),
}));
