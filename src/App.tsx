import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ─── Types matching Rust SpectrumData (camelCase via serde) ─────────

interface SpectrumData {
  frequencies: number[];
  magnitudeRef: number[];
  magnitudeMeas: number[];
  transferMagnitude: number[];
  transferPhase: number[];
  coherence: number[];
  sampleRate: number;
  fftSize: number;
}

interface AudioDeviceInfo {
  name: string;
  sampleRates: number[];
  maxChannels: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const DB_MIN = -90;
const DB_MAX = 6;
const FREQ_MIN = 20;
const FREQ_MAX = 20_000;

const GRID_COLOR = "rgba(255,255,255,0.08)";
const GRID_TEXT_COLOR = "rgba(255,255,255,0.35)";
const REF_COLOR = "#3b82f6"; // blue — Reference channel
const MEAS_COLOR = "#f59e0b"; // amber — Measurement channel
const TRANSFER_COLOR = "#10b981"; // emerald — Transfer function
const COHERENCE_COLOR = "rgba(139,92,246,0.5)"; // violet — Coherence

// ─── App Component ──────────────────────────────────────────────────

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumRef = useRef<SpectrumData | null>(null);
  const rafRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [fps, setFps] = useState(0);

  // ── Load devices on mount ─────────────────────────────────────

  useEffect(() => {
    invoke<AudioDeviceInfo[]>("list_devices")
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0) setSelectedDevice(devs[0].name);
      })
      .catch(console.error);
  }, []);

  // ── Subscribe to spectrum events ──────────────────────────────

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<SpectrumData>("spectrum-data", (event) => {
      spectrumRef.current = event.payload;
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // ── Canvas render loop (requestAnimationFrame @ 60fps) ────────

  useEffect(() => {
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Handle HiDPI
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);

      // Draw grid
      drawGrid(ctx, w, h);

      // Draw spectrum if data is available
      const data = spectrumRef.current;
      if (data) {
        drawSpectrum(ctx, w, h, data.frequencies, data.magnitudeRef, REF_COLOR, 2);
        drawSpectrum(ctx, w, h, data.frequencies, data.magnitudeMeas, MEAS_COLOR, 2);
        drawSpectrum(ctx, w, h, data.frequencies, data.transferMagnitude, TRANSFER_COLOR, 1.5);
        drawCoherence(ctx, w, h, data.frequencies, data.coherence);
      }

      // FPS counter
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = now;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Engine controls ───────────────────────────────────────────

  const handleStart = useCallback(async () => {
    try {
      await invoke("start_engine", {
        config: {
          fftSize: 4096,
          windowType: "Hann",
          sampleRate: 48000,
          deviceName: selectedDevice || null,
        },
      });
      setRunning(true);
    } catch (e) {
      console.error("Start engine failed:", e);
    }
  }, [selectedDevice]);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_engine");
      setRunning(false);
      spectrumRef.current = null;
    } catch (e) {
      console.error("Stop engine failed:", e);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.logo}>AudioTec</span>
          <span style={styles.version}>v0.1.0</span>
        </div>

        <div style={styles.toolbarCenter}>
          <select
            style={styles.select}
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={running}
          >
            {devices.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.maxChannels}ch)
              </option>
            ))}
            {devices.length === 0 && <option>No devices</option>}
          </select>

          <button
            style={{
              ...styles.button,
              backgroundColor: running ? "#ef4444" : "#10b981",
            }}
            onClick={running ? handleStop : handleStart}
          >
            {running ? "■ Stop" : "▶ Start"}
          </button>
        </div>

        <div style={styles.toolbarRight}>
          <span style={styles.fps}>{fps} fps</span>
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <LegendItem color={REF_COLOR} label="Reference (CH1)" />
        <LegendItem color={MEAS_COLOR} label="Measurement (CH2)" />
        <LegendItem color={TRANSFER_COLOR} label="Transfer Function" />
        <LegendItem color={COHERENCE_COLOR} label="Coherence" />
      </div>

      {/* Spectrum canvas */}
      <canvas ref={canvasRef} style={styles.canvas} />
    </div>
  );
}

// ─── Canvas drawing helpers ─────────────────────────────────────────

/** Map frequency (Hz) to X pixel using log scale */
function freqToX(freq: number, width: number): number {
  if (freq <= 0) return 0;
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
}

/** Map dB value to Y pixel (linear scale) */
function dbToY(db: number, height: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return ((DB_MAX - clamped) / (DB_MAX - DB_MIN)) * height;
}

/** Draw log-frequency grid with dB scale */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();

  // Frequency grid lines (decades + standard octave frequencies)
  const freqLines = [20, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000];
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.font = "10px monospace";
  ctx.fillStyle = GRID_TEXT_COLOR;
  ctx.textAlign = "center";

  for (const f of freqLines) {
    const x = freqToX(f, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    ctx.fillText(label, x, h - 4);
  }

  // dB grid lines (every 6 dB)
  ctx.textAlign = "left";
  for (let db = DB_MIN; db <= DB_MAX; db += 6) {
    const y = dbToY(db, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${db} dB`, 4, y - 3);
  }

  ctx.restore();
}

/** Draw a spectrum curve on the canvas */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frequencies: number[],
  magnitudes: number[],
  color: string,
  lineWidth: number
) {
  if (frequencies.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < frequencies.length; i++) {
    const freq = frequencies[i];
    if (freq < FREQ_MIN || freq > FREQ_MAX) continue;

    const x = freqToX(freq, w);
    const y = dbToY(magnitudes[i], h);

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Draw coherence as a filled area (0–1 mapped to bottom portion of canvas) */
function drawCoherence(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frequencies: number[],
  coherence: number[]
) {
  if (frequencies.length === 0) return;

  const cohHeight = h * 0.15; // Coherence area is 15% of canvas height at the bottom
  const cohBase = h;

  ctx.save();
  ctx.fillStyle = COHERENCE_COLOR;
  ctx.beginPath();

  let started = false;
  let firstX = 0;

  for (let i = 0; i < frequencies.length; i++) {
    const freq = frequencies[i];
    if (freq < FREQ_MIN || freq > FREQ_MAX) continue;

    const x = freqToX(freq, w);
    const y = cohBase - coherence[i] * cohHeight;

    if (!started) {
      firstX = x;
      ctx.moveTo(x, cohBase);
      ctx.lineTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Close the path back to baseline
  ctx.lineTo(freqToX(FREQ_MAX, w), cohBase);
  ctx.lineTo(firstX, cohBase);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Small components ───────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 14, height: 3, backgroundColor: color, borderRadius: 2 }} />
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{label}</span>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100vh",
    backgroundColor: "#0a0a0f",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    backgroundColor: "#111118",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  toolbarCenter: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  toolbarRight: {
    display: "flex",
    alignItems: "center",
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    color: "#10b981",
    letterSpacing: "-0.5px",
  },
  version: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  select: {
    backgroundColor: "#1a1a24",
    color: "#e0e0e0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
    minWidth: 220,
  },
  button: {
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "6px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.3px",
  },
  fps: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontFamily: "monospace",
  },
  legend: {
    display: "flex",
    gap: 16,
    padding: "4px 16px",
    backgroundColor: "#0d0d14",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    flexShrink: 0,
  },
  canvas: {
    flex: 1,
    width: "100%",
    display: "block",
  },
};
