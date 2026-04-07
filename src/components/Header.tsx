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
  toolsOpen?: boolean;
  onToggleTools?: () => void;
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
  toolsOpen,
  onToggleTools,
}: HeaderProps) {
  return (
    <header className="flex items-center h-8 bg-bg-panel border-b border-border-default select-none shrink-0 px-1">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="btn-hardware w-7 h-6 rounded text-xs"
        title={sidebarOpen ? "Recolher painel" : "Expandir painel"}
      >
        <span className="material-symbols-outlined text-[16px]">
          {sidebarOpen ? "left_panel_close" : "left_panel_open"}
        </span>
      </button>

      {/* View mode tabs */}
      <div className="flex items-center gap-0.5 ml-2">
        {(["spectrum", "transfer", "phase"] as ViewMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onViewModeChange(m)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors
              ${viewMode === m
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-text-dim border border-transparent hover:text-text-secondary hover:bg-bg-elevated"
              }`}
          >
            {m === "spectrum" ? "Magnitude" : m === "transfer" ? "Transferência" : "Fase"}
          </button>
        ))}
      </div>

      {/* Center spacer + cursor readout */}
      <div className="flex-1 flex justify-center">
        <div className="hud-text text-[10px] text-text-dim tracking-wider">
          {cursorFreq && (
            <span className="text-primary">{cursorFreq}</span>
          )}
          {cursorDb && (
            <>
              <span className="mx-1.5 text-text-muted">|</span>
              <span className="text-text-secondary">{cursorDb}</span>
            </>
          )}
        </div>
      </div>

      {/* Right status + tools + save */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 mr-1">
          <div className={`w-1.5 h-1.5 rounded-full ${running ? "bg-success animate-pulse" : "bg-danger"}`} />
          <span className="hud-text text-[9px] text-text-dim">{fps} fps</span>
        </div>
        {onToggleTools && (
          <button
            onClick={onToggleTools}
            className={`btn-hardware w-7 h-6 rounded text-xs ${toolsOpen ? "text-primary bg-primary/10" : ""}`}
            title={toolsOpen ? "Fechar ferramentas" : "Abrir ferramentas"}
          >
            <span className="material-symbols-outlined text-[16px]">handyman</span>
          </button>
        )}
        <button className="btn-hardware w-7 h-6 rounded text-xs" title="Salvar sessão">
          <span className="material-symbols-outlined text-[16px]">save</span>
        </button>
      </div>
    </header>
  );
}
