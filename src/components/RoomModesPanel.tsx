/**
 * RoomModesPanel — Room modal frequency calculator for rectangular enclosures.
 *
 * Computes axial, tangential, and oblique modes using Rust backend.
 * Shows mode list with Schroeder frequency and Bolt ratio.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RoomModesRequest, RoomModesResult, RoomMode } from "../types";

export default function RoomModesPanel() {
  const [length, setLength] = useState(8.0);
  const [width, setWidth] = useState(5.0);
  const [height, setHeight] = useState(3.0);
  const [temp, setTemp] = useState(22);
  const [maxFreq, setMaxFreq] = useState(300);
  const [result, setResult] = useState<RoomModesResult | null>(null);

  const calculate = useCallback(async () => {
    try {
      const req: RoomModesRequest = {
        length,
        width,
        height,
        temperatureC: temp,
        maxFrequency: maxFreq,
        maxOrder: 4,
      };
      const r = await invoke<RoomModesResult>("calculate_room_modes", { req });
      setResult(r);
    } catch (e) {
      console.error("RoomModes error:", e);
    }
  }, [length, width, height, temp, maxFreq]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  const modeColor = (m: RoomMode) => {
    switch (m.modeType) {
      case "axial": return "text-primary";
      case "tangential": return "text-tertiary";
      case "oblique": return "text-secondary";
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        Modos da Sala
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">L (m)</span>
          <input
            type="number"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={0.5}
            step={0.1}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">W (m)</span>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={0.5}
            step={0.1}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">H (m)</span>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={0.5}
            step={0.1}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
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
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim text-[10px]">Freq Máx (Hz)</span>
          <input
            type="number"
            value={maxFreq}
            onChange={(e) => setMaxFreq(Number(e.target.value))}
            className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            min={50}
            max={1000}
            step={10}
          />
        </label>
      </div>

      {/* Summary */}
      {result && (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-text-secondary">
            <span className="text-text-dim">Volume</span>
            <span className="text-right tabular-nums">{result.volume.toFixed(1)} m³</span>
            <span className="text-text-dim">Schroeder</span>
            <span className="text-right tabular-nums text-warning">{result.schroederFrequency.toFixed(0)} Hz</span>
            <span className="text-text-dim">Bolt Ratio</span>
            <span className="text-right tabular-nums">
              {result.boltRatio.map((r) => r.toFixed(2)).join(" : ")}
            </span>
            <span className="text-text-dim">Modos</span>
            <span className="text-right tabular-nums">{result.modes.length}</span>
          </div>

          {/* Legend */}
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="text-primary">● Axial</span>
            <span className="text-tertiary">● Tangencial</span>
            <span className="text-secondary">● Oblíquo</span>
          </div>

          {/* Mode list */}
          <div className="max-h-48 overflow-y-auto mt-1">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-text-dim uppercase">
                  <th className="text-left py-0.5">Hz</th>
                  <th className="text-center">n</th>
                  <th className="text-center">Tipo</th>
                  <th className="text-right">λ (m)</th>
                </tr>
              </thead>
              <tbody>
                {result.modes.slice(0, 40).map((m, i) => (
                  <tr key={i} className={`${modeColor(m)} border-t border-border-subtle`}>
                    <td className="py-0.5 tabular-nums">{m.frequency.toFixed(1)}</td>
                    <td className="text-center tabular-nums">
                      ({m.nx},{m.ny},{m.nz})
                    </td>
                    <td className="text-center capitalize">{m.modeType}</td>
                    <td className="text-right tabular-nums">{m.wavelengthM.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
