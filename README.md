# AudioTec

Professional acoustic measurement and alignment software built with Tauri + Rust + React.

## Architecture

```
┌─────────────────┐     ringbuf      ┌─────────────────┐     mpsc      ┌────────────┐
│  CPAL callback  │ ──────────────▶  │  DSP Thread     │ ───────────▶ │  Tauri IPC  │
│  (RT priority)  │   lock-free      │  (FFT + window) │   channel    │  (events)   │
└─────────────────┘                  └─────────────────┘              └────────────┘
```

- **Backend/Core DSP**: Rust with `cpal` (ASIO/CoreAudio/ALSA), `rustfft`, lock-free ring buffers
- **Frontend/UI**: React + TypeScript + Vite, real-time Canvas rendering at 60fps
- **Desktop Shell**: Tauri v2 (native window, IPC events)
- **Database**: SQLite via `rusqlite` (sessions, traces, calibration curves)

## Features (Architecture Ready)

1. **Transfer Function** — Dual-Channel FFT (H1 Estimator), Magnitude, Phase, Coherence
2. **RTA & Spectrogram** — 1/1 to 1/48 octave resolution, Waterfall
3. **Delay Finder** — Manual and automatic time alignment
4. **Impulse Response** — Log Sweep, MLS, RT60, C50/C80, STI/STIPA
5. **SPL Meter** — A/C/Z weighting (IEC 61672), Leq, Peak, RMS
6. **Signal Generator** — Pink/White noise, Swept Sine, Multi-tone, WAV playback
7. **Impedance** — Thiele-Small parameters
8. **Math Operations** — Virtual sum, difference, average between measurements

## Stack

| Layer | Technology |
|-------|-----------|
| Audio I/O | `cpal` 0.15 (ASIO, CoreAudio, ALSA) |
| DSP | `rustfft` 6.2, custom windowing (Hann, Hamming, Blackman-Harris, Flat-Top) |
| IPC | Tauri v2 async events + crossbeam channels |
| Ring Buffer | `ringbuf` 0.4 (lock-free, real-time safe) |
| Frontend | React 18 + TypeScript + Vite 6 |
| Rendering | Canvas 2D API (log-frequency spectrum) |
| Database | `rusqlite` 0.31 (bundled SQLite) |

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (1.77+)
- [Node.js](https://nodejs.org/) (18+)
- System dependencies for Tauri: see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
npm install
cd src-tauri && cargo build
```

### Run (Development)

```bash
npm run tauri dev
```

### Build (Production)

```bash
npm run tauri build
```

## License

MIT
