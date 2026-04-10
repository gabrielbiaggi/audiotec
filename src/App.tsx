/**
 * App — Top-level composition layer.
 *
 * Manages application state, Tauri IPC commands, and wires
 * all components together through the MainLayout shell.
 *
 * Rendering logic lives in canvas/drawing.ts — zero drawing code here.
 */

import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AudioDeviceInfo, EngineConfig, ViewMode } from "./types";
import { useSpectrumEvent } from "./hooks/useTauriEvent";
import { useAppStore } from "./stores/useAppStore";
import MainLayout from "./layout/MainLayout";
import type { ActivityItem } from "./layout/MainLayout";
import DataBar from "./components/DataBar";
import GraphArea from "./components/GraphArea";
import ControlDesk from "./components/ControlDesk";
import Header from "./components/Header";
import ToolsDrawer from "./components/ToolsDrawer";
import AcademyPanel from "./components/AcademyPanel";
import OnboardingGuide from "./components/OnboardingGuide";
import EngineSettingsModal from "./components/EngineSettingsModal";

// ── Activity Bar items ──────────────────────────────────────────
const ACTIVITY_ITEMS: ActivityItem[] = [
  { id: "traces",  icon: "ssid_chart",       label: "Traços",      position: "top" },
  { id: "tools",   icon: "handyman",         label: "Ferramentas", position: "top" },
  { id: "academy", icon: "school",           label: "Academia",    position: "top" },
  { id: "wizard",  icon: "help_outline",     label: "Assistente",  position: "bottom" },
];

export default function App() {
  // ── Spectrum data via ref (bypasses React VDOM) ───────────────
  const spectrumRef = useSpectrumEvent();

  // ── State from Zustand store ──────────────────────────────────
  const {
    running, simulating, devices, selectedDevice, fps,
    fftSize, windowType, numAverages, sampleRate,
    viewMode, showRef, showMeas, showCoherence, coherenceThreshold,
    sidebarOpen, activeActivity, wizardOpen, engineSettingsOpen,
    simSignal, storedTraces, oscConnected,
    setRunning, setSimulating, setDevices, setSelectedDevice, setFps,
    setFftSize, setWindowType, setNumAverages, setSampleRate,
    setViewMode, toggleShowRef, toggleShowMeas, toggleShowCoherence,
    setSidebarOpen: _setSidebarOpen, toggleSidebar,
    setActiveActivity, setWizardOpen, setEngineSettingsOpen,
    setSimSignal, setOscConnected,
  } = useAppStore();

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

  // ── Simulation controls ───────────────────────────────────────
  const handleStartSim = useCallback(async () => {
    try {
      await invoke("start_simulation", { signalType: simSignal });
      setSimulating(true);
    } catch (e) {
      console.error("Start simulation failed:", e);
    }
  }, [simSignal]);

  const handleStopSim = useCallback(async () => {
    try {
      await invoke("stop_simulation");
      setSimulating(false);
    } catch (e) {
      console.error("Stop simulation failed:", e);
    }
  }, []);

  // ── Activity Bar handler ──────────────────────────────────────
  const handleActivityChange = useCallback((id: string | null) => {
    if (id === "wizard") {
      setWizardOpen(true);
      return;
    }
    setActiveActivity(id);
  }, []);

  // ── Trace descriptors for DataBar ─────────────────────────────
  const traces = buildTraces(viewMode, showRef, showMeas, showCoherence, {
    onToggleRef: toggleShowRef,
    onToggleMeas: toggleShowMeas,
    onToggleCoh: toggleShowCoherence,
  });

  // ── Extract live frequency/magnitude arrays for ToolsDrawer ──
  const liveFrequencies = spectrumRef.current?.frequencies ?? [];
  const liveMeasuredDb = spectrumRef.current?.magnitudeMeas ?? [];

  // ── Render ────────────────────────────────────────────────────
  const toolsOpen = activeActivity === "tools";
  const academyOpen = activeActivity === "academy";

  return (
    <>
      <MainLayout
        activityItems={ACTIVITY_ITEMS}
        activeActivity={activeActivity}
        onActivityChange={handleActivityChange}
        header={
          <Header
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            running={running}
            fps={fps}
            cursorFreq=""
            cursorDb=""
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
            coherenceThreshold={coherenceThreshold}
            onFpsUpdate={handleFpsUpdate}
            running={running}
          />
        }
        controls={
          <ControlDesk
            running={running}
            onStart={handleStart}
            onStop={handleStop}
            simulating={simulating}
            simSignal={simSignal}
            onSimSignalChange={setSimSignal}
            onStartSim={handleStartSim}
            onStopSim={handleStopSim}
            fftSize={fftSize}
            sampleRate={sampleRate}
            onOpenEngineSettings={() => setEngineSettingsOpen(true)}
          />
        }
        toolsDrawer={
          toolsOpen ? (
            <ToolsDrawer
              open={true}
              onClose={() => setActiveActivity(null)}
              frequencies={liveFrequencies}
              measuredDb={liveMeasuredDb}
              storedTraces={storedTraces}
              oscConnected={oscConnected}
              onOscStatusChange={(connected) => setOscConnected(connected)}
              spectrumRef={spectrumRef}
            />
          ) : undefined
        }
        academyPanel={
          academyOpen ? (
            <AcademyPanel
              onClose={() => setActiveActivity(null)}
              onOpenWizard={() => { setActiveActivity(null); setWizardOpen(true); }}
            />
          ) : null
        }
        overlay={
          <OnboardingGuide open={wizardOpen} onClose={() => setWizardOpen(false)} />
        }
      />
      <EngineSettingsModal
        open={engineSettingsOpen}
        onClose={() => setEngineSettingsOpen(false)}
        running={running}
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
      />
    </>
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
