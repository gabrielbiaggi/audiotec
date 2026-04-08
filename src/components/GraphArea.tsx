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
  running,
  onFpsUpdate,
}: GraphAreaProps) {
  const [cursorInfo] = useState({ freq: "--", mag: "--", phase: "--", coh: "--" });
  const isTransfer = viewMode === "transfer";
  const { ratio, containerRef, onMouseDown } = useResizableSplitter(0.65, 0.25, 0.85);

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-w-0 min-h-0 relative">

      {/* HUD: caixa de informacoes (topo-esquerda) */}
      <div className="absolute top-2 left-14 z-20 pointer-events-none">
        <div className="bg-black/70 border border-zinc-800 rounded px-2.5 py-1.5 backdrop-blur-sm">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0 hud-text text-[9px]">
            <span className="text-zinc-500">FREQ</span>
            <span className="text-primary">{cursorInfo.freq}</span>
            <span className="text-zinc-500">MAG</span>
            <span className="text-zinc-300">{cursorInfo.mag}</span>
            <span className="text-zinc-500">FASE</span>
            <span className="text-secondary">{cursorInfo.phase}</span>
            <span className="text-zinc-500">COE</span>
            <span className="text-danger">{cursorInfo.coh}</span>
          </div>
        </div>
      </div>

      {/* Badge RTA AO VIVO (topo-direita) */}
      {running && (
        <div className="absolute top-2 right-3 z-20 pointer-events-none flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_4px_#16a34a]" />
          <span className="hud-text text-[9px] font-bold text-success tracking-wider">RTA AO VIVO</span>
        </div>
      )}

      {/* Rotulo HUD do modo atual */}
      <div className="absolute top-1.5 left-14 z-10 hud-text text-[9px] text-text-dim tracking-wider pointer-events-none mt-8">
        {viewLabel(viewMode)}
      </div>

      {/* Main panel (Magnitude) */}
      <div className="relative min-h-0 bg-bg-canvas" style={{ flex: isTransfer ? `0 0 ${ratio * 100}%` : "1 1 100%" }}>
        <AnalyzerCanvas
          spectrumRef={spectrumRef}
          viewMode={isTransfer ? "transfer" : resolveCanvasMode(viewMode)}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          onFpsUpdate={onFpsUpdate}
        />
      </div>

      {/* Resizable splitter + Phase panel (transfer mode only) */}
      {isTransfer && (
        <>
          <div className="splitter-handle vertical" onMouseDown={onMouseDown} />
          <div className="relative min-h-0 bg-bg-canvas" style={{ flex: `0 0 ${(1 - ratio) * 100}%` }}>
            <div className="absolute top-1.5 left-14 z-10 hud-text text-[9px] text-text-dim tracking-wider pointer-events-none">
              FASE -- graus
            </div>
            <AnalyzerCanvas
              spectrumRef={spectrumRef}
              viewMode="phase"
              showRef={false}
              showMeas={false}
              showCoherence={showCoherence}
              onFpsUpdate={() => {}}
            />
          </div>
        </>
      )}
    </div>
  );
}
