/**
 * GraphArea — Central graph container with split view support.
 *
 * Layout uses CSS Grid to split the canvas area:
 * - Single view: one AnalyzerCanvas fills the entire area
 * - Split view (future): top = Magnitude/Coherence, bottom = Phase
 *
 * The canvas itself handles all rendering via RAF — this wrapper
 * only provides the layout and legend bar.
 */

import type { SpectrumData, ViewMode } from "../types";
import AnalyzerCanvas from "./AnalyzerCanvas";

interface GraphAreaProps {
  spectrumRef: React.RefObject<SpectrumData | null>;
  viewMode: ViewMode;
  showRef: boolean;
  showMeas: boolean;
  showCoherence: boolean;
  onFpsUpdate: (fps: number) => void;
}

/** Trace color map for legend display. */
const LEGEND: Record<ViewMode, { items: { color: string; label: string }[] }> = {
  spectrum: {
    items: [
      { color: "#00e5ff", label: "Reference (CH1)" },
      { color: "#eeff41", label: "Measurement (CH2)" },
    ],
  },
  transfer: {
    items: [
      { color: "#00e5ff", label: "Transfer Function H1" },
      { color: "rgba(139,92,246,0.75)", label: "Coherence γ²" },
    ],
  },
  phase: {
    items: [
      { color: "#ff4081", label: "Phase (degrees)" },
      { color: "rgba(139,92,246,0.75)", label: "Coherence γ²" },
    ],
  },
};

export default function GraphArea({
  spectrumRef,
  viewMode,
  showRef,
  showMeas,
  showCoherence,
  onFpsUpdate,
}: GraphAreaProps) {
  const legendItems = LEGEND[viewMode].items;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* ── Legend bar ── */}
      <div className="flex items-center gap-5 px-3 py-1 bg-bg-surface border-b border-border-subtle shrink-0">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-[3px] rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] text-text-secondary">{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 min-h-0 bg-bg-canvas">
        <AnalyzerCanvas
          spectrumRef={spectrumRef}
          viewMode={viewMode}
          showRef={showRef}
          showMeas={showMeas}
          showCoherence={showCoherence}
          onFpsUpdate={onFpsUpdate}
        />
      </div>
    </div>
  );
}
