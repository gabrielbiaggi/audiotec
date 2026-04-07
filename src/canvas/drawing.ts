/**
 * Canvas drawing functions — pure imperative, zero React dependency.
 *
 * All functions receive explicit geometry parameters (px, py, pw, ph)
 * representing the plot area inside the canvas padding.
 */

import {
  FREQ_MIN,
  FREQ_MAX,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  PAD_BOTTOM,
  SPECTRUM_DB_MIN,
  SPECTRUM_DB_MAX,
  TRANSFER_DB_MIN,
  TRANSFER_DB_MAX,
  PHASE_MIN,
  PHASE_MAX,
  type ViewMode,
} from "../types";

// ─── Color tokens (CSS custom property values for canvas) ───────────

const GRID = "rgba(255,255,255,0.07)";
const GRID_MAJOR = "rgba(255,255,255,0.14)";
const GRID_TEXT = "rgba(255,255,255,0.32)";
const TEXT_MID = "rgba(255,255,255,0.60)";
const TEXT_BRIGHT = "#e8e8e8";
const COHERENCE_FILL = "rgba(139,92,246,0.35)";
const COHERENCE_STROKE = "rgba(139,92,246,0.75)";

// ─── Coordinate transforms ──────────────────────────────────────────

export function freqToX(freq: number, plotW: number): number {
  if (freq <= 0) return 0;
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * plotW;
}

export function xToFreq(x: number, plotW: number): number {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  return Math.pow(10, logMin + (x / plotW) * (logMax - logMin));
}

export function valToY(val: number, plotH: number, vMin: number, vMax: number): number {
  const clamped = Math.max(vMin, Math.min(vMax, val));
  return ((vMax - clamped) / (vMax - vMin)) * plotH;
}

export function yToVal(y: number, plotH: number, vMin: number, vMax: number): number {
  return vMax - (y / plotH) * (vMax - vMin);
}

/** Returns the plot area dimensions given the canvas logical size. */
export function plotRect(w: number, h: number) {
  return {
    px: PAD_LEFT,
    py: PAD_TOP,
    pw: w - PAD_LEFT - PAD_RIGHT,
    ph: h - PAD_TOP - PAD_BOTTOM,
  };
}

// ─── Grid drawing ───────────────────────────────────────────────────

const FREQ_LINES = [20, 31.5, 50, 63, 100, 125, 200, 250, 500, 1000, 2000, 4000, 8000, 10000, 16000, 20000];
const FREQ_LABELS = new Set([20, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000]);
const FREQ_MAJOR = new Set([20, 100, 1000, 10000]);

export function drawFreqDbGrid(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, pw: number, ph: number,
  dbMin: number, dbMax: number, dbStep: number,
) {
  ctx.save();

  // Frequency vertical lines
  ctx.font = "9px var(--font-mono, monospace)";
  ctx.textAlign = "center";

  for (const f of FREQ_LINES) {
    const x = px + freqToX(f, pw);
    ctx.strokeStyle = FREQ_MAJOR.has(f) ? GRID_MAJOR : GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x, py + ph);
    ctx.stroke();

    if (FREQ_LABELS.has(f)) {
      ctx.fillStyle = GRID_TEXT;
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, py + ph + 15);
    }
  }

  // dB horizontal lines
  ctx.textAlign = "right";
  for (let db = dbMin; db <= dbMax; db += dbStep) {
    const y = py + valToY(db, ph, dbMin, dbMax);
    const isZero = db === 0;
    ctx.strokeStyle = isZero ? GRID_MAJOR : GRID;
    ctx.lineWidth = isZero ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + pw, y);
    ctx.stroke();
    ctx.fillStyle = isZero ? TEXT_MID : GRID_TEXT;
    ctx.fillText(`${db}`, px - 6, y + 3);
  }

  // Y-axis label
  ctx.fillStyle = GRID_TEXT;
  ctx.font = "8px var(--font-mono, monospace)";
  ctx.textAlign = "center";
  ctx.save();
  ctx.translate(11, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("dBFS", 0, 0);
  ctx.restore();

  ctx.restore();
}

export function drawFreqPhaseGrid(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, pw: number, ph: number,
) {
  ctx.save();

  const labelFreqs = [20, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];
  ctx.font = "9px var(--font-mono, monospace)";
  ctx.textAlign = "center";
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;

  for (const f of labelFreqs) {
    const x = px + freqToX(f, pw);
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x, py + ph);
    ctx.stroke();
    ctx.fillStyle = GRID_TEXT;
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, py + ph + 15);
  }

  // Phase horizontal lines (every 45°)
  ctx.textAlign = "right";
  for (let deg = PHASE_MIN; deg <= PHASE_MAX; deg += 45) {
    const y = py + valToY(deg, ph, PHASE_MIN, PHASE_MAX);
    const isZero = deg === 0;
    ctx.strokeStyle = isZero ? GRID_MAJOR : GRID;
    ctx.lineWidth = isZero ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + pw, y);
    ctx.stroke();
    ctx.fillStyle = isZero ? TEXT_MID : GRID_TEXT;
    ctx.fillText(`${deg}°`, px - 6, y + 3);
  }

  // Y-axis label
  ctx.fillStyle = GRID_TEXT;
  ctx.font = "8px var(--font-mono, monospace)";
  ctx.textAlign = "center";
  ctx.save();
  ctx.translate(11, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("deg", 0, 0);
  ctx.restore();

  ctx.restore();
}

// ─── Data curves ────────────────────────────────────────────────────

/** Draw a single frequency-domain curve (generic: mag, phase, etc.) */
export function drawCurve(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, pw: number, ph: number,
  frequencies: ArrayLike<number>, values: ArrayLike<number>,
  color: string, lineWidth: number,
  vMin: number, vMax: number,
) {
  if (!frequencies.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i];
    if (f < FREQ_MIN || f > FREQ_MAX) continue;
    const x = px + freqToX(f, pw);
    const y = py + valToY(values[i], ph, vMin, vMax);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draw coherence as a filled area at the bottom 18% of plot. */
export function drawCoherenceFill(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, pw: number, ph: number,
  frequencies: ArrayLike<number>, coherence: ArrayLike<number>,
) {
  if (!frequencies.length) return;

  const cohH = ph * 0.18;
  const cohBase = py + ph;

  ctx.save();
  ctx.fillStyle = COHERENCE_FILL;
  ctx.strokeStyle = COHERENCE_STROKE;
  ctx.lineWidth = 1;
  ctx.beginPath();

  let started = false;
  let firstX = 0;

  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i];
    if (f < FREQ_MIN || f > FREQ_MAX) continue;
    const x = px + freqToX(f, pw);
    const y = cohBase - coherence[i] * cohH;
    if (!started) {
      firstX = x;
      ctx.moveTo(x, cohBase);
      ctx.lineTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  if (!started) {
    ctx.restore();
    return;
  }

  const lastX = px + freqToX(FREQ_MAX, pw);
  ctx.lineTo(lastX, cohBase);
  ctx.lineTo(firstX, cohBase);
  ctx.closePath();
  ctx.fill();

  // Stroke top edge for clarity
  ctx.beginPath();
  started = false;
  for (let i = 0; i < frequencies.length; i++) {
    const f = frequencies[i];
    if (f < FREQ_MIN || f > FREQ_MAX) continue;
    const x = px + freqToX(f, pw);
    const y = cohBase - coherence[i] * cohH;
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Cursor crosshair ───────────────────────────────────────────────

export function drawCursor(
  ctx: CanvasRenderingContext2D,
  mx: number, my: number,
  px: number, py: number, pw: number, ph: number,
  mode: ViewMode,
) {
  ctx.save();

  // Dashed crosshair
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(mx, py);
  ctx.lineTo(mx, py + ph);
  ctx.moveTo(px, my);
  ctx.lineTo(px + pw, my);
  ctx.stroke();
  ctx.setLineDash([]);

  // Readout values
  const freq = xToFreq(mx - px, pw);
  let valLabel: string;
  if (mode === "phase") {
    const deg = yToVal(my - py, ph, PHASE_MIN, PHASE_MAX);
    valLabel = `${deg.toFixed(1)}°`;
  } else {
    const dbMin = mode === "transfer" ? TRANSFER_DB_MIN : SPECTRUM_DB_MIN;
    const dbMax = mode === "transfer" ? TRANSFER_DB_MAX : SPECTRUM_DB_MAX;
    const db = yToVal(my - py, ph, dbMin, dbMax);
    valLabel = `${db.toFixed(1)} dB`;
  }

  const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(2)}k` : `${freq.toFixed(1)}`;
  const text = `${freqLabel} Hz  ${valLabel}`;

  // Readout tooltip
  ctx.font = "10px var(--font-mono, monospace)";
  const tw = ctx.measureText(text).width + 14;
  const bx = Math.min(mx + 12, px + pw - tw - 4);
  const by = Math.max(my - 24, py + 2);

  ctx.fillStyle = "rgba(0,0,0,0.80)";
  ctx.beginPath();
  ctx.roundRect(bx, by, tw, 18, 3);
  ctx.fill();
  ctx.fillStyle = TEXT_BRIGHT;
  ctx.textAlign = "left";
  ctx.fillText(text, bx + 7, by + 13);

  ctx.restore();
}

// ─── Full frame render ──────────────────────────────────────────────

export interface FrameData {
  frequencies: ArrayLike<number>;
  magnitudeRef: ArrayLike<number>;
  magnitudeMeas: ArrayLike<number>;
  transferMagnitude: ArrayLike<number>;
  transferPhase: ArrayLike<number>;
  coherence: ArrayLike<number>;
}

export interface DrawOptions {
  viewMode: ViewMode;
  showRef: boolean;
  showMeas: boolean;
  showCoherence: boolean;
  traceColors: {
    ref: string;
    meas: string;
    transfer: string;
    phase: string;
  };
}

/**
 * Renders a full frame: clear → grid → data curves → coherence → cursor.
 * Called from requestAnimationFrame, completely outside React reconciliation.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: FrameData | null,
  cursor: { x: number; y: number } | null,
  opts: DrawOptions,
) {
  const { px, py, pw, ph } = plotRect(w, h);

  // Clear
  ctx.fillStyle = "#0e0e14";
  ctx.fillRect(0, 0, w, h);

  // Grid
  if (opts.viewMode === "spectrum") {
    drawFreqDbGrid(ctx, px, py, pw, ph, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, 6);
  } else if (opts.viewMode === "transfer") {
    drawFreqDbGrid(ctx, px, py, pw, ph, TRANSFER_DB_MIN, TRANSFER_DB_MAX, 6);
  } else {
    drawFreqPhaseGrid(ctx, px, py, pw, ph);
  }

  // Data
  if (data) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    if (opts.viewMode === "spectrum") {
      if (opts.showRef)
        drawCurve(ctx, px, py, pw, ph, data.frequencies, data.magnitudeRef,
          opts.traceColors.ref, 2, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX);
      if (opts.showMeas)
        drawCurve(ctx, px, py, pw, ph, data.frequencies, data.magnitudeMeas,
          opts.traceColors.meas, 2, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX);
    } else if (opts.viewMode === "transfer") {
      drawCurve(ctx, px, py, pw, ph, data.frequencies, data.transferMagnitude,
        opts.traceColors.transfer, 2, TRANSFER_DB_MIN, TRANSFER_DB_MAX);
      if (opts.showCoherence)
        drawCoherenceFill(ctx, px, py, pw, ph, data.frequencies, data.coherence);
    } else {
      drawCurve(ctx, px, py, pw, ph, data.frequencies, data.transferPhase,
        opts.traceColors.phase, 1.5, PHASE_MIN, PHASE_MAX);
      if (opts.showCoherence)
        drawCoherenceFill(ctx, px, py, pw, ph, data.frequencies, data.coherence);
    }

    ctx.restore();
  }

  // Cursor
  if (cursor && cursor.x >= px && cursor.x <= px + pw && cursor.y >= py && cursor.y <= py + ph) {
    drawCursor(ctx, cursor.x, cursor.y, px, py, pw, ph, opts.viewMode);
  }
}
