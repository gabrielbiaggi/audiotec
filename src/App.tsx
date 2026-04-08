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
import type { AudioDeviceInfo, EngineConfig, StoredTrace, ViewMode } from "./types";
import { useSpectrumEvent } from "./hooks/useTauriEvent";
import MainLayout from "./layout/MainLayout";
import DataBar from "./components/DataBar";
import GraphArea from "./components/GraphArea";
import ControlBar from "./components/ControlBar";
import Header from "./components/Header";
import ToolsDrawer from "./components/ToolsDrawer";
import AcademyPanel from "./components/AcademyPanel";
import OnboardingGuide from "./components/OnboardingGuide";

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

  // ── UI state ──────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // ── Tools drawer state ────────────────────────────────────────
  const [storedTraces] = useState<StoredTrace[]>([]);
  const [oscConnected, setOscConnected] = useState(false);

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

  // ── Extract live frequency/magnitude arrays for ToolsDrawer ──
  const liveFrequencies = spectrumRef.current?.frequencies ?? [];
  const liveMeasuredDb = spectrumRef.current?.magnitudeMeas ?? [];

  // ── Render ────────────────────────────────────────────────────
  return (
    <MainLayout
      header={
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((p) => !p)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          running={running}
          fps={fps}
          cursorFreq=""
          cursorDb=""
          toolsOpen={toolsOpen}
          onToggleTools={() => setToolsOpen((p) => !p)}
          academyOpen={academyOpen}
          onToggleAcademy={() => setAcademyOpen((p) => !p)}
          onOpenWizard={() => setWizardOpen(true)}
        />
      }
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
      sidebarOpen={sidebarOpen}
      viewport={
        <GraphArea
          spectrumRef={spectrumRef}
          viewMode={viewMode}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          onFpsUpdate={handleFpsUpdate}
          running={running}
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
      toolsDrawer={
        <ToolsDrawer
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
          frequencies={liveFrequencies}
          measuredDb={liveMeasuredDb}
          storedTraces={storedTraces}
          oscConnected={oscConnected}
          onOscStatusChange={(connected) => setOscConnected(connected)}
          spectrumRef={spectrumRef}
        />
      }
      toolsOpen={toolsOpen}
      academyPanel={
        academyOpen ? (
          <AcademyPanel
            onClose={() => setAcademyOpen(false)}
            onOpenWizard={() => { setAcademyOpen(false); setWizardOpen(true); }}
          />
        ) : null
      }
      overlay={
        <OnboardingGuide open={wizardOpen} onClose={() => setWizardOpen(false)} />
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
    list.push({ id: "ref",  label: "Referência (CH1)", color: "#00e5ff",               visible: showRef,  onToggle: handlers.onToggleRef  });
    list.push({ id: "meas", label: "Medição (CH2)",    color: "#eeff41",               visible: showMeas, onToggle: handlers.onToggleMeas });
  } else if (mode === "transfer") {
    list.push({ id: "tf",  label: "Transferência H1", color: "#00e5ff",                visible: true,     onToggle: () => {}              });
    list.push({ id: "coh", label: "Coerência γ²",     color: "rgba(139,92,246,0.75)", visible: showCoh,  onToggle: handlers.onToggleCoh  });
  } else {
    list.push({ id: "phase", label: "Fase (graus)",   color: "#ff4081",                visible: true,     onToggle: () => {}              });
    list.push({ id: "coh",   label: "Coerência γ²",   color: "rgba(139,92,246,0.75)", visible: showCoh,  onToggle: handlers.onToggleCoh  });
  }

  return list;
}
