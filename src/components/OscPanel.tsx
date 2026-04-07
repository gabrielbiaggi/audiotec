/**
 * OscPanel — OSC connection manager for Behringer X32 / Midas M32.
 *
 * Connects to X32 via UDP OSC, shows status, and provides
 * keepalive / raw-send controls.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { OscConfig, OscStatus } from "../types";

interface OscPanelProps {
  onStatusChange?: (connected: boolean) => void;
}

export default function OscPanel({ onStatusChange }: OscPanelProps) {
  const [host, setHost] = useState("192.168.1.100");
  const [port, setPort] = useState(10023);
  const [status, setStatus] = useState<OscStatus | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<OscStatus>("osc_status");
      setStatus(s);
      onStatusChange?.(s.connected);
    } catch (e) {
      console.error("OSC status error:", e);
    }
  }, [onStatusChange]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const config: OscConfig = { host, port };
      await invoke("osc_connect", { config });
      await refresh();
    } catch (e) {
      console.error("OSC connect error:", e);
    } finally {
      setConnecting(false);
    }
  }, [host, port, refresh]);

  const disconnect = useCallback(async () => {
    try {
      await invoke("osc_disconnect");
      await refresh();
    } catch (e) {
      console.error("OSC disconnect error:", e);
    }
  }, [refresh]);

  const connected = status?.connected ?? false;

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono">
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mb-1">
        OSC / X32
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-danger"}`}
        />
        <span className={`text-xs ${connected ? "text-success" : "text-text-dim"}`}>
          {connected ? `Conectado a ${status!.host}:${status!.port}` : "Desconectado"}
        </span>
      </div>

      {/* Connection form */}
      {!connected && (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-0.5 flex-1">
            <span className="text-text-dim text-[10px]">Host</span>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
              className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
            />
          </label>
          <label className="flex flex-col gap-0.5 w-16">
            <span className="text-text-dim text-[10px]">Porta</span>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="bg-bg-surface border border-border-default rounded px-1.5 py-1 text-text-primary text-xs"
              min={1}
              max={65535}
            />
          </label>
          <button
            onClick={connect}
            disabled={connecting || !host}
            className="px-3 py-1.5 rounded bg-success/20 text-success border border-success/40
                       hover:bg-success/30 disabled:opacity-30 disabled:cursor-not-allowed
                       text-xs font-sans uppercase tracking-wider transition-colors"
          >
            {connecting ? "..." : "Conectar"}
          </button>
        </div>
      )}

      {connected && (
        <button
          onClick={disconnect}
          className="px-3 py-1.5 rounded bg-danger/20 text-danger border border-danger/40
                     hover:bg-danger/30 text-xs font-sans uppercase tracking-wider transition-colors w-fit"
        >
          Desconectar
        </button>
      )}

      {/* Last error */}
      {status?.lastError && (
        <div className="text-[10px] text-danger/80 mt-1 break-all">
          {status.lastError}
        </div>
      )}
    </div>
  );
}
