/**
 * GraphArea -- Sonic Lab Pro: viewport com suporte a split.
 *
 * Layout:
 * - Espectro / Impulso / Coerencia: AnalyzerCanvas ocupa 100%
 * - Transferencia: Magnitude (65%) + Fase (35%) em split
 * - Fase: canvas de fase ocupa 100%
 *
 * Overlays: HUD de informacoes (topo-esquerda), badge RTA AO VIVO (topo-direita).
 */

import { useState } from "react";
import type { SpectrumData, ViewMode } from "../types";
import AnalyzerCanvas from "./AnalyzerCanvas";

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

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">

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

      {/* Painel principal (Magnitude) */}
      <div className="relative min-h-0 bg-bg-canvas" style={{ flex: isTransfer ? "0 0 65%" : "1 1 100%" }}>
        <AnalyzerCanvas
          spectrumRef={spectrumRef}
          viewMode={isTransfer ? "transfer" : resolveCanvasMode(viewMode)}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          onFpsUpdate={onFpsUpdate}
        />
      </div>

      {/* Divisor + Painel de Fase (apenas em modo transferencia) */}
      {isTransfer && (
        <>
          <div className="h-px bg-border-default shrink-0" />
          <div className="relative min-h-0 bg-bg-canvas" style={{ flex: "0 0 35%" }}>
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
