/**
 * App — Top-level composition layer.
 *
 * Manages application state, Tauri IPC commands, and wires
 * all components together through the MainLayout shell.
 *
 * Rendering logic lives in canvas/drawing.ts — zero drawing code here.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AudioDeviceInfo, EngineConfig, ViewMode } from "./types";
import { useSpectrumEvent } from "./hooks/useTauriEvent";
import MainLayout from "./layout/MainLayout";
import DataBar from "./components/DataBar";
import GraphArea from "./components/GraphArea";
import ControlBar from "./components/ControlBar";

export default function App() {
  // ── Spectrum data via ref (bypasses React VDOM) ───────────────
  const spectrumRef = useSpectrumEvent();

  // ── Engine state ──────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [fps, setFps] = useState(0);

  // ── Config state ──────────────────────────────────────────────
  const [fftSize, setFftSize] = useState(4096);
  const [windowType, setWindowType] = useState("Hann");
  const [numAverages, setNumAverages] = useState(8);
  const [sampleRate, setSampleRate] = useState(48000);

  // ── View state ────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("spectrum");
  const [showRef, setShowRef] = useState(true);
  const [showMeas, setShowMeas] = useState(true);
  const [showCoherence, setShowCoherence] = useState(true);

  // ── Load devices on mount ─────────────────────────────────────
  useEffect(() => {
    invoke<AudioDeviceInfo[]>("list_devices")
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0) setSelectedDevice(devs[0].name);
      })
      .catch(console.error);
  }, []);

  // ── Engine controls ───────────────────────────────────────────
  const handleStart = useCallback(async () => {
    try {
      const config: EngineConfig = {
        fftSize,
        windowType,
        sampleRate,
        deviceName: selectedDevice || null,
        numAverages,
      };
      await invoke("start_engine", { config });
      setRunning(true);
    } catch (e) {
      console.error("Start engine failed:", e);
    }
  }, [selectedDevice, fftSize, windowType, numAverages, sampleRate]);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_engine");
      setRunning(false);
    } catch (e) {
      console.error("Stop engine failed:", e);
    }
  }, []);

  // FPS callback — called from AnalyzerCanvas at ~1Hz
  const handleFpsUpdate = useCallback((f: number) => setFps(f), []);

  // ── Trace descriptors for DataBar ─────────────────────────────
  const traces = buildTraces(viewMode, showRef, showMeas, showCoherence, {
    onToggleRef: () => setShowRef((p) => !p),
    onToggleMeas: () => setShowMeas((p) => !p),
    onToggleCoh: () => setShowCoherence((p) => !p),
  });

  // ── Render ────────────────────────────────────────────────────
  return (
    <MainLayout
      sidebar={
        <DataBar
          viewMode={viewMode}
          traces={traces}
          deviceInfo={devices.find((d) => d.name === selectedDevice) ?? null}
          running={running}
          fps={fps}
          sampleRate={sampleRate}
          fftSize={fftSize}
        />
      }
      graph={
        <GraphArea
          spectrumRef={spectrumRef}
          viewMode={viewMode}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          onFpsUpdate={handleFpsUpdate}
        />
      }
      controls={
        <ControlBar
          running={running}
          onStart={handleStart}
          onStop={handleStop}
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
          fftSize={fftSize}
          onFftSizeChange={setFftSize}
          windowType={windowType}
          onWindowTypeChange={setWindowType}
          numAverages={numAverages}
          onNumAveragesChange={setNumAverages}
          sampleRate={sampleRate}
          onSampleRateChange={setSampleRate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      }
    />
  );
}

// ─── Trace builder ──────────────────────────────────────────────────

function buildTraces(
  mode: ViewMode,
  showRef: boolean,
  showMeas: boolean,
  showCoh: boolean,
  handlers: {
    onToggleRef: () => void;
    onToggleMeas: () => void;
    onToggleCoh: () => void;
  },
) {
  const list: { id: string; label: string; color: string; visible: boolean; onToggle: () => void }[] = [];

  if (mode === "spectrum") {
    list.push({ id: "ref", label: "Reference (CH1)", color: "#00e5ff", visible: showRef, onToggle: handlers.onToggleRef });
    list.push({ id: "meas", label: "Measurement (CH2)", color: "#eeff41", visible: showMeas, onToggle: handlers.onToggleMeas });
  } else if (mode === "transfer") {
    list.push({ id: "tf", label: "Transfer H1", color: "#00e5ff", visible: true, onToggle: () => {} });
    list.push({ id: "coh", label: "Coherence γ²", color: "rgba(139,92,246,0.75)", visible: showCoh, onToggle: handlers.onToggleCoh });
  } else {
    list.push({ id: "phase", label: "Phase (deg)", color: "#ff4081", visible: true, onToggle: () => {} });
    list.push({ id: "coh", label: "Coherence γ²", color: "rgba(139,92,246,0.75)", visible: showCoh, onToggle: handlers.onToggleCoh });
  }

  return list;
}
