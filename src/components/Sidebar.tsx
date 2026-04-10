import { useState } from "react";
import type { AudioDeviceInfo, ViewMode } from "../types";

interface TraceEntry {
  id: string;
  label: string;
  color: string;
  visible: boolean;
  onToggle: () => void;
}

interface SidebarProps {
  open: boolean;
  viewMode: ViewMode;
  traces: TraceEntry[];
  deviceInfo: AudioDeviceInfo | null;
  running: boolean;
  sampleRate: number;
  fftSize: number;
}

type NavSection = "measurements" | "stored" | "config";

interface MemorySlot {
  id: number;
  label: string;
  stored: boolean;
  color: string;
  visible: boolean;
}

const INITIAL_SLOTS: MemorySlot[] = [
  { id: 1, label: "L MAIN FIR", stored: true, color: "#4cd7f6", visible: true },
  { id: 2, label: "R PA SYSTEM", stored: true, color: "#fbabff", visible: true },
  { id: 3, label: "SUB_ARRAY_REF", stored: true, color: "#94de2d", visible: false },
  { id: 4, label: "Slot D", stored: false, color: "#dc2626", visible: false },
];

export default function Sidebar({
  open,
  viewMode,
  traces,
  deviceInfo,
  running,
  sampleRate,
  fftSize,
}: SidebarProps) {
  const [activeNav, setActiveNav] = useState<NavSection>("measurements");
  const [slots, setSlots] = useState<MemorySlot[]>(INITIAL_SLOTS);
  const [ctxMenuSlot, setCtxMenuSlot] = useState<number | null>(null);

  if (!open) return null;

  const hzPerBin = (sampleRate / fftSize).toFixed(1);

  const toggleSlotVisibility = (id: number) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  };

  return (
    <aside className="flex flex-col w-52 shrink-0 bg-bg-panel border-r border-border-default select-none">
      {/* ── App title ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default">
        <span className="text-primary font-bold text-xs tracking-tight">SONIC LAB</span>
        <span className="text-[9px] font-mono text-text-dim">v0.1.0</span>
      </div>

      {/* ── Capture button (filled cyan — matches design) ── */}
      <div className="px-2 py-2 border-b border-border-default">
        <button className="w-full py-1.5 rounded text-[10px] font-bold tracking-wider bg-primary text-black hover:bg-primary/90 transition-colors">
          <span className="material-symbols-outlined text-[14px] align-middle mr-1">fiber_manual_record</span>
          CAPTURAR
          <span className="text-[8px] font-mono ml-1 opacity-60">[SPACE]</span>
        </button>
      </div>

      {/* ── Memory Slots (list-style with vis/delete — matches design) ── */}
      <div className="px-2 py-2 border-b border-border-default">
        <div className="text-[8px] font-semibold uppercase tracking-widest text-text-muted px-1 mb-1.5">
          Slots de Memória
        </div>
        <div className="flex flex-col gap-0.5">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-bg-elevated transition-colors group relative"
              onContextMenu={(e) => { e.preventDefault(); setCtxMenuSlot(slot.id === ctxMenuSlot ? null : slot.id); }}
            >
              <div
                className="w-2 h-2 rounded-sm shrink-0"
                style={{
                  backgroundColor: slot.stored ? slot.color : "transparent",
                  border: `1.5px solid ${slot.color}`,
                  opacity: slot.visible ? 1 : 0.3,
                }}
              />
              <span className={`text-[9px] font-mono flex-1 truncate ${slot.visible ? "text-text-primary" : "text-text-dim"}`}>
                {slot.label}
              </span>
              <button
                onClick={() => toggleSlotVisibility(slot.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title={slot.visible ? "Ocultar" : "Mostrar"}
              >
                <span className="material-symbols-outlined text-[12px] text-text-dim hover:text-text-secondary">
                  {slot.visible ? "visibility" : "visibility_off"}
                </span>
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover"
              >
                <span className="material-symbols-outlined text-[12px] text-text-dim hover:text-danger">
                  close
                </span>
              </button>
              {/* Context menu */}
              {ctxMenuSlot === slot.id && (
                <div className="absolute left-full top-0 ml-1 z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 min-w-[140px]">
                  {["Informações / Notas", "Inverter Polaridade", "Calcular Média com...", "Exportar CSV", "Exportar FRD"].map((item) => (
                    <button
                      key={item}
                      onClick={() => setCtxMenuSlot(null)}
                      className="w-full text-left px-3 py-1 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Navigation tabs ── */}
      <div className="flex border-b border-border-default">
        {([
          { key: "measurements" as NavSection, icon: "monitoring", label: "Med." },
          { key: "stored" as NavSection, icon: "folder", label: "Salvos" },
          { key: "config" as NavSection, icon: "tune", label: "Config" },
        ]).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveNav(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[8px] transition-colors
              ${activeNav === key ? "text-primary bg-bg-elevated/50" : "text-text-dim hover:text-text-secondary"}`}
          >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {activeNav === "measurements" && (
          <>
            <SectionTitle>Traços Ao Vivo</SectionTitle>
            <div className="flex flex-col gap-0.5">
              {traces.map((t) => (
                <TraceRow key={t.id} {...t} />
              ))}
            </div>
          </>
        )}

        {activeNav === "stored" && (
          <>
            <SectionTitle>Traços Salvos</SectionTitle>
            <div className="px-2 py-3 text-[10px] text-text-muted italic text-center">
              Nenhum traço salvo
            </div>
          </>
        )}

        {activeNav === "config" && (
          <>
            <SectionTitle>Config. Motor</SectionTitle>
            <div className="px-2 py-1 flex flex-col gap-1 text-[10px] font-mono text-text-dim">
              <div className="flex justify-between">
                <span>FFT:</span>
                <span className="text-text-secondary">{fftSize} pt</span>
              </div>
              <div className="flex justify-between">
                <span>Hz/bin:</span>
                <span className="text-text-secondary">{hzPerBin}</span>
              </div>
              <div className="flex justify-between">
                <span>Rate:</span>
                <span className="text-text-secondary">{sampleRate / 1000}k</span>
              </div>
              <div className="flex justify-between">
                <span>View:</span>
                <span className="text-text-secondary capitalize">{viewMode}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Status footer ── */}
      <div className="border-t border-border-default px-2 py-1.5 flex flex-col gap-0.5 text-[9px] font-mono text-text-dim">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${running ? "bg-success" : "bg-danger"}`} />
          <span>{running ? "Motor Ativo" : "Motor Inativo"}</span>
        </div>
        {deviceInfo && (
          <div className="truncate text-text-muted" title={deviceInfo.name}>
            {deviceInfo.name}
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-1 text-[8px] font-semibold uppercase tracking-widest text-text-muted">
      {children}
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
      <div
        className="w-2 h-2 rounded-sm shrink-0"
        style={{ backgroundColor: visible ? color : "transparent", border: `1.5px solid ${color}` }}
      />
      <span className={`text-[10px] flex-1 truncate ${visible ? "text-text-primary" : "text-text-dim line-through"}`}>
        {label}
      </span>
      <span className="text-[9px] text-text-dim group-hover:text-text-secondary">
        {visible ? "●" : "○"}
      </span>
    </button>
  );
}
