/**
 * ControlBar — Bottom bar with engine controls, signal generator,
 * analysis config, and system status.
 *
 * Layout: [Engine Controls | Signal Gen | Analysis Config | Status]
 */

import type {
  AudioDeviceInfo,
  ViewMode,
} from "../types";
import {
  FFT_SIZES,
  WINDOW_TYPES,
  AVERAGING_OPTIONS,
  SAMPLE_RATES,
} from "../types";
import DropdownMenu from "./ui/DropdownMenu";
import HelpTooltip from "./ui/HelpTooltip";

interface ControlBarProps {
  // Engine state
  running: boolean;
  onStart: () => void;
  onStop: () => void;

  // Device
  devices: AudioDeviceInfo[];
  selectedDevice: string;
  onDeviceChange: (name: string) => void;

  // Config
  fftSize: number;
  onFftSizeChange: (n: number) => void;
  windowType: string;
  onWindowTypeChange: (w: string) => void;
  numAverages: number;
  onNumAveragesChange: (n: number) => void;
  sampleRate: number;
  onSampleRateChange: (r: number) => void;

  // View
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export default function ControlBar({
  running,
  onStart,
  onStop,
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
  viewMode,
  onViewModeChange,
}: ControlBarProps) {
  const deviceInfo = devices.find((d) => d.name === selectedDevice);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-panel border-t border-border-default
                     shrink-0 select-none overflow-x-auto text-[11px]">

      {/* ── Engine controls ── */}
      <BarGroup>
        <button
          data-help="start"
          onClick={running ? onStop : onStart}
          className={`px-4 py-1 rounded font-bold text-white tracking-wide transition-colors
            ${running
              ? "bg-danger hover:bg-danger-hover"
              : "bg-accent hover:bg-accent-hover"
            }`}
        >
          {running ? "■ Parar" : "▶ Iniciar"}
        </button>
      </BarGroup>

      <Divider />

      {/* ── Device selector ── */}
      <BarGroup>
        <BarLabel>Disposit.</BarLabel>
        <HelpTooltip tooltipKey="sampleRate" />
        <select
          data-help="device"
          value={selectedDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          disabled={running}
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[180px] outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {devices.map((d) => (
            <option key={d.name} value={d.name}>
              [{d.host}] {d.name} ({d.maxChannels}ch)
            </option>
          ))}
          {devices.length === 0 && <option>Nenhum dispositivo</option>}
        </select>
      </BarGroup>

      <Divider />

      {/* ── Sample Rate ── */}
      <BarGroup>
        <BarLabel>Taxa</BarLabel>
        <select
          value={sampleRate}
          onChange={(e) => onSampleRateChange(Number(e.target.value))}
          disabled={running}
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[64px] outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {SAMPLE_RATES.map((r) => {
            const ok = deviceInfo?.sampleRates.includes(r);
            return (
              <option key={r} value={r}>
                {r / 1000}k{ok === false ? " (?)" : ""}
              </option>
            );
          })}
        </select>
      </BarGroup>

      <Divider />

      {/* ── Signal Generator ── */}
      <BarGroup>
        <BarLabel>Sinal</BarLabel>
        <HelpTooltip tooltipKey="signalGenerator" />
        <select
          data-help="signal-gen"
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[72px] outline-none"
          defaultValue="off"
        >
          <option value="off">Desl.</option>
          <option value="pink">Ruído Rosa</option>
          <option value="white">Ruído Branco</option>
          <option value="sine">Senoidal</option>
        </select>
      </BarGroup>

      <Divider />

      {/* ── Analysis Config (grouped in dropdown) ── */}
      <DropdownMenu label="Análise ⚙">
        <div className="flex flex-col gap-2 min-w-[220px]">
          <div className="flex items-center gap-2">
            <BarLabel>FFT</BarLabel>
            <HelpTooltip tooltipKey="fftSize" />
            <select
              value={fftSize}
              onChange={(e) => onFftSizeChange(Number(e.target.value))}
              disabled={running}
              className="bg-bg-surface text-text-primary border border-border-default rounded
                         px-2 py-0.5 text-[11px] flex-1 outline-none
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {FFT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <BarLabel>Janela</BarLabel>
            <HelpTooltip tooltipKey="windowType" />
            <select
              value={windowType}
              onChange={(e) => onWindowTypeChange(e.target.value)}
              disabled={running}
              className="bg-bg-surface text-text-primary border border-border-default rounded
                         px-2 py-0.5 text-[11px] flex-1 outline-none
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {WINDOW_TYPES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <BarLabel>Média</BarLabel>
            <HelpTooltip tooltipKey="averaging" />
            <select
              value={numAverages}
              onChange={(e) => onNumAveragesChange(Number(e.target.value))}
              disabled={running}
              className="bg-bg-surface text-text-primary border border-border-default rounded
                         px-2 py-0.5 text-[11px] flex-1 outline-none
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {AVERAGING_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 1 ? "Desl." : `${n}×`}</option>
              ))}
            </select>
          </div>
        </div>
      </DropdownMenu>

      <Divider />

      {/* ── View tabs ── */}
      <BarGroup>
        {(["spectrum", "transfer", "phase"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onViewModeChange(m)}
            className={`px-2.5 py-0.5 rounded font-semibold tracking-wide transition-colors
              ${viewMode === m
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-text-dim border border-transparent hover:text-text-secondary hover:bg-bg-elevated"
              }`}
          >
            {m === "spectrum" ? "Mag" : m === "transfer" ? "TF" : "Fase"}
          </button>
        ))}
      </BarGroup>

      {/* ── Delay Finder ── */}
      <div className="ml-auto flex items-center gap-2">
        <HelpTooltip tooltipKey="delayFinder" align="right" />
        <button
          data-help="delay-finder"
          className="px-2.5 py-0.5 rounded border border-border-default text-text-dim
                     hover:text-text-secondary hover:bg-bg-elevated transition-colors font-semibold"
        >
          Buscar Atraso
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function BarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>;
}

function BarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] uppercase tracking-wider text-text-dim font-semibold">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border-default shrink-0 mx-1" />;
}
