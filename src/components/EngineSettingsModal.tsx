/**
 * EngineSettingsModal — Modal for FFT, Window, Averaging, Device, and Sample Rate config.
 *
 * Hidden behind the gear icon in the ControlDesk. Opens as a centered dark modal
 * with pro-audio styling — no SaaS dialog chrome.
 */

import type { AudioDeviceInfo } from "../types";
import { FFT_SIZES, WINDOW_TYPES, AVERAGING_OPTIONS, SAMPLE_RATES } from "../types";
import ProButton from "./ui/ProButton";

interface EngineSettingsModalProps {
  open: boolean;
  onClose: () => void;
  running: boolean;

  devices: AudioDeviceInfo[];
  selectedDevice: string;
  onDeviceChange: (name: string) => void;

  fftSize: number;
  onFftSizeChange: (n: number) => void;
  windowType: string;
  onWindowTypeChange: (w: string) => void;
  numAverages: number;
  onNumAveragesChange: (n: number) => void;
  sampleRate: number;
  onSampleRateChange: (r: number) => void;
}

export default function EngineSettingsModal({
  open,
  onClose,
  running,
  devices,
  selectedDevice,
  onDeviceChange,
  fftSize,
  onFftSizeChange,
  windowType,
  onWindowTypeChange,
  numAverages,
  onNumAveragesChange,
  sampleRate,
  onSampleRateChange,
}: EngineSettingsModalProps) {
  if (!open) return null;

  const deviceInfo = devices.find((d) => d.name === selectedDevice);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#121212] border border-zinc-800/60 rounded-lg w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-[0.15em] text-zinc-300">
            Config. do Motor
          </h2>
          <ProButton onClick={onClose} icon size="sm" title="Fechar">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </ProButton>
        </div>

        {/* Settings grid */}
        <div className="flex flex-col gap-4">
          {/* Device */}
          <SettingRow label="Dispositivo">
            <select
              value={selectedDevice}
              onChange={(e) => onDeviceChange(e.target.value)}
              disabled={running}
              className="settings-select w-full"
            >
              {devices.map((d) => (
                <option key={d.name} value={d.name}>
                  [{d.host}] {d.name} ({d.maxChannels}ch)
                </option>
              ))}
              {devices.length === 0 && <option>Nenhum dispositivo</option>}
            </select>
          </SettingRow>

          {/* Sample Rate */}
          <SettingRow label="Taxa Amostr.">
            <select
              value={sampleRate}
              onChange={(e) => onSampleRateChange(Number(e.target.value))}
              disabled={running}
              className="settings-select"
            >
              {SAMPLE_RATES.map((r) => {
                const ok = deviceInfo?.sampleRates.includes(r);
                return (
                  <option key={r} value={r}>
                    {r / 1000}k{ok === false ? " (?)" : ""}
                  </option>
                );
              })}
            </select>
          </SettingRow>

          {/* FFT Size */}
          <SettingRow label="Tamanho FFT">
            <select
              value={fftSize}
              onChange={(e) => onFftSizeChange(Number(e.target.value))}
              disabled={running}
              className="settings-select"
            >
              {FFT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </SettingRow>

          {/* Window */}
          <SettingRow label="Função Janela">
            <select
              value={windowType}
              onChange={(e) => onWindowTypeChange(e.target.value)}
              disabled={running}
              className="settings-select"
            >
              {WINDOW_TYPES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </SettingRow>

          {/* Averaging */}
          <SettingRow label="Média">
            <select
              value={numAverages}
              onChange={(e) => onNumAveragesChange(Number(e.target.value))}
              disabled={running}
              className="settings-select"
            >
              {AVERAGING_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 1 ? "Desl." : `${n}×`}</option>
              ))}
            </select>
          </SettingRow>
        </div>

        {/* Footer hint */}
        <p className="mt-6 text-[11px] text-zinc-600 font-mono">
          {running ? "⚠ Pare o motor para alterar" : "Config. aplicada ao iniciar o motor"}
        </p>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-sans text-xs uppercase tracking-wider text-zinc-500 w-28 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}
