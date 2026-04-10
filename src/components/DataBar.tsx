/**
 * DataBar — Left sidebar for trace management and session tools.
 *
 * Pro Audio design: flat, no nested boxes, readable typography.
 */

import type { AudioDeviceInfo, ViewMode } from "../types";
import MonoDisplay from "./ui/MonoDisplay";
import SectionLabel from "./ui/SectionLabel";

interface TraceEntry {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  onToggle: () => void;
}

interface DataBarProps {
  viewMode: ViewMode;
  traces: TraceEntry[];
  deviceInfo: AudioDeviceInfo | null;
  running: boolean;
  fps: number;
  sampleRate: number;
  fftSize: number;
}

export default function DataBar({
  viewMode,
  traces,
  deviceInfo,
  running,
  fps,
  sampleRate,
  fftSize,
}: DataBarProps) {
  const hzPerBin = (sampleRate / fftSize).toFixed(1);

  return (
    <aside className="flex flex-col w-full h-full bg-[#0F0F0F] border-r border-zinc-800/50 select-none">
      {/* ── Brand ── */}
      <div className="flex items-baseline gap-2 px-3 py-3 border-b border-zinc-800/50">
        <span className="text-[#00e5ff] font-bold text-sm tracking-tight">AudioTec</span>
        <span className="text-[10px] font-mono text-zinc-600">v0.1</span>
      </div>

      {/* ── Traces ── */}
      <SectionLabel>Traços</SectionLabel>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="flex flex-col gap-0.5 py-1">
          {traces.map((t) => (
            <TraceRow key={t.id} {...t} />
          ))}
        </div>

        {/* ── Sessions placeholder ── */}
        <SectionLabel>Sessões</SectionLabel>
        <p className="px-3 py-2 text-xs text-zinc-600 italic">Nenhuma sessão salva</p>
      </div>

      {/* ── Status footer ── */}
      <div className="mt-auto border-t border-zinc-800/50 px-3 py-3 flex flex-col gap-2">
        {/* Engine status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${running ? "bg-green-500" : "bg-red-500/60"}`} />
          <span className="font-mono text-xs text-zinc-400">
            {running ? "Motor Ativo" : "Motor Inativo"}
          </span>
        </div>

        {/* Device info */}
        {deviceInfo && (
          <span className="font-mono text-xs text-zinc-500 truncate" title={deviceInfo.name}>
            [{deviceInfo.host}] {deviceInfo.name}
          </span>
        )}

        {/* Metrics — using MonoDisplay for pro readability */}
        <div className="flex items-center gap-4">
          <MonoDisplay label="FFT" value={String(fftSize)} size="sm" color="text-zinc-300" />
          <MonoDisplay label="Hz/bin" value={hzPerBin} size="sm" color="text-zinc-300" />
          <MonoDisplay label="FPS" value={String(fps)} size="sm" color="text-zinc-400" />
        </div>

        {/* View mode */}
        <span className="font-sans text-[10px] uppercase tracking-wider text-zinc-600">
          {viewMode === "spectrum" ? "Magnitude" : viewMode === "transfer" ? "Função TF" : viewMode === "impulse" ? "Impulso" : viewMode === "coherence" ? "Coerência" : "Fase"}
        </span>
      </div>
    </aside>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function TraceRow({ label, color, visible, onToggle }: TraceEntry) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-left
                 hover:bg-zinc-800/30 transition-colors duration-100 group"
    >
      {/* Color dot */}
      <div
        className="w-3 h-3 rounded-sm shrink-0"
        style={{ backgroundColor: visible ? color : "transparent", border: `2px solid ${color}` }}
      />

      {/* Label — readable size */}
      <span className={`text-sm flex-1 truncate ${visible ? "text-zinc-200" : "text-zinc-600 line-through"}`}>
        {label}
      </span>

      {/* Visibility icon */}
      <span className="material-symbols-outlined text-[16px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
        {visible ? "visibility" : "visibility_off"}
      </span>
    </button>
  );
}
