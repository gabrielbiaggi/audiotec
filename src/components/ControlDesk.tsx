/**
 * ControlDesk — Sonic Lab Pro hardware-style footer.
 *
 * Layout: [VU Meters | I/O & Config | Transport | System Telemetry | Delay Engine]
 */

import type { AudioDeviceInfo, SimSignalType } from "../types";
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
  devices: AudioDeviceInfo[];
  selectedDevice: string;
  onDeviceChange: (name: string) => void;
  fftSize: number;
  onFftSizeChange: (n: number) => void;
  windowType: string;
  onWindowTypeChange: (w: string) => void;
  numAverages: number;
  onNumAveragesChange: (n: number) => void;
  sampleRate: number;
  onSampleRateChange: (r: number) => void;
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
  devices,
  selectedDevice,
  onDeviceChange,
  fftSize,
  sampleRate,
}: ControlDeskProps) {

  return (
    <footer className="flex items-center justify-between h-14 bg-zinc-950 border-t border-zinc-800 px-2 select-none shrink-0 overflow-hidden z-50">
      {/* ── VU Meters & I/O ── */}
      <div className="flex items-center gap-4 w-[25%]">
        <div className="flex gap-1 h-10 px-1 border-r border-zinc-800 mr-2">
          <VuMeter level={running || simulating ? 0.70 : 0} />
          <VuMeter level={running || simulating ? 0.45 : 0} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <DeskLabel>Input 1</DeskLabel>
              <select
                value={selectedDevice}
                onChange={(e) => onDeviceChange(e.target.value)}
                disabled={running}
                className="bg-black border border-zinc-800 px-2 h-6 text-[9px] font-mono text-zinc-400 outline-none min-w-[80px] rounded-sm
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {devices.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
                {devices.length === 0 && <option>—</option>}
              </select>
            </div>
            <div className="flex flex-col">
              <DeskLabel>Ref</DeskLabel>
              <div className="bg-black border border-zinc-800 px-2 h-6 flex items-center min-w-[80px] rounded-sm">
                <span className="text-[9px] font-mono text-zinc-400">INT_L</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Transport Controls ── */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          <button
            onClick={onStop}
            disabled={!running && !simulating}
            className="btn-hardware w-8 h-8 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed"
            title="Parar"
          >
            <span className="material-symbols-outlined text-[16px]">stop</span>
          </button>
          <button
            onClick={running ? undefined : onStart}
            disabled={simulating}
            className={`btn-hardware w-10 h-8 rounded-sm relative transition-colors
              ${running ? "bg-zinc-800 text-primary border-primary/30" : ""}
              disabled:opacity-30 disabled:cursor-not-allowed`}
            title={running ? "Motor ativo" : "Iniciar motor"}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            {running && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-primary" />}
          </button>
          <button className="btn-hardware w-8 h-8 rounded-sm" title="Pausar">
            <span className="material-symbols-outlined text-[16px]">pause</span>
          </button>
        </div>
        <div className="h-6 w-px bg-zinc-800 mx-1" />
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-zinc-600 uppercase">SIGNAL</span>
          <div className="flex items-center gap-2 px-2 py-1 bg-black border border-zinc-800 rounded-sm">
            {simulating && <div className="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_4px_#94de2d]" />}
            <select
              value={simSignal}
              onChange={(e) => onSimSignalChange(e.target.value as SimSignalType)}
              disabled={simulating || running}
              className="bg-transparent text-[9px] font-mono text-secondary outline-none
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {SIM_SIGNAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={simulating ? onStopSim : onStartSim}
            disabled={running}
            className={`btn-hardware w-8 h-8 rounded-sm text-[9px] font-bold font-mono transition-colors
              ${simulating ? "border-warning/60 text-warning bg-warning/10" : "border-secondary/50 text-secondary hover:bg-secondary/15"}
              disabled:opacity-30 disabled:cursor-not-allowed`}
            title={simulating ? "Parar simulação" : "Iniciar simulação"}
          >
            SIM
          </button>
        </div>
      </div>

      {/* ── System Telemetry & Delay ── */}
      <div className="flex items-center gap-4 w-[35%] justify-end">
        {/* Telemetry */}
        <div className="flex items-center gap-3 px-3 py-1 bg-black border border-zinc-800 rounded-sm">
          <TelemetryItem label="DSP" value="—" color="text-primary" />
          <div className="w-px h-6 bg-zinc-800" />
          <TelemetryItem label="Latency" value={`${(fftSize / sampleRate * 1000).toFixed(1)}ms`} color="text-secondary" />
          <div className="w-px h-6 bg-zinc-800" />
          <TelemetryItem label="Buffer" value={String(fftSize)} color="text-primary" />
        </div>

        {/* Delay Engine */}
        <div className="flex flex-col items-end">
          <DeskLabel>Delay Engine</DeskLabel>
          <div className="bg-black border border-zinc-800 px-3 h-8 flex items-center justify-end rounded-sm min-w-[120px]">
            <span className="text-xl font-mono text-secondary leading-none tracking-tighter">0.00</span>
            <span className="text-[9px] font-mono text-secondary/60 ml-1.5 mt-1">ms</span>
          </div>
        </div>
        <button className="h-8 px-4 btn-hardware hover:text-primary hover:border-primary/40 gap-2 rounded-sm">
          <span className="material-symbols-outlined text-[16px]">straighten</span>
          <span className="text-[10px] font-bold font-mono uppercase">Find</span>
        </button>
      </div>
    </footer>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function VuMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.max(0, level * 100));
  return (
    <div className="w-2 h-full bg-zinc-900 relative rounded-sm overflow-hidden">
      <div
        className="absolute bottom-0 left-0 right-0 vu-meter-bar transition-all duration-75"
        style={{ height: `${pct}%` }}
      />
    </div>
  );
}

function DeskLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[8px] font-bold text-zinc-600 uppercase mb-0.5">
      {children}
    </span>
  );
}

function TelemetryItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">{label}</span>
      <span className={`text-[10px] font-mono ${color}`}>{value}</span>
    </div>
  );
}
