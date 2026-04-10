import { useState } from "react";
import { GLOSSARY, WIZARD_FLOWS, type GlossaryEntry } from "../data/tooltips";
import equipmentDb from "../data/equipment-database.json";

interface AcademyPanelProps {
  onClose: () => void;
  onOpenWizard: () => void;
}

type AcademyTab = "glossary" | "wizards" | "equipment" | "signal-flow";

/**
 * AcademyPanel — in-app documentation and learning center.
 * Glossary, wizards, equipment database, and signal flow explanation.
 */
export default function AcademyPanel({ onClose, onOpenWizard }: AcademyPanelProps) {
  const [tab, setTab] = useState<AcademyTab>("glossary");
  const [glossaryFilter, setGlossaryFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");
  const [equipmentType, setEquipmentType] = useState<string>("all");

  const filteredGlossary = GLOSSARY.filter(
    (e) =>
      e.term.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
      e.definition.toLowerCase().includes(glossaryFilter.toLowerCase()),
  );

  const equipment = equipmentDb.equipment.filter((e) => {
    const matchesType = equipmentType === "all" || e.type === equipmentType;
    const matchesSearch =
      !equipmentFilter ||
      e.brand.toLowerCase().includes(equipmentFilter.toLowerCase()) ||
      e.model.toLowerCase().includes(equipmentFilter.toLowerCase());
    return matchesType && matchesSearch;
  });

  const tabs: { key: AcademyTab; label: string }[] = [
    { key: "glossary", label: "Glossário" },
    { key: "wizards", label: "Tutoriais" },
    { key: "equipment", label: "Equipamentos" },
    { key: "signal-flow", label: "Sinal" },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-panel border-l border-border-default w-80 shrink-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default">
        <div className="flex items-center gap-2">
          <span className="text-accent text-sm">📘</span>
          <span className="text-[12px] font-bold text-text-primary">Academia</span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded flex items-center justify-center text-text-dim
                     hover:text-text-primary hover:bg-bg-elevated transition-colors text-[10px]"
        >
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-default px-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 text-[10px] font-semibold tracking-wide transition-colors
              ${tab === t.key
                ? "text-accent border-b-2 border-accent"
                : "text-text-dim hover:text-text-secondary"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "glossary" && (
          <GlossaryTab entries={filteredGlossary} filter={glossaryFilter} onFilterChange={setGlossaryFilter} />
        )}
        {tab === "wizards" && <WizardsTab onOpenWizard={onOpenWizard} />}
        {tab === "equipment" && (
          <EquipmentTab
            equipment={equipment}
            filter={equipmentFilter}
            onFilterChange={setEquipmentFilter}
            typeFilter={equipmentType}
            onTypeFilterChange={setEquipmentType}
            types={equipmentDb.types as Record<string, string>}
          />
        )}
        {tab === "signal-flow" && <SignalFlowTab />}
      </div>
    </div>
  );
}

// ────── Glossary ──────

function GlossaryTab({
  entries,
  filter,
  onFilterChange,
}: {
  entries: GlossaryEntry[];
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const categories = ["measurement", "dsp", "acoustics", "equipment"] as const;
  const catLabels: Record<string, string> = {
    measurement: "Medição",
    dsp: "DSP",
    acoustics: "Acústica",
    equipment: "Equipamento",
  };
  const catColors: Record<string, string> = {
    measurement: "text-accent",
    dsp: "text-trace-yellow",
    acoustics: "text-success",
    equipment: "text-trace-magenta",
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Buscar termo..."
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="bg-bg-surface border border-border-default rounded px-2 py-1
                   text-[11px] text-text-primary outline-none placeholder-text-muted
                   focus:border-accent/40"
      />
      {categories.map((cat) => {
        const catEntries = entries.filter((e) => e.category === cat);
        if (catEntries.length === 0) return null;
        return (
          <div key={cat}>
            <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${catColors[cat]}`}>
              {catLabels[cat]}
            </p>
            {catEntries.map((entry) => (
              <div key={entry.term} className="mb-2">
                <p className="text-[11px] font-semibold text-text-primary">{entry.term}</p>
                <p className="text-[10px] text-text-dim leading-relaxed">{entry.definition}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ────── Wizards Tab ──────

function WizardsTab({ onOpenWizard }: { onOpenWizard: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-text-dim mb-1">
        Tutoriais passo-a-passo que te guiam pela interface.
      </p>
      {WIZARD_FLOWS.map((flow) => (
        <button
          key={flow.id}
          onClick={onOpenWizard}
          className="flex items-start gap-2 p-2 rounded border border-border-default
                     bg-bg-surface hover:bg-bg-elevated hover:border-accent/20
                     transition-colors text-left group"
        >
          <span className="text-lg">{flow.icon === "mic" ? "🎙️" : flow.icon === "tune" ? "🔧" : "🎛️"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-text-primary group-hover:text-accent transition-colors">
              {flow.title}
            </p>
            <p className="text-[9px] text-text-dim mt-0.5">{flow.description}</p>
            <p className="text-[8px] text-text-muted mt-0.5">{flow.steps.length} passos</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ────── Equipment Tab ──────

interface EquipmentItem {
  id: string;
  brand: string;
  model: string;
  type: string;
  year_released: number;
  dsp_capabilities: string[];
  frequency_response_notes: string;
  manual_link: string;
}

function EquipmentTab({
  equipment,
  filter,
  onFilterChange,
  typeFilter,
  onTypeFilterChange,
  types,
}: {
  equipment: EquipmentItem[];
  filter: string;
  onFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  types: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Buscar marca ou modelo..."
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="bg-bg-surface border border-border-default rounded px-2 py-1
                   text-[11px] text-text-primary outline-none placeholder-text-muted
                   focus:border-accent/40"
      />
      <div className="flex gap-1 flex-wrap">
        <TypeBadge active={typeFilter === "all"} onClick={() => onTypeFilterChange("all")} label="Todos" />
        {Object.entries(types).map(([key, label]) => (
          <TypeBadge key={key} active={typeFilter === key} onClick={() => onTypeFilterChange(key)} label={label} />
        ))}
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        {equipment.map((item) => (
          <div key={item.id} className="p-2 rounded border border-border-default bg-bg-surface">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-primary">
                {item.brand} {item.model}
              </span>
              <span className="text-[8px] text-text-muted">{item.year_released}</span>
            </div>
            <p className="text-[9px] text-text-dim mt-0.5">{item.frequency_response_notes}</p>
            {item.dsp_capabilities.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-1">
                {item.dsp_capabilities.slice(0, 4).map((cap) => (
                  <span key={cap} className="text-[7px] px-1 py-0.5 rounded bg-accent/10 text-accent">
                    {cap}
                  </span>
                ))}
                {item.dsp_capabilities.length > 4 && (
                  <span className="text-[7px] text-text-muted">+{item.dsp_capabilities.length - 4}</span>
                )}
              </div>
            )}
          </div>
        ))}
        {equipment.length === 0 && (
          <p className="text-[10px] text-text-muted italic text-center py-4">Nenhum equipamento encontrado</p>
        )}
      </div>
    </div>
  );
}

function TypeBadge({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[8px] font-semibold transition-colors
        ${active ? "bg-accent/20 text-accent border border-accent/30" : "text-text-dim border border-border-default hover:text-text-secondary"}`}
    >
      {label}
    </button>
  );
}

// ────── Signal Flow Tab ──────

function SignalFlowTab() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-text-dim mb-1">
        Entenda como o sinal flui do palco até a medição.
      </p>

      <FlowStep
        number={1}
        title="Fonte de Sinal"
        desc="O som começa na mesa de som. Pode ser música, voz, ou ruído rosa gerado pelo AudioTec."
      />
      <FlowArrow />
      <FlowStep
        number={2}
        title="Sinal de Referência (CH1)"
        desc="Um aux send ou direct out da mesa vai para a entrada CH1 da interface de áudio. Este é o sinal 'limpo' — sem influência da sala."
      />
      <FlowArrow />
      <FlowStep
        number={3}
        title="Amplificação + Caixa de Som"
        desc="O sinal sai da mesa para o amplificador (ou caixa ativa) e é reproduzido no ambiente."
      />
      <FlowArrow />
      <FlowStep
        number={4}
        title="Propagação no Ambiente"
        desc="O som viaja pelo ar, sofre reflexões nas paredes, e é modificado pela acústica da sala."
      />
      <FlowArrow />
      <FlowStep
        number={5}
        title="Microfone de Medição (CH2)"
        desc="O microfone de medição capta o som na posição de escuta e envia para CH2 da interface."
      />
      <FlowArrow />
      <FlowStep
        number={6}
        title="AudioTec — Análise"
        desc="O software compara CH1 (referência) com CH2 (medição) via FFT. O resultado é a Função de Transferência do seu sistema + sala."
      />

      <div className="mt-3 p-2 rounded bg-accent/5 border border-accent/20">
        <p className="text-[10px] text-accent font-semibold mb-1">💡 Dica</p>
        <p className="text-[9px] text-text-dim leading-relaxed">
          A chave para uma boa medição é o sinal de referência. Sem ele (usando só o microfone),
          você vê o espectro do som na sala, mas não sabe o que é culpa do sistema e o que é culpa da sala.
        </p>
      </div>
    </div>
  );
}

function FlowStep({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex gap-2">
      <div className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold
                      flex items-center justify-center shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-text-primary">{title}</p>
        <p className="text-[9px] text-text-dim leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center">
      <div className="w-px h-3 bg-accent/30" />
    </div>
  );
}
