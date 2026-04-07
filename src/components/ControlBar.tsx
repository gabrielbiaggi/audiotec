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
          onClick={running ? onStop : onStart}
          className={`px-4 py-1 rounded font-bold text-white tracking-wide transition-colors
            ${running
              ? "bg-danger hover:bg-danger-hover"
              : "bg-accent hover:bg-accent-hover"
            }`}
        >
          {running ? "■ Stop" : "▶ Start"}
        </button>
      </BarGroup>

      <Divider />

      {/* ── Device selector ── */}
      <BarGroup>
        <BarLabel>Device</BarLabel>
        <select
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
          {devices.length === 0 && <option>No devices found</option>}
        </select>
      </BarGroup>

      <Divider />

      {/* ── Sample Rate ── */}
      <BarGroup>
        <BarLabel>Rate</BarLabel>
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

      {/* ── Signal Generator (placeholder) ── */}
      <BarGroup>
        <BarLabel>Signal</BarLabel>
        <select
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[72px] outline-none"
          defaultValue="off"
        >
          <option value="off">Off</option>
          <option value="pink">Pink Noise</option>
          <option value="white">White Noise</option>
          <option value="sine">Sine</option>
        </select>
      </BarGroup>

      <Divider />

      {/* ── Analysis Config ── */}
      <BarGroup>
        <BarLabel>FFT</BarLabel>
        <select
          value={fftSize}
          onChange={(e) => onFftSizeChange(Number(e.target.value))}
          disabled={running}
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[56px] outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {FFT_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <BarLabel>Win</BarLabel>
        <select
          value={windowType}
          onChange={(e) => onWindowTypeChange(e.target.value)}
          disabled={running}
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[80px] outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {WINDOW_TYPES.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>

        <BarLabel>Avg</BarLabel>
        <select
          value={numAverages}
          onChange={(e) => onNumAveragesChange(Number(e.target.value))}
          disabled={running}
          className="bg-bg-surface text-text-primary border border-border-default rounded
                     px-2 py-0.5 text-[11px] min-w-[48px] outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {AVERAGING_OPTIONS.map((n) => (
            <option key={n} value={n}>{n === 1 ? "Off" : `${n}×`}</option>
          ))}
        </select>
      </BarGroup>

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
            {m === "spectrum" ? "Spec" : m === "transfer" ? "TF" : "Phase"}
          </button>
        ))}
      </BarGroup>

      {/* ── Delay Finder (placeholder) ── */}
      <div className="ml-auto flex items-center gap-2">
        <button
          className="px-2.5 py-0.5 rounded border border-border-default text-text-dim
                     hover:text-text-secondary hover:bg-bg-elevated transition-colors font-semibold"
        >
          Delay Finder
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
