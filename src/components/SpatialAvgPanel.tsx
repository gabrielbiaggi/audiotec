/**
 * SpatialAvgPanel — RMS spatial averaging of multiple stored traces.
 *
 * Allows selecting which stored traces to include in the average,
 * then computes via Rust backend (power-avg magnitude, complex-avg phase).
 */

import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StoredTrace, SpatialAverageResult } from "../types";

interface SpatialAvgPanelProps {
  storedTraces: StoredTrace[];
}

export default function SpatialAvgPanel({ storedTraces }: SpatialAvgPanelProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<SpatialAverageResult | null>(null);

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const compute = useCallback(async () => {
    const traces = Array.from(selected).map((i) => storedTraces[i]);
    if (traces.length < 2) return;
    try {
      const r = await invoke<SpatialAverageResult>("compute_spatial_average", { traces });
      setResult(r);
    } catch (e) {
      console.error("Spatial average error:", e);
    }
  }, [selected, storedTraces]);

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        Média Espacial
      </div>

      {storedTraces.length === 0 ? (
        <span className="text-text-dim text-[10px]">Nenhum traço salvo disponível.</span>
      ) : (
        <>
          {/* Trace selector */}
          <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {storedTraces.map((t, i) => (
              <label
                key={i}
                className="flex items-center gap-2 cursor-pointer hover:bg-bg-elevated/40 px-1 py-0.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="accent-primary"
                />
                <span className="text-text-secondary">{t.label}</span>
                <span className="text-text-dim text-[10px] ml-auto">
                  {t.frequencies.length} pts
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={compute}
            disabled={selected.size < 2}
            className="mt-1 px-3 py-1.5 rounded bg-primary/20 text-primary border border-primary/40
                       hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed
                       text-xs font-sans uppercase tracking-wider transition-colors"
          >
            Calcular Média ({selected.size} traços)
          </button>
        </>
      )}

      {/* Result summary */}
      {result && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-text-secondary">
          <span className="text-text-dim">Traços na Média</span>
          <span className="text-right tabular-nums text-primary">{result.numTraces}</span>
          <span className="text-text-dim">Pontos Freq</span>
          <span className="text-right tabular-nums">{result.frequencies.length}</span>
          <span className="text-text-dim">Faixa dB</span>
          <span className="text-right tabular-nums">
            {Math.min(...result.magnitudeDb).toFixed(1)} …{" "}
            {Math.max(...result.magnitudeDb).toFixed(1)} dB
          </span>
        </div>
      )}
    </div>
  );
}
