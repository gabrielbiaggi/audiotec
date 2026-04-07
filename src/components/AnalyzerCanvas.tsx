/**
 * AnalyzerCanvas — High-performance Canvas 2D component.
 *
 * Renders audio spectrum data directly via requestAnimationFrame,
 * bypassing React's Virtual DOM entirely. Data flows through refs,
 * not state — the canvas never causes a React re-render.
 */

import { useEffect, useRef } from "react";
import { renderFrame, type DrawOptions, type FrameData } from "../canvas/drawing";
import type { SpectrumData, ViewMode } from "../types";

interface AnalyzerCanvasProps {
  spectrumRef: React.RefObject<SpectrumData | null>;
  viewMode: ViewMode;
  showRef: boolean;
  showMeas: boolean;
  showCoherence: boolean;
  onFpsUpdate: (fps: number) => void;
}

/** Trace colors — high-contrast, no glow, per Smaart/OSM spec. */
const COLORS = {
  ref: "#00e5ff",       // Cyan — Reference
  meas: "#eeff41",      // Yellow fluorescent — Measurement
  transfer: "#00e5ff",  // Cyan — Transfer H1
  phase: "#ff4081",     // Magenta — Phase
};

export default function AnalyzerCanvas({
  spectrumRef,
  viewMode,
  showRef,
  showMeas,
  showCoherence,
  onFpsUpdate,
}: AnalyzerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);

  // Store options in refs so the RAF loop reads the latest without re-creating
  const optsRef = useRef<DrawOptions>({
    viewMode,
    showRef,
    showMeas,
    showCoherence,
    traceColors: COLORS,
  });

  // Sync props → optsRef (no re-render, no RAF restart)
  optsRef.current.viewMode = viewMode;
  optsRef.current.showRef = showRef;
  optsRef.current.showMeas = showMeas;
  optsRef.current.showCoherence = showCoherence;

  // ── Cursor tracking (imperative, no state) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      cursorRef.current = null;
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // ── RAF render loop — runs at display refresh rate ──
  useEffect(() => {
    let frameCount = 0;
    let lastFps = performance.now();

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // HiDPI scaling
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.round(rect.width * dpr);
      const ch = Math.round(rect.height * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Read spectrum directly from ref (no React state)
      const raw = spectrumRef.current;
      const frameData: FrameData | null = raw
        ? {
            frequencies: raw.frequencies,
            magnitudeRef: raw.magnitudeRef,
            magnitudeMeas: raw.magnitudeMeas,
            transferMagnitude: raw.transferMagnitude,
            transferPhase: raw.transferPhase,
            coherence: raw.coherence,
          }
        : null;

      renderFrame(ctx, rect.width, rect.height, frameData, cursorRef.current, optsRef.current);

      // FPS counter (fires onFpsUpdate at ~1Hz, not every frame)
      frameCount++;
      const now = performance.now();
      if (now - lastFps >= 1000) {
        onFpsUpdate(frameCount);
        frameCount = 0;
        lastFps = now;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spectrumRef, onFpsUpdate]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair"
    />
  );
}
