/**
 * WaveCalcPanel — Wavelength / Delay / Speed-of-Sound calculator.
 *
 * Temperature-dependent: c = 331.3 + 0.606 × T
 * Live calculation as user types.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WaveCalcRequest, WaveCalcResult } from "../types";

export default function WaveCalcPanel() {
  const [freq, setFreq] = useState(1000);
  const [distance, setDistance] = useState(1.0);
  const [temp, setTemp] = useState(22);
  const [result, setResult] = useState<WaveCalcResult | null>(null);

  const calculate = useCallback(async () => {
    try {
      const req: WaveCalcRequest = {
        frequencyHz: freq,
        distanceM: distance,
        temperatureC: temp,
      };
      const r = await invoke<WaveCalcResult>("calculate_wave", { req });
      setResult(r);
    } catch (e) {
      console.error("WaveCalc error:", e);
    }
  }, [freq, distance, temp]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        Calculadora de Onda
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Freq (Hz)</span>
          <input
            type="number"
            value={freq}
            onChange={(e) => setFreq(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={1}
            step={1}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Distância (m)</span>
          <input
            type="number"
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={0}
            step={0.01}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Temp (°C)</span>
          <input
            type="number"
            value={temp}
            onChange={(e) => setTemp(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={-40}
            max={60}
            step={0.5}
          />
        </label>
      </div>

      {/* Results */}
      {result && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-text-secondary">
          <Row label="Velocidade" value={`${result.speedOfSound.toFixed(1)} m/s`} />
          <Row label="Comp. Onda" value={`${result.wavelengthM.toFixed(3)} m`} />
          <Row label="Comp. Onda" value={`${result.wavelengthFt.toFixed(3)} ft`} />
          <Row label="Atraso" value={`${result.delayMs.toFixed(3)} ms`} />
          <Row label="Amostras @48k" value={result.delaySamples48k.toFixed(1)} />
          <Row label="Amostras @96k" value={result.delaySamples96k.toFixed(1)} />
          <Row label="Ciclos" value={result.cyclesInDistance.toFixed(2)} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-text-dim">{label}</span>
      <span className="text-primary tabular-nums text-right">{value}</span>
    </>
  );
}
