/**
 * AiDiagnosticsPanel — Painel de diagnóstico autônomo via IA.
 *
 * Analisa espectro em tempo real, identifica problemas acústicos
 * e fornece instruções específicas por equipamento (DCX2496, X32, etc.).
 */

import { useCallback, useRef, useState } from "react";
import type { SpectrumData } from "../types";
import { analyzeWithAi, summarizeSpectrum, type AiMessage } from "../services/openrouter";

/** Generate fake spectrum data for testing without real audio engine */
function generateTestSpectrum(): SpectrumData {
  const fftSize = 4096;
  const sampleRate = 48000;
  const binCount = fftSize / 2;
  const frequencies: number[] = [];
  const magnitudeRef: number[] = [];
  const magnitudeMeas: number[] = [];
  const transferMagnitude: number[] = [];
  const transferPhase: number[] = [];
  const coherence: number[] = [];

  for (let i = 0; i < binCount; i++) {
    const f = (i * sampleRate) / fftSize;
    frequencies.push(f);

    // Pink noise reference (-3dB/octave slope)
    const refDb = f > 0 ? -10 * Math.log10(f / 20) + (Math.random() - 0.5) * 2 : -90;
    magnitudeRef.push(Math.max(-90, Math.min(6, refDb)));

    // Measured = reference + room response (resonance at 125Hz, null at 250Hz, bump at 4kHz)  
    let roomEffect = 0;
    if (f > 0) {
      // Room resonance at ~125 Hz
      roomEffect += 8 * Math.exp(-0.5 * ((f - 125) / 30) ** 2);
      // Null at ~250 Hz (phase cancellation)
      roomEffect -= 12 * Math.exp(-0.5 * ((f - 250) / 40) ** 2);
      // HF boost at 4kHz (horn directionality)
      roomEffect += 5 * Math.exp(-0.5 * ((f - 4000) / 800) ** 2);
      // General HF rolloff
      roomEffect -= f > 8000 ? (f - 8000) / 2000 * 4 : 0;
    }
    const measDb = refDb + roomEffect + (Math.random() - 0.5) * 3;
    magnitudeMeas.push(Math.max(-90, Math.min(6, measDb)));

    // Transfer function (difference)
    transferMagnitude.push(roomEffect + (Math.random() - 0.5) * 1.5);
    // Phase with some wraps
    transferPhase.push(Math.sin(f / 500) * 90 + (Math.random() - 0.5) * 20);
    // Coherence (high at low freq, drops in nulls)
    const coh = Math.max(0, Math.min(1, 0.95 - Math.abs(roomEffect) * 0.02 + (Math.random() - 0.5) * 0.1));
    coherence.push(coh);
  }

  return { frequencies, magnitudeRef, magnitudeMeas, transferMagnitude, transferPhase, coherence, sampleRate, fftSize };
}

const EQUIPAMENTOS = [
  { id: "dcx2496", label: "Behringer DCX2496" },
  { id: "deq2496", label: "Behringer DEQ2496" },
  { id: "x32", label: "Behringer X32 / M32" },
  { id: "driverack", label: "DBX DriveRack PA2" },
  { id: "yamaha-cl", label: "Yamaha CL / QL" },
  { id: "outro", label: "Outro" },
] as const;

interface AiDiagnosticsPanelProps {
  spectrumRef: React.RefObject<SpectrumData | null>;
  roomLength: number;
  roomWidth: number;
  roomHeight: number;
}

export default function AiDiagnosticsPanel({
  spectrumRef,
  roomLength,
  roomWidth,
  roomHeight,
}: AiDiagnosticsPanelProps) {
  const [equipment, setEquipment] = useState("dcx2496");
  const [customEquip, setCustomEquip] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<AiMessage[]>([]);

  const equipLabel = EQUIPAMENTOS.find(e => e.id === equipment)?.label ?? customEquip;

  const handleAnalyze = useCallback(async () => {
    let data = spectrumRef.current;
    if (!data) {
      setError("Sem dados de espectro. Inicie o motor, simulação, ou use 'Simular Dados'.");
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const spectrumSummary = summarizeSpectrum(data);
      const roomInfo = roomLength > 0
        ? `Sala: ${roomLength}m (C) × ${roomWidth}m (L) × ${roomHeight}m (A) — Volume: ${(roomLength * roomWidth * roomHeight).toFixed(1)} m³`
        : "";

      const equipName = equipment === "outro" ? customEquip : equipLabel;
      const result = await analyzeWithAi(spectrumSummary, roomInfo, equipName, historyRef.current);

      historyRef.current = [
        ...historyRef.current,
        { role: "user" as const, content: spectrumSummary },
        { role: "assistant" as const, content: result },
      ].slice(-6); // keep last 3 turns

      setResponse(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido na análise");
    } finally {
      setAnalyzing(false);
    }
  }, [spectrumRef, roomLength, roomWidth, roomHeight, equipment, customEquip, equipLabel]);

  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        Diagnóstico IA
      </div>

      {/* Equipment selector */}
      <label className="flex flex-col gap-0.5">
        <span className="text-text-dim text-[10px]">Equipamento / Processador</span>
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
        >
          {EQUIPAMENTOS.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.label}</option>
          ))}
        </select>
      </label>

      {equipment === "outro" && (
        <input
          value={customEquip}
          onChange={(e) => setCustomEquip(e.target.value)}
          placeholder="Nome do equipamento..."
          className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
        />
      )}

      {/* Simulate test data button */}
      <button
        onClick={() => {
          (spectrumRef as React.MutableRefObject<SpectrumData | null>).current = generateTestSpectrum();
          setError(null);
          setResponse(null);
        }}
        className="px-3 py-1.5 rounded bg-secondary/20 text-secondary border border-secondary/40
                   hover:bg-secondary/30 text-xs font-sans uppercase tracking-wider transition-colors
                   flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-sm">science</span>
        Simular Dados
      </button>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="mt-1 px-3 py-1.5 rounded bg-tertiary/20 text-tertiary border border-tertiary/40
                   hover:bg-tertiary/30 disabled:opacity-50 disabled:cursor-wait
                   text-xs font-sans uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-sm">
          {analyzing ? "hourglass_top" : "psychology"}
        </span>
        {analyzing ? "Analisando..." : "Analisar Espectro"}
      </button>

      {/* Error */}
      {error && (
        <div className="text-danger text-[10px] bg-danger/10 border border-danger/30 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* AI Response */}
      {response && (
        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-tertiary uppercase tracking-wider">
            <span className="material-symbols-outlined text-sm">smart_toy</span>
            Resultado da Análise
          </div>
          <div className="bg-bg-surface border border-border-default rounded p-2 text-[11px] leading-relaxed text-text-secondary max-h-80 overflow-y-auto whitespace-pre-wrap">
            {response}
          </div>
          <button
            onClick={() => { setResponse(null); historyRef.current = []; }}
            className="text-[10px] text-text-dim hover:text-text-secondary transition-colors self-end"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Hint */}
      {!response && !error && !analyzing && (
        <p className="text-[10px] text-text-dim leading-relaxed mt-1">
          A IA analisa o espectro atual e dá instruções específicas
          para o seu equipamento. Inicie uma medição ou simulação primeiro.
        </p>
      )}
    </div>
  );
}
