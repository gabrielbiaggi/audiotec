/**
 * ControlDesk — Pro Audio transport bar.
 *
 * Design philosophy:
 * - Transport controls (Play/Stop/Sim) are LARGE and center-stage
 * - VU Meters are generously sized (not crammed into 5px strips)
 * - Delay Engine readout uses MonoDisplay for high-contrast numerics
 * - Engine config (FFT, Window, Avg) hidden behind a gear icon → modal
 * - NO nested boxes — flat matte black with subtle zinc-800 dividers
 */

import MonoDisplay from "./ui/MonoDisplay";
import ProButton from "./ui/ProButton";
import type { SimSignalType } from "../types";
import { SIM_SIGNAL_OPTIONS } from "../types";

interface ControlDeskProps {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  simulating: boolean;
  simSignal: SimSignalType;
  onSimSignalChange: (s: SimSignalType) => void;
  onStartSim: () => void;
  onStopSim: () => void;
  fftSize: number;
  sampleRate: number;
  onOpenEngineSettings: () => void;
}

export default function ControlDesk({
  running,
  onStart,
  onStop,
  simulating,
  simSignal,
  onSimSignalChange,
  onStartSim,
  onStopSim,
  fftSize,
  sampleRate,
  onOpenEngineSettings,
}: ControlDeskProps) {
  const latencyMs = (fftSize / sampleRate * 1000).toFixed(1);

  return (
    <footer className="flex items-center h-16 bg-[#0A0A0A] border-t border-zinc-800/60 px-4 select-none shrink-0 z-50 gap-6">

      {/* ── VU Meters ── */}
      <div className="flex items-end gap-1.5 h-12 shrink-0">
        <VuMeter level={running || simulating ? 0.72 : 0} label="L" />
        <VuMeter level={running || simulating ? 0.48 : 0} label="R" />
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-zinc-800/60" />

      {/* ── Transport Controls ── */}
      <div className="flex items-center gap-2">
        {/* Stop */}
        <ProButton
          onClick={onStop}
          disabled={!running && !simulating}
          accent="danger"
          active={false}
          size="md"
          icon
          title="Parar"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
        </ProButton>

        {/* Play / Engine */}
        <ProButton
          onClick={running ? undefined : onStart}
          disabled={simulating}
          accent="success"
          active={running}
          size="lg"
          icon
          title={running ? "Motor ativo" : "Iniciar motor"}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
        </ProButton>

        {/* Sim */}
        <ProButton
          onClick={simulating ? onStopSim : onStartSim}
          disabled={running}
          accent="warning"
          active={simulating}
          size="md"
          title={simulating ? "Parar simulação" : "Iniciar simulação"}
          className="text-xs font-mono tracking-wider"
        >
          SIM
        </ProButton>
      </div>

      {/* Signal selector */}
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-[10px] uppercase tracking-wider text-zinc-500">Sinal</span>
        <select
          value={simSignal}
          onChange={(e) => onSimSignalChange(e.target.value as SimSignalType)}
          disabled={simulating || running}
          className="bg-transparent border border-zinc-800/60 rounded-md px-2 py-1
                     text-sm font-mono text-zinc-300 outline-none
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {SIM_SIGNAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-zinc-800/60" />

      {/* ── Telemetry ── */}
      <div className="flex items-center gap-5">
        <MonoDisplay label="Latência" value={latencyMs} unit="ms" color="text-[#eeff41]" size="md" />
        <MonoDisplay label="Buffer" value={String(fftSize)} color="text-zinc-300" size="md" />
        <MonoDisplay label="DSP" value="—" unit="%" color="text-[#00e5ff]" size="md" />
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-zinc-800/60" />

      {/* ── Delay Engine ── */}
      <div className="flex items-center gap-3">
        <MonoDisplay label="Atraso" value="0.00" unit="ms" color="text-[#76ff03]" size="lg" />
        <ProButton
          onClick={() => {}}
          accent="primary"
          size="md"
          title="Buscar atraso"
          className="gap-1.5"
        >
          <span className="material-symbols-outlined text-[16px]">straighten</span>
          <span className="text-xs font-mono uppercase tracking-wider">Buscar</span>
        </ProButton>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Engine Settings gear ── */}
      <ProButton
        onClick={onOpenEngineSettings}
        icon
        size="md"
        title="Config. motor (FFT, Janela, Média)"
      >
        <span className="material-symbols-outlined text-[18px]">settings</span>
      </ProButton>
    </footer>
  );
}

// ─── VU Meter (generous size) ───────────────────────────────────────

function VuMeter({ level, label }: { level: number; label: string }) {
  const SEGMENTS = 24;
  const active = Math.round(Math.min(1, Math.max(0, level)) * SEGMENTS);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex flex-col-reverse gap-[1px] w-2.5 h-full">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < active;
          const ratio = i / SEGMENTS;
          let color: string;
          if (ratio > 0.88)      color = on ? "#ef4444" : "rgba(239,68,68,0.08)";
          else if (ratio > 0.65) color = on ? "#eab308" : "rgba(234,179,8,0.06)";
          else                   color = on ? "#22c55e" : "rgba(34,197,94,0.06)";
          return (
            <div
              key={i}
              className="w-full rounded-[1px]"
              style={{ height: `${100 / SEGMENTS}%`, backgroundColor: color }}
            />
          );
        })}
      </div>
      <span className="font-mono text-[8px] text-zinc-600">{label}</span>
    </div>
  );
}
