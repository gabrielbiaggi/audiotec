/**
 * useTauriEvent — High-performance hook for Tauri events.
 *
 * Architecture:
 * - Stores the latest event payload in a MutableRefObject (NOT useState)
 *   to bypass React's Virtual DOM reconciliation cycle entirely.
 * - The consumer (canvas RAF loop) reads directly from the ref.
 * - For binary payloads (`audio-frame`), decodes a flat Float32Array into
 *   typed sub-arrays using zero-copy subarray views.
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SpectrumData, AudioFrameBinary } from "../types";

// ─── JSON path — spectrum-data event ────────────────────────────────

/**
 * Subscribes to the `spectrum-data` Tauri event (JSON payload).
 * Returns a ref that always points to the latest SpectrumData or null.
 */
export function useSpectrumEvent(): React.RefObject<SpectrumData | null> {
  const ref = useRef<SpectrumData | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: UnlistenFn | undefined;

    listen<SpectrumData>("spectrum-data", (ev) => {
      ref.current = ev.payload;
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  return ref;
}

// ─── Binary path — audio-frame event ────────────────────────────────

/**
 * Decodes a binary audio frame payload into typed Float32Array views.
 *
 * Wire format (little-endian Float32):
 *   [sampleRate, fftSize, ...frequencies, ...magRef, ...magMeas,
 *    ...transferMag, ...transferPhase, ...coherence]
 *
 * Total = 2 header floats + 6 * binCount data floats.
 */
function decodeBinaryFrame(buffer: ArrayBuffer): AudioFrameBinary | null {
  const floats = new Float32Array(buffer);
  if (floats.length < 8) return null; // minimum sanity

  const sampleRate = floats[0];
  const fftSize = floats[1];
  const binCount = (floats.length - 2) / 6;

  if (!Number.isInteger(binCount) || binCount < 1) return null;

  let offset = 2;
  const frequencies = floats.subarray(offset, offset + binCount);
  offset += binCount;
  const magnitudeRef = floats.subarray(offset, offset + binCount);
  offset += binCount;
  const magnitudeMeas = floats.subarray(offset, offset + binCount);
  offset += binCount;
  const transferMagnitude = floats.subarray(offset, offset + binCount);
  offset += binCount;
  const transferPhase = floats.subarray(offset, offset + binCount);
  offset += binCount;
  const coherence = floats.subarray(offset, offset + binCount);

  return {
    sampleRate,
    fftSize,
    frequencies,
    magnitudeRef,
    magnitudeMeas,
    transferMagnitude,
    transferPhase,
    coherence,
  };
}

/**
 * Subscribes to the `audio-frame` Tauri event (binary payload).
 * Decodes the ArrayBuffer into zero-copy Float32Array sub-views.
 * Returns a ref to the latest frame (or null).
 */
export function useAudioFrameEvent(): React.RefObject<AudioFrameBinary | null> {
  const ref = useRef<AudioFrameBinary | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: UnlistenFn | undefined;

    listen<ArrayBuffer>("audio-frame", (ev) => {
      const decoded = decodeBinaryFrame(ev.payload);
      if (decoded) {
        ref.current = decoded;
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  return ref;
}
