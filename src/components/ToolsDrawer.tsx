/**
 * ToolsDrawer — Right-side panel with advanced DSP tools.
 *
 * Tabbed interface: Onda | Sala | Média | EQ | OSC | IA
 */

import { useState } from "react";
import WaveCalcPanel from "./WaveCalcPanel";
import RoomModesPanel from "./RoomModesPanel";
import AutoEqPanel from "./AutoEqPanel";
import OscPanel from "./OscPanel";
import SpatialAvgPanel from "./SpatialAvgPanel";
import AiDiagnosticsPanel from "./AiDiagnosticsPanel";
import RoomVisualization from "./RoomVisualization";
import type { StoredTrace, SpectrumData } from "../types";

type ToolTab = "wave" | "room" | "eq" | "osc" | "spatial" | "ai" | "sala-viz";

interface ToolsDrawerProps {
  open: boolean;
  onClose: () => void;
  frequencies: number[];
  measuredDb: number[];
  storedTraces: StoredTrace[];
  oscConnected: boolean;
  onOscStatusChange: (connected: boolean) => void;
  spectrumRef: React.RefObject<SpectrumData | null>;
}

const TABS: { key: ToolTab; icon: string; label: string }[] = [
  { key: "wave", icon: "waves", label: "Onda" },
  { key: "room", icon: "meeting_room", label: "Modos" },
  { key: "sala-viz", icon: "view_in_ar", label: "Sala" },
  { key: "spatial", icon: "layers", label: "Média" },
  { key: "eq", icon: "equalizer", label: "EQ" },
  { key: "osc", icon: "settings_remote", label: "OSC" },
  { key: "ai", icon: "psychology", label: "IA" },
];

export default function ToolsDrawer({
  open,
  onClose,
  frequencies,
  measuredDb,
  storedTraces,
  oscConnected,
  onOscStatusChange,
  spectrumRef,
}: ToolsDrawerProps) {
  const [tab, setTab] = useState<ToolTab>("wave");

  if (!open) return null;

  return (
    <aside className="flex flex-col w-72 shrink-0 bg-bg-panel border-l border-border-default select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-default">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-text-dim">
          Ferramentas
        </span>
        <button
          onClick={onClose}
          className="btn-hardware w-6 h-5 rounded text-xs"
          title="Fechar ferramentas"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-default">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[8px] transition-colors
              ${tab === key
                ? "text-primary bg-bg-elevated/50"
                : "text-text-dim hover:text-text-secondary"
              }`}
          >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "wave" && <WaveCalcPanel />}
        {tab === "room" && <RoomModesPanel />}
        {tab === "spatial" && <SpatialAvgPanel storedTraces={storedTraces} />}
        {tab === "eq" && (
          <AutoEqPanel
            frequencies={frequencies}
            measuredDb={measuredDb}
            oscConnected={oscConnected}
          />
        )}
        {tab === "osc" && <OscPanel onStatusChange={onOscStatusChange} />}
        {tab === "sala-viz" && <RoomVisualization />}
        {tab === "ai" && (
          <AiDiagnosticsPanel
            spectrumRef={spectrumRef}
            roomLength={8}
            roomWidth={5}
            roomHeight={3}
          />
        )}
      </div>
    </aside>
  );
}
