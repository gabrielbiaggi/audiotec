/**
 * ControlDesk — Sonic Lab Pro hardware-style footer.
 *
 * Layout: [VU Meters | I/O & Config | Transport | System Telemetry | Delay Engine]
 */

import type { AudioDeviceInfo, ViewMode, SimSignalType } from "../types";
import {
  FFT_SIZES,
  WINDOW_TYPES,
  AVERAGING_OPTIONS,
  SAMPLE_RATES,
  SIM_SIGNAL_OPTIONS,
} from "../types";

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
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
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
  onFftSizeChange,
  windowType,
  onWindowTypeChange,
  numAverages,
  onNumAveragesChange,
  sampleRate,
  onSampleRateChange,
}: ControlDeskProps) {
  const deviceInfo = devices.find((d) => d.name === selectedDevice);

  return (
    <footer className="flex items-stretch h-[96px] bg-bg-panel border-t border-border-default select-none shrink-0 overflow-hidden">
      {/* ── VU Meters ── */}
      <div className="flex items-center gap-2 px-5 border-r border-border-default">
        <VuMeter label="L" level={running ? 0.45 : 0} />
        <VuMeter label="L" level={running ? 0.45 : 0} />
        <VuMeter label="R" level={running ? 0.55 : 0} />
      </div>

      {/* ── I/O Config ── */}1 px-5 py-1
      <div className="flex flex-col justify-center gap-1 px-5 py-1 border-r border-border-default min-w-[180px]">
        <DeskLabel>Dispositivo I/O</DeskLabel>
        <select
          value={selectedDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          disabled={running}
          className="bg-black text-text-primary border border-border-default rounded
                     px-1.5 py-0.5 text-[10px] font-mono outline-none truncate
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {devices.map((d) => (
            <option key={d.name} value={d.name}>
              [{d.host}] {d.name} ({d.maxChannels}ch)
            </option>
          ))}
          {devices.length === 0 && <option>Sem dispositivos</option>}
        </select>
        {deviceInfo && (
          <span className="text-[8px] font-mono text-text-muted truncate">
            {sampleRate / 1000}kHz · {deviceInfo.maxChannels}ch
          </span>
        )}
      </div>
3 px-5 py-1
      <div className="flex items-center gap-3 px-5 py-1 border-r border-border-default">
        <ConfigSelect label="FFT" value={fftSize} onChange={onFftSizeChange} disabled={running}
          options={FFT_SIZES.map(s => ({ value: s, label: String(s) }))} />
        <ConfigSelect label="Win" value={windowType} onChange={onWindowTypeChange} disabled={running}
          options={WINDOW_TYPES.map(w => ({ value: w, label: w }))} />
        <ConfigSelect label="Avg" value={numAverages} onChange={onNumAveragesChange} disabled={running}
          options={AVERAGING_OPTIONS.map(n => ({ value: n, label: n === 1 ? "Off" : `${n}×` }))} />
        <ConfigSelect label="Rate" value={sampleRate} onChange={onSampleRateChange} disabled={running}
          options={SAMPLE_RATES.map(r => ({ value: r, label: `${r / 1000}k` }))} />
      </div>
2 px-5 py-1
      <div className="flex items-center gap-2 px-5 py-1 border-r border-border-default">
        <button
          onClick={running ? onStop : onStart}
          disabled={simulating}
          className={`w-8 h-8 rounded btn-hardware font-bold text-[14px] transition-colors
            ${running
              ? "border-danger/50 text-danger hover:bg-danger/15"
              : "border-primary/50 text-primary hover:bg-primary/15"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={running ? "Parar motor" : "Iniciar motor"}
        >
          {running ? "■" : "▶"}
        </button>
        <button className="w-8 h-8 rounded btn-hardware" title="Resetar médias">
          <span className="material-symbols-outlined text-[16px]">restart_alt</span>
        </button>
      </div>

      {/* ── Simulation ── */}3 px-5 py-1
      <div className="flex items-center gap-3 px-5 py-1 border-r border-border-default">
        <div className="flex flex-col items-center gap-0.5">
          <DeskLabel>Sinal</DeskLabel>
          <select
            value={simSignal}
            onChange={(e) => onSimSignalChange(e.target.value as SimSignalType)}
            disabled={simulating || running}
            className="bg-black text-text-primary border border-border-default rounded
                       px-1 py-0.5 text-[9px] font-mono outline-none min-w-[72px] text-center
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {SIM_SIGNAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={simulating ? onStopSim : onStartSim}
          disabled={running}
          className={`w-8 h-8 rounded btn-hardware font-bold text-[10px] tracking-tight transition-colors
            ${simulating
              ? "border-warning/60 text-warning bg-warning/10 hover:bg-warning/20"
              : "border-secondary/50 text-secondary hover:bg-secondary/15"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={simulating ? "Parar simulação" : "Iniciar simulação"}
        >
          SIM
        </button>
        {simulating && (
          <span className="w-2 h-2 rounded-full bg-warning animate-pulse" title="Simulação ativa" />
        )}
      </div>

      {/* ── System Telemetry ── */}5 py-1
      <div className="flex flex-col justify-center gap-1 px-5 py-1 border-r border-border-default min-w-[120px]">
        <DeskLabel>Sistema</DeskLabel>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono text-text-dim">
          <span>Buffer</span>
          <span className="text-text-secondary">{fftSize}</span>
          <span>Rate</span>
          <span className="text-text-secondary">{sampleRate / 1000}kHz</span>
          <span>Window</span>
          <span className="text-text-secondary">{windowType}</span>
        </div>
      </div>

      {/* ── Delay Engine ── */}5 py-1
      <div className="flex flex-col justify-center gap-1 px-5 py-1 ml-auto">
        <DeskLabel>Motor de Delay</DeskLabel>
        <div className="flex items-center gap-2">
          <div className="digital-readout px-2 py-1 rounded text-xs font-mono text-primary min-w-[72px] text-center">
            0.000 ms
          </div>
          <div className="digital-readout px-2 py-1 rounded text-xs font-mono text-secondary min-w-[72px] text-center">
            0.000 m
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function VuMeter({ label, level }: { label: string; level: number }) {
  const pct = Math.min(100, Math.max(0, level * 100));
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-3 h-12 rounded-sm bg-black border border-border-default overflow-hidden relative">
        <div
          className="absolute bottom-0 left-0 right-0 vu-meter-bar transition-all duration-75"
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="text-[7px] font-mono text-text-dim">{label}</span>
    </div>
  );
}

function DeskLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[7px] uppercase tracking-widest text-text-muted font-semibold">
      {children}
    </span>
  );
}

function ConfigSelect<T extends string | number>({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  disabled: boolean;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[7px] uppercase tracking-widest text-text-muted font-semibold">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof value === "number" ? Number(raw) : raw) as T);
        }}
        disabled={disabled}
        className="bg-black text-text-primary border border-border-default rounded
                   px-1 py-0.5 text-[9px] font-mono outline-none min-w-[52px] text-center
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
