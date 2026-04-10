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
    <aside className="flex flex-col w-full h-full bg-[#0F0F0F] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
        <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.15em] text-zinc-500">
          Ferramentas
        </span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Fechar ferramentas"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800/50">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors
              ${tab === key
                ? "text-[#00e5ff] bg-zinc-800/30"
                : "text-zinc-600 hover:text-zinc-400"
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
