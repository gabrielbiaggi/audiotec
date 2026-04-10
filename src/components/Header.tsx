import type { ViewMode } from "../types";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  running: boolean;
  fps: number;
  cursorFreq: string;
  cursorDb: string;
}

export default function Header({
  sidebarOpen,
  onToggleSidebar,
  viewMode,
  onViewModeChange,
  running,
  fps,
  cursorFreq,
  cursorDb,
}: HeaderProps) {
  return (
    <header className="flex items-center h-9 bg-[#0F0F0F] border-b border-zinc-800/50 select-none shrink-0 px-2">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
        title={sidebarOpen ? "Ocultar sidebar" : "Mostrar sidebar"}
      >
        <span className="material-symbols-outlined text-[18px]">
          {sidebarOpen ? "left_panel_close" : "left_panel_open"}
        </span>
      </button>

      {/* View mode tabs — proper size, readable */}
      <div className="flex items-center gap-1 ml-3">
        {([
          { mode: "spectrum" as ViewMode, label: "Magnitude" },
          { mode: "phase" as ViewMode, label: "Fase" },
          { mode: "transfer" as ViewMode, label: "Transferência" },
          { mode: "impulse" as ViewMode, label: "Impulso" },
          { mode: "coherence" as ViewMode, label: "Coerência" },
        ]).map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`px-3 py-1 rounded-md text-xs font-semibold font-mono tracking-wider transition-colors
              ${viewMode === mode
                ? "bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/25"
                : "text-zinc-600 border border-transparent hover:text-zinc-400"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Center: cursor readout — large monospace */}
      <div className="flex-1 flex justify-center">
        {(cursorFreq || cursorDb) && (
          <div className="flex items-center gap-3 font-mono text-sm">
            {cursorFreq && (
              <span className="text-[#00e5ff] tabular-nums">{cursorFreq}</span>
            )}
            {cursorDb && (
              <>
                <span className="text-zinc-700">|</span>
                <span className="text-zinc-300 tabular-nums">{cursorDb}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: status */}
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-red-500/60"}`} />
        <span className="font-mono text-xs text-zinc-500 tabular-nums">{fps} fps</span>
      </div>
    </header>
  );
}
