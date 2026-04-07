/**
 * AutoEqPanel — Automatic PEQ matching (measured vs target).
 *
 * Runs auto-EQ algorithm on the Rust backend and displays the proposed
 * PEQ filter bands with a "Push to Console" button for X32 integration.
 */

import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AutoEqRequest, AutoEqResult, PeqBand, OscEqTarget } from "../types";

interface AutoEqPanelProps {
  /** Currently displayed frequencies (from last measurement) */
  frequencies: number[];
  /** Currently displayed measured magnitude dB */
  measuredDb: number[];
  /** Whether OSC is connected */
  oscConnected: boolean;
}

export default function AutoEqPanel({ frequencies, measuredDb, oscConnected }: AutoEqPanelProps) {
  const [targetType, setTargetType] = useState<"flat" | "xCurve" | "custom">("flat");
  const [maxBoost, setMaxBoost] = useState(6);
  const [threshold, setThreshold] = useState(3);
  const [maxBands, setMaxBands] = useState(8);
  const [result, setResult] = useState<AutoEqResult | null>(null);
  const [pushing, setPushing] = useState(false);
  const [oscChannel, setOscChannel] = useState(1);
  const [oscTarget, setOscTarget] = useState<"ch" | "bus">("ch");

  const generateTarget = useCallback((): number[] => {
    if (targetType === "flat") {
      return new Array(frequencies.length).fill(0);
    }
    if (targetType === "xCurve") {
      // X-Curve: flat to 2kHz, -3dB/octave above
      return frequencies.map((f) => {
        if (f <= 2000) return 0;
        const octaves = Math.log2(f / 2000);
        return -3 * octaves;
      });
    }
    return new Array(frequencies.length).fill(0);
  }, [frequencies, targetType]);

  const runAutoEq = useCallback(async () => {
    if (frequencies.length === 0 || measuredDb.length === 0) return;
    try {
      const req: AutoEqRequest = {
        frequencies: Array.from(frequencies),
        measuredDb: Array.from(measuredDb),
        targetDb: generateTarget(),
        maxBoostDb: maxBoost,
        thresholdDb: threshold,
        maxBands,
        smoothingResolution: 48,
      };
      const r = await invoke<AutoEqResult>("compute_auto_eq", { req });
      setResult(r);
    } catch (e) {
      console.error("AutoEQ error:", e);
    }
  }, [frequencies, measuredDb, generateTarget, maxBoost, threshold, maxBands]);

  const pushToConsole = useCallback(async () => {
    if (!result || result.bands.length === 0) return;
    setPushing(true);
    try {
      const target: OscEqTarget = { targetType: oscTarget, number: oscChannel };
      await invoke("osc_push_eq", { target, bands: result.bands });
    } catch (e) {
      console.error("Push EQ failed:", e);
    } finally {
      setPushing(false);
    }
  }, [result, oscTarget, oscChannel]);

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        Auto-EQ
      </div>

      {/* Config */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Alvo</span>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as typeof targetType)}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
          >
            <option value="flat">Plano (0 dB)</option>
            <option value="xCurve">X-Curve</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Máx Bandas</span>
          <input
            type="number"
            value={maxBands}
            onChange={(e) => setMaxBands(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={1}
            max={12}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Máx Boost (dB)</span>
          <input
            type="number"
            value={maxBoost}
            onChange={(e) => setMaxBoost(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={0}
            max={12}
            step={0.5}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Limiar (dB)</span>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={1}
            max={10}
            step={0.5}
          />
        </label>
      </div>

      {/* Run button */}
      <button
        onClick={runAutoEq}
        disabled={frequencies.length === 0}
        className="mt-1 px-3 py-1.5 rounded bg-primary/20 text-primary border border-primary/40
                   hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed
                   text-xs font-sans uppercase tracking-wider transition-colors"
      >
        Calcular Auto-EQ
      </button>

      {/* Results */}
      {result && (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-text-secondary">
            <span className="text-text-dim">RMS Antes</span>
            <span className="text-right tabular-nums text-danger">{result.rmsErrorBefore.toFixed(1)} dB</span>
            <span className="text-text-dim">RMS Depois</span>
            <span className="text-right tabular-nums text-success">{result.rmsErrorAfter.toFixed(1)} dB</span>
            <span className="text-text-dim">Bandas</span>
            <span className="text-right tabular-nums">{result.bands.length}</span>
          </div>

          {/* PEQ Band table */}
          {result.bands.length > 0 && (
            <div className="max-h-36 overflow-y-auto mt-1">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-text-dim uppercase">
                    <th className="text-left py-0.5">#</th>
                    <th className="text-right">Freq</th>
                    <th className="text-right">Gain</th>
                    <th className="text-right">Q</th>
                    <th className="text-right">BW</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bands.map((b: PeqBand, i: number) => (
                    <tr key={i} className="border-t border-border-subtle">
                      <td className="py-0.5 text-text-dim">{i + 1}</td>
                      <td className="text-right tabular-nums text-primary">
                        {b.frequency >= 1000
                          ? `${(b.frequency / 1000).toFixed(1)}k`
                          : `${b.frequency.toFixed(0)}`}
                      </td>
                      <td
                        className={`text-right tabular-nums ${
                          b.gainDb < 0 ? "text-secondary" : "text-warning"
                        }`}
                      >
                        {b.gainDb > 0 ? "+" : ""}
                        {b.gainDb.toFixed(1)}
                      </td>
                      <td className="text-right tabular-nums">{b.q.toFixed(1)}</td>
                      <td className="text-right tabular-nums text-text-dim">
                        {b.bandwidthOct.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Push to Console */}
          <div className="flex items-end gap-2 mt-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim text-[10px]">Alvo</span>
              <select
                value={oscTarget}
                onChange={(e) => setOscTarget(e.target.value as "ch" | "bus")}
                className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
              >
                <option value="ch">Canal</option>
                <option value="bus">Bus</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim text-[10px]">#</span>
              <input
                type="number"
                value={oscChannel}
                onChange={(e) => setOscChannel(Number(e.target.value))}
                className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs w-12"
                min={1}
                max={oscTarget === "bus" ? 16 : 32}
              />
            </label>
            <button
              onClick={pushToConsole}
              disabled={!oscConnected || result.bands.length === 0 || pushing}
              className="px-3 py-1.5 rounded bg-warning/20 text-warning border border-warning/40
                         hover:bg-warning/30 disabled:opacity-30 disabled:cursor-not-allowed
                         text-xs font-sans uppercase tracking-wider transition-colors"
            >
              {pushing ? "Enviando..." : "Enviar ao Console"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
