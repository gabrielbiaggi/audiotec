/**
 * DataBar — Left sidebar for trace management and session tools.
 *
 * Features:
 * - Live trace list with visibility toggles (eye icon) and color indicators
 * - Session folders placeholder
 * - Device info & status display
 */

import type { AudioDeviceInfo, ViewMode } from "../types";

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
    <aside className="flex flex-col w-52 shrink-0 bg-bg-panel border-r border-border-default select-none">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-default">
        <span className="text-accent font-extrabold text-sm tracking-tight">AudioTec</span>
        <span className="text-[10px] font-mono text-text-dim">v0.1.0</span>
      </div>

      {/* ── Traces ── */}
      <div className="flex-1 overflow-y-auto">
        <SectionHeader title="Traces" />
        <div className="px-2 py-1 flex flex-col gap-0.5">
          {traces.map((t) => (
            <TraceRow key={t.id} {...t} />
          ))}
        </div>

        {/* ── Sessions placeholder ── */}
        <SectionHeader title="Sessions" />
        <div className="px-3 py-2 text-[10px] text-text-muted italic">
          No saved sessions
        </div>
      </div>

      {/* ── Status footer ── */}
      <div className="mt-auto border-t border-border-default px-3 py-2 flex flex-col gap-1 text-[10px] font-mono text-text-dim">
        {/* Engine status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${running ? "bg-success" : "bg-danger"}`} />
          <span>{running ? "Engine Running" : "Engine Stopped"}</span>
        </div>

        {/* Device info */}
        {deviceInfo && (
          <div className="truncate" title={deviceInfo.name}>
            [{deviceInfo.host}] {deviceInfo.name}
          </div>
        )}

        {/* Metrics */}
        <div className="flex items-center justify-between">
          <span>{fftSize} pt · {hzPerBin} Hz/bin</span>
          <span>{fps} fps</span>
        </div>

        {/* View mode */}
        <div className="text-text-muted uppercase tracking-wider">
          {viewMode === "spectrum" ? "Spectrum" : viewMode === "transfer" ? "Transfer Fn" : "Phase"}
        </div>
      </div>
    </aside>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-text-muted">
      {title}
    </div>
  );
}

function TraceRow({ label, color, visible, onToggle }: TraceEntry) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full px-2 py-1 rounded text-left
                 hover:bg-bg-elevated transition-colors duration-100 group"
    >
      {/* Color dot */}
      <div
        className="w-2.5 h-2.5 rounded-sm shrink-0"
        style={{ backgroundColor: visible ? color : "transparent", border: `1.5px solid ${color}` }}
      />

      {/* Label */}
      <span className={`text-[11px] flex-1 truncate ${visible ? "text-text-primary" : "text-text-dim line-through"}`}>
        {label}
      </span>

      {/* Visibility icon */}
      <span className="text-[10px] text-text-dim group-hover:text-text-secondary transition-colors">
        {visible ? "👁" : "—"}
      </span>
    </button>
  );
}
