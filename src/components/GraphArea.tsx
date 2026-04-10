/**
 * GraphArea -- Sonic Lab Pro: viewport with resizable split.
 *
 * Layout:
 * - Spectrum / Impulse / Coherence: AnalyzerCanvas fills 100%
 * - Transfer: Magnitude + Phase with draggable splitter
 * - Phase: phase canvas fills 100%
 *
 * Overlays: HUD info (top-left), RTA LIVE badge (top-right).
 */

import { useState } from "react";
import type { SpectrumData, ViewMode } from "../types";
import AnalyzerCanvas from "./AnalyzerCanvas";
import { useResizableSplitter } from "../hooks/useResizableSplitter";

interface GraphAreaProps {
  spectrumRef: React.RefObject<SpectrumData | null>;
  viewMode: ViewMode;
  showRef: boolean;
  showMeas: boolean;
  showCoherence: boolean;
  /** Coherence blanking threshold (0.0–1.0). Default 0.2 (20 %). */
  coherenceThreshold?: number;
  running: boolean;
  onFpsUpdate: (fps: number) => void;
}

function viewLabel(mode: ViewMode): string {
  switch (mode) {
    case "spectrum":  return "MAGNITUDE -- dBFS";
    case "transfer":  return "FUNCAO DE TRANSFERENCIA -- dB";
    case "phase":     return "FASE -- graus";
    case "impulse":   return "RESPOSTA AO IMPULSO -- ms";
    case "coherence": return "COERENCIA";
    default:          return mode;
  }
}

/** Resolve o modo de renderizacao do canvas (impulso/coerencia -> espectro por ora) */
function resolveCanvasMode(mode: ViewMode): "spectrum" | "transfer" | "phase" {
  if (mode === "transfer") return "transfer";
  if (mode === "phase") return "phase";
  return "spectrum";
}

export default function GraphArea({
  spectrumRef,
  viewMode,
  showRef,
  showMeas,
  showCoherence,
  coherenceThreshold = 0.2,
  running,
  onFpsUpdate,
}: GraphAreaProps) {
  const [cursorInfo] = useState({ freq: "--", mag: "--", phase: "--", coh: "--" });
  const isTransfer = viewMode === "transfer";
  const { ratio, containerRef, onMouseDown } = useResizableSplitter(0.65, 0.25, 0.85);

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-w-0 min-h-0 relative">

      {/* HUD: cursor info overlay (top-left) */}
      <div className="absolute top-2 left-12 z-20 pointer-events-none">
        <div className="bg-black/70 backdrop-blur-sm border border-zinc-800/40 rounded px-3 py-1.5">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
            <span className="text-zinc-500 text-[10px] uppercase">Freq</span>
            <span className="text-[#00e5ff] tabular-nums">{cursorInfo.freq}</span>
            <span className="text-zinc-500 text-[10px] uppercase">Mag</span>
            <span className="text-zinc-300 tabular-nums">{cursorInfo.mag}</span>
            <span className="text-zinc-500 text-[10px] uppercase">Fase</span>
            <span className="text-amber-400 tabular-nums">{cursorInfo.phase}</span>
            <span className="text-zinc-500 text-[10px] uppercase">Coer</span>
            <span className="text-red-400 tabular-nums">{cursorInfo.coh}</span>
          </div>
        </div>
      </div>

      {/* LIVE badge (top-right) */}
      {running && (
        <div className="absolute top-2 right-3 z-20 pointer-events-none flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="font-mono text-xs font-bold text-green-500 tracking-wider">LIVE</span>
        </div>
      )}

      {/* View mode label */}
      <div className="absolute top-12 left-12 z-10 font-mono text-[10px] text-zinc-600 uppercase tracking-wider pointer-events-none">
        {viewLabel(viewMode)}
      </div>

      {/* Main panel (Magnitude) */}
      <div className="relative min-h-0 bg-[#0A0A0A]" style={{ flex: isTransfer ? `0 0 ${ratio * 100}%` : "1 1 100%" }}>
        <AnalyzerCanvas
          spectrumRef={spectrumRef}
          viewMode={isTransfer ? "transfer" : resolveCanvasMode(viewMode)}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          coherenceThreshold={coherenceThreshold}
          onFpsUpdate={onFpsUpdate}
        />
      </div>

      {/* Resizable splitter + Phase panel (transfer mode only) */}
      {isTransfer && (
        <>
          <div className="splitter-handle vertical" onMouseDown={onMouseDown} />
          <div className="relative min-h-0 bg-[#0A0A0A]" style={{ flex: `0 0 ${(1 - ratio) * 100}%` }}>
            <div className="absolute top-2 left-12 z-10 font-mono text-[10px] text-zinc-600 uppercase tracking-wider pointer-events-none">
              FASE — graus
            </div>
            <AnalyzerCanvas
              spectrumRef={spectrumRef}
              viewMode="phase"
              showRef={false}
              showMeas={false}
              showCoherence={showCoherence}
              coherenceThreshold={coherenceThreshold}
              onFpsUpdate={() => {}}
            />
          </div>
        </>
      )}
    </div>
  );
}
