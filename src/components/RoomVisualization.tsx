/**
 * RoomVisualization — 2D top-down and 3D perspective views of the church room.
 *
 * Shows room dimensions, stage area, speaker positions, and dispersion cones
 * based on selected speaker models. Uses Canvas2D for 2D and simple isometric
 * projection for the 3D view.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Speaker database with real dispersion specs ────────────────────────

export interface SpeakerModel {
  id: string;
  brand: string;
  model: string;
  hDispersion: number; // horizontal coverage in degrees
  vDispersion: number; // vertical coverage in degrees
  maxSpl: number;      // max SPL in dB
  type: "line-array" | "point-source" | "sub" | "monitor";
  color: string;
}

export const SPEAKER_MODELS: SpeakerModel[] = [
  // JBL
  { id: "jbl-vrx932", brand: "JBL", model: "VRX932LA-1", hDispersion: 100, vDispersion: 15, maxSpl: 133, type: "line-array", color: "#4cd7f6" },
  { id: "jbl-srx835", brand: "JBL", model: "SRX835P", hDispersion: 75, vDispersion: 50, maxSpl: 135, type: "point-source", color: "#4cd7f6" },
  { id: "jbl-eon715", brand: "JBL", model: "EON715", hDispersion: 100, vDispersion: 60, maxSpl: 129, type: "point-source", color: "#4cd7f6" },
  { id: "jbl-srx828", brand: "JBL", model: "SRX828SP Sub", hDispersion: 360, vDispersion: 360, maxSpl: 141, type: "sub", color: "#4cd7f6" },
  // QSC
  { id: "qsc-kla12", brand: "QSC", model: "KLA12", hDispersion: 105, vDispersion: 15, maxSpl: 132, type: "line-array", color: "#94de2d" },
  { id: "qsc-k12.2", brand: "QSC", model: "K12.2", hDispersion: 75, vDispersion: 65, maxSpl: 132, type: "point-source", color: "#94de2d" },
  { id: "qsc-ksub", brand: "QSC", model: "KS118 Sub", hDispersion: 360, vDispersion: 360, maxSpl: 134, type: "sub", color: "#94de2d" },
  // EV (Electro-Voice)
  { id: "ev-elx200-12", brand: "EV", model: "ELX200-12P", hDispersion: 90, vDispersion: 60, maxSpl: 130, type: "point-source", color: "#fbabff" },
  { id: "ev-zlx15bt", brand: "EV", model: "ZLX-15BT", hDispersion: 90, vDispersion: 50, maxSpl: 127, type: "point-source", color: "#fbabff" },
  { id: "ev-ekx18sp", brand: "EV", model: "EKX-18SP Sub", hDispersion: 360, vDispersion: 360, maxSpl: 134, type: "sub", color: "#fbabff" },
  // RCF
  { id: "rcf-hdl20a", brand: "RCF", model: "HDL 20-A", hDispersion: 100, vDispersion: 15, maxSpl: 138, type: "line-array", color: "#f59e0b" },
  { id: "rcf-art735a", brand: "RCF", model: "ART 735-A MK5", hDispersion: 90, vDispersion: 60, maxSpl: 131, type: "point-source", color: "#f59e0b" },
  { id: "rcf-sub8006", brand: "RCF", model: "SUB 8006-AS", hDispersion: 360, vDispersion: 360, maxSpl: 143, type: "sub", color: "#f59e0b" },
  // Yamaha
  { id: "yamaha-dzr12", brand: "Yamaha", model: "DZR12-D", hDispersion: 90, vDispersion: 60, maxSpl: 137, type: "point-source", color: "#dc2626" },
  { id: "yamaha-dxs18xlf", brand: "Yamaha", model: "DXS18XLF Sub", hDispersion: 360, vDispersion: 360, maxSpl: 138, type: "sub", color: "#dc2626" },
  // Behringer (budget)
  { id: "beh-b212d", brand: "Behringer", model: "B212D", hDispersion: 90, vDispersion: 50, maxSpl: 126, type: "point-source", color: "#a78bfa" },
  { id: "beh-b115d", brand: "Behringer", model: "B115D", hDispersion: 90, vDispersion: 50, maxSpl: 127, type: "point-source", color: "#a78bfa" },
  { id: "beh-vp2520", brand: "Behringer", model: "VP2520 Sub", hDispersion: 360, vDispersion: 360, maxSpl: 131, type: "sub", color: "#a78bfa" },
];

// ─── Positioned speaker in the room ─────────────────────────────────

export interface PlacedSpeaker {
  id: string;
  modelId: string;
  x: number;  // meters from left wall
  y: number;  // meters from back wall (stage side)
  z: number;  // height in meters
  aimAngle: number; // horizontal aim angle in degrees (0 = facing front, +90 = right)
  tiltAngle: number; // vertical tilt in degrees (negative = pointing down at audience)
  label: string;
}

// ─── Room config ────────────────────────────────────────────────────

export interface RoomConfig {
  length: number;    // m (front to back)
  width: number;     // m (left to right)
  height: number;    // m
  stageDepth: number; // m from front wall
  stageWidth: number; // m (can be narrower than room)
  stageHeight: number; // m (platform height)
}

// Default church room layout
const DEFAULT_ROOM: RoomConfig = {
  length: 20,
  width: 12,
  height: 6,
  stageDepth: 4,
  stageWidth: 10,
  stageHeight: 0.6,
};

const DEFAULT_SPEAKERS: PlacedSpeaker[] = [
  { id: "main-l", modelId: "jbl-srx835", x: 3, y: 3.5, z: 3.5, aimAngle: 15, tiltAngle: -15, label: "Main L" },
  { id: "main-r", modelId: "jbl-srx835", x: 9, y: 3.5, z: 3.5, aimAngle: -15, tiltAngle: -15, label: "Main R" },
  { id: "sub-l", modelId: "jbl-srx828", x: 4, y: 1, z: 0, aimAngle: 0, tiltAngle: 0, label: "Sub L" },
  { id: "sub-r", modelId: "jbl-srx828", x: 8, y: 1, z: 0, aimAngle: 0, tiltAngle: 0, label: "Sub R" },
  { id: "mon-1", modelId: "beh-b212d", x: 4, y: 2, z: 0.6, aimAngle: 180, tiltAngle: -10, label: "Monitor 1" },
  { id: "mon-2", modelId: "beh-b212d", x: 8, y: 2, z: 0.6, aimAngle: 180, tiltAngle: -10, label: "Monitor 2" },
];

type ViewType = "2d" | "3d";

interface RoomVisualizationProps {
  onRoomChange?: (room: RoomConfig) => void;
}

export default function RoomVisualization({ onRoomChange }: RoomVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewType>("2d");
  const [room, setRoom] = useState<RoomConfig>({ ...DEFAULT_ROOM });
  const [speakers, setSpeakers] = useState<PlacedSpeaker[]>([...DEFAULT_SPEAKERS]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState<string>(SPEAKER_MODELS[0].id);
  const [showDispersion, setShowDispersion] = useState(true);

  // Notify parent of room changes
  useEffect(() => { onRoomChange?.(room); }, [room, onRoomChange]);

  // ─── 2D Drawing ─────────────────────────────────────────────────
  const draw2D = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const margin = 30;
    const drawW = w - margin * 2;
    const drawH = h - margin * 2;
    const scaleX = drawW / room.width;
    const scaleY = drawH / room.length;
    const scale = Math.min(scaleX, scaleY);
    const offX = margin + (drawW - room.width * scale) / 2;
    const offY = margin + (drawH - room.length * scale) / 2;

    const toCanvas = (x: number, y: number): [number, number] => [
      offX + x * scale,
      offY + (room.length - y) * scale, // flip Y so stage at top
    ];

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Room outline
    const [rx, ry] = toCanvas(0, room.length);
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, room.width * scale, room.length * scale);

    // Room dimensions labels
    ctx.fillStyle = "#71717a";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    // Width label (bottom)
    const [bx] = toCanvas(room.width / 2, 0);
    const [, by] = toCanvas(0, 0);
    ctx.fillText(`${room.width.toFixed(1)}m`, bx, by + 14);
    // Length label (right side)
    ctx.save();
    const [lx] = toCanvas(room.width, room.length / 2);
    const [, ly] = toCanvas(0, room.length / 2);
    ctx.translate(lx + 16, ly);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${room.length.toFixed(1)}m`, 0, 0);
    ctx.restore();

    // Stage area
    const stageX = (room.width - room.stageWidth) / 2;
    const [sx, sy] = toCanvas(stageX, room.length);
    ctx.fillStyle = "rgba(76, 215, 246, 0.08)";
    ctx.fillRect(sx, sy, room.stageWidth * scale, room.stageDepth * scale);
    ctx.strokeStyle = "rgba(76, 215, 246, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, sy, room.stageWidth * scale, room.stageDepth * scale);
    // Stage label
    ctx.fillStyle = "#4cd7f6";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    const [scx, scy] = toCanvas(room.width / 2, room.length - room.stageDepth / 2);
    ctx.fillText(`PALCO (${room.stageWidth.toFixed(0)}×${room.stageDepth.toFixed(0)}m · h=${room.stageHeight.toFixed(1)}m)`, scx, scy + 3);

    // Audience area label
    ctx.fillStyle = "#52525b";
    ctx.font = "9px Inter, sans-serif";
    const [ax, ay] = toCanvas(room.width / 2, (room.length - room.stageDepth) / 2);
    ctx.fillText("PLATEIA", ax, ay);

    // Grid lines (1m spacing)
    ctx.strokeStyle = "rgba(63, 63, 70, 0.3)";
    ctx.lineWidth = 0.5;
    for (let x = 1; x < room.width; x++) {
      const [gx1, gy1] = toCanvas(x, 0);
      const [gx2, gy2] = toCanvas(x, room.length);
      ctx.beginPath();
      ctx.moveTo(gx1, gy1);
      ctx.lineTo(gx2, gy2);
      ctx.stroke();
    }
    for (let y = 1; y < room.length; y++) {
      const [gx1, gy1] = toCanvas(0, y);
      const [gx2, gy2] = toCanvas(room.width, y);
      ctx.beginPath();
      ctx.moveTo(gx1, gy1);
      ctx.lineTo(gx2, gy2);
      ctx.stroke();
    }

    // Draw speakers with dispersion cones
    speakers.forEach((spk) => {
      const model = SPEAKER_MODELS.find(m => m.id === spk.modelId);
      if (!model) return;

      const [cx, cy] = toCanvas(spk.x, spk.y);
      const isSelected = spk.id === selectedSpeaker;

      // Dispersion cone (2D top-down = horizontal dispersion)
      if (showDispersion && model.type !== "sub") {
        const halfAngle = (model.hDispersion / 2) * (Math.PI / 180);
        const throw_distance = Math.min(room.length, 15) * scale; // max 15m throw
        const baseAngle = (-spk.aimAngle - 90) * (Math.PI / 180); // -90 because 0° = facing audience (down in room coords)

        ctx.fillStyle = model.color + "18"; // very transparent fill
        ctx.strokeStyle = model.color + "50";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, throw_distance, baseAngle - halfAngle, baseAngle + halfAngle);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Sub dispersion (omnidirectional circle)
      if (showDispersion && model.type === "sub") {
        const radius = 6 * scale; // ~6m low-freq throw
        ctx.fillStyle = model.color + "10";
        ctx.strokeStyle = model.color + "30";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Speaker icon (rectangle with direction indicator)
      const size = model.type === "sub" ? 8 : 6;
      ctx.fillStyle = isSelected ? "#ffffff" : model.color;
      ctx.strokeStyle = isSelected ? "#ffffff" : model.color;
      ctx.lineWidth = isSelected ? 2 : 1.5;

      // Rotate around speaker position
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-spk.aimAngle - 90) * (Math.PI / 180));

      // Draw speaker body
      ctx.fillRect(-size / 2, -size / 2, size, size);

      // Direction triangle (front face)
      if (model.type !== "sub") {
        ctx.beginPath();
        ctx.moveTo(0, -size / 2 - 4);
        ctx.lineTo(-size / 3, -size / 2);
        ctx.lineTo(size / 3, -size / 2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();

      // Label
      ctx.fillStyle = isSelected ? "#ffffff" : "#a1a1aa";
      ctx.font = `${isSelected ? "bold " : ""}8px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(spk.label, cx, cy + size + 10);

      // Height indicator
      ctx.fillStyle = "#71717a";
      ctx.font = "7px JetBrains Mono, monospace";
      ctx.fillText(`h=${spk.z.toFixed(1)}m`, cx, cy + size + 18);
    });

    // Legend
    ctx.fillStyle = "#71717a";
    ctx.font = "8px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Sala: ${room.width}×${room.length}×${room.height}m | Vol: ${(room.width * room.length * room.height).toFixed(0)} m³`, margin, h - 6);
  }, [room, speakers, selectedSpeaker, showDispersion]);

  // ─── 3D Isometric Drawing ──────────────────────────────────────
  const draw3D = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Simple isometric projection
    const isoAngle = Math.PI / 6; // 30 degrees
    const scale = Math.min(w, h) / (Math.max(room.length, room.width, room.height) * 2.5);
    const centerX = w * 0.5;
    const centerY = h * 0.65;

    const toIso = (x: number, y: number, z: number): [number, number] => [
      centerX + (x - y) * Math.cos(isoAngle) * scale,
      centerY - (x + y) * Math.sin(isoAngle) * scale * 0.5 - z * scale,
    ];

    // Background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    // Floor
    const floorPts = [
      toIso(0, 0, 0),
      toIso(room.width, 0, 0),
      toIso(room.width, room.length, 0),
      toIso(0, room.length, 0),
    ];
    ctx.fillStyle = "rgba(63, 63, 70, 0.15)";
    ctx.beginPath();
    floorPts.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Floor grid (1m)
    ctx.strokeStyle = "rgba(63, 63, 70, 0.2)";
    ctx.lineWidth = 0.5;
    for (let gx = 1; gx < room.width; gx++) {
      const [a, b] = toIso(gx, 0, 0);
      const [c, d] = toIso(gx, room.length, 0);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }
    for (let gy = 1; gy < room.length; gy++) {
      const [a, b] = toIso(0, gy, 0);
      const [c, d] = toIso(room.width, gy, 0);
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    }

    // Walls (back wall = y=0, left wall = x=0)
    // Back wall
    const backWall = [toIso(0, 0, 0), toIso(room.width, 0, 0), toIso(room.width, 0, room.height), toIso(0, 0, room.height)];
    ctx.fillStyle = "rgba(63, 63, 70, 0.08)";
    ctx.beginPath();
    backWall.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left wall
    const leftWall = [toIso(0, 0, 0), toIso(0, room.length, 0), toIso(0, room.length, room.height), toIso(0, 0, room.height)];
    ctx.fillStyle = "rgba(63, 63, 70, 0.05)";
    ctx.beginPath();
    leftWall.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Stage platform
    const stageX = (room.width - room.stageWidth) / 2;
    const stageY = room.length - room.stageDepth;
    // Stage top face
    const stageTop = [
      toIso(stageX, stageY, room.stageHeight),
      toIso(stageX + room.stageWidth, stageY, room.stageHeight),
      toIso(stageX + room.stageWidth, room.length, room.stageHeight),
      toIso(stageX, room.length, room.stageHeight),
    ];
    ctx.fillStyle = "rgba(76, 215, 246, 0.12)";
    ctx.beginPath();
    stageTop.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(76, 215, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Stage front face
    const stageFront = [
      toIso(stageX, stageY, 0),
      toIso(stageX + room.stageWidth, stageY, 0),
      toIso(stageX + room.stageWidth, stageY, room.stageHeight),
      toIso(stageX, stageY, room.stageHeight),
    ];
    ctx.fillStyle = "rgba(76, 215, 246, 0.06)";
    ctx.beginPath();
    stageFront.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(76, 215, 246, 0.3)";
    ctx.stroke();

    // Stage label
    const [slx, sly] = toIso(room.width / 2, room.length - room.stageDepth / 2, room.stageHeight);
    ctx.fillStyle = "#4cd7f6";
    ctx.font = "bold 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PALCO", slx, sly);

    // Draw speakers in 3D
    speakers.forEach((spk) => {
      const model = SPEAKER_MODELS.find(m => m.id === spk.modelId);
      if (!model) return;

      const [cx, cy] = toIso(spk.x, spk.y, spk.z);
      const isSelected = spk.id === selectedSpeaker;

      // Stand/mount line (from floor/stage to speaker height)
      const baseZ = (spk.y > room.length - room.stageDepth) ? room.stageHeight : 0;
      if (spk.z > baseZ) {
        const [, by] = toIso(spk.x, spk.y, baseZ);
        ctx.strokeStyle = "#52525b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, by);
        ctx.stroke();
      }

      // Dispersion cone in 3D (simplified as projected arcs)
      if (showDispersion && model.type !== "sub") {
        const halfAngle = (model.hDispersion / 2) * (Math.PI / 180);
        const throwDist = Math.min(12, room.length) * 0.6;
        const aimRad = (spk.aimAngle) * (Math.PI / 180);

        // Project cone endpoints
        const leftDir = aimRad - halfAngle;
        const rightDir = aimRad + halfAngle;
        // In room coords: aimAngle 0 = towards audience (negative Y direction)
        const [lx, ly] = toIso(
          spk.x + Math.sin(leftDir) * throwDist,
          spk.y - Math.cos(leftDir) * throwDist,
          spk.z + Math.sin(spk.tiltAngle * Math.PI / 180) * throwDist
        );
        const [rx2, ry2] = toIso(
          spk.x + Math.sin(rightDir) * throwDist,
          spk.y - Math.cos(rightDir) * throwDist,
          spk.z + Math.sin(spk.tiltAngle * Math.PI / 180) * throwDist
        );

        ctx.fillStyle = model.color + "12";
        ctx.strokeStyle = model.color + "35";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(lx, ly);
        ctx.lineTo(rx2, ry2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Speaker box
      const sz = model.type === "sub" ? 7 : 5;
      ctx.fillStyle = isSelected ? "#ffffff" : model.color;
      ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);

      // Label
      ctx.fillStyle = isSelected ? "#ffffff" : "#a1a1aa";
      ctx.font = `${isSelected ? "bold " : ""}7px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(spk.label, cx, cy + sz / 2 + 9);
    });

    // Dimension labels
    ctx.fillStyle = "#71717a";
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    // Width
    const [dw1] = toIso(room.width / 2, 0, 0);
    const [, dw2] = toIso(room.width / 2, 0, 0);
    ctx.fillText(`${room.width}m`, dw1, dw2 + 14);
    // Length
    const [dl1, dl2] = toIso(0, room.length / 2, 0);
    ctx.fillText(`${room.length}m`, dl1 - 16, dl2);
    // Height
    const [dh1, dh2] = toIso(0, 0, room.height / 2);
    ctx.fillText(`${room.height}m`, dh1 - 16, dh2);
  }, [room, speakers, selectedSpeaker, showDispersion]);

  // ─── Canvas rendering ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect?.width ?? 400;
    const h = rect?.height ?? 300;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (view === "2d") draw2D(ctx, w, h);
    else draw3D(ctx, w, h);
  }, [view, draw2D, draw3D, speakers, room, showDispersion, selectedSpeaker]);

  // ─── Remove speaker ───────────────────────────────────────────
  const removeSpeaker = useCallback((id: string) => {
    setSpeakers(prev => prev.filter(s => s.id !== id));
    if (selectedSpeaker === id) setSelectedSpeaker(null);
  }, [selectedSpeaker]);

  // ─── Add speaker ──────────────────────────────────────────────
  const addSpeaker = useCallback(() => {
    const model = SPEAKER_MODELS.find(m => m.id === addingModel);
    if (!model) return;
    const newId = `spk-${Date.now()}`;
    setSpeakers(prev => [...prev, {
      id: newId,
      modelId: addingModel,
      x: room.width / 2,
      y: room.length / 2,
      z: model.type === "sub" ? 0 : 3,
      aimAngle: 0,
      tiltAngle: model.type === "sub" ? 0 : -15,
      label: `${model.brand} ${model.model}`,
    }]);
    setSelectedSpeaker(newId);
  }, [addingModel, room]);

  // ─── Update room dimension ────────────────────────────────────
  const updateRoom = useCallback((key: keyof RoomConfig, value: number) => {
    setRoom(prev => ({ ...prev, [key]: Math.max(0.5, value) }));
  }, []);

  // ─── Update selected speaker ──────────────────────────────────
  const updateSpeaker = useCallback((key: keyof PlacedSpeaker, value: number | string) => {
    if (!selectedSpeaker) return;
    setSpeakers(prev => prev.map(s => s.id === selectedSpeaker ? { ...s, [key]: value } : s));
  }, [selectedSpeaker]);

  const selSpk = speakers.find(s => s.id === selectedSpeaker);
  const selModel = selSpk ? SPEAKER_MODELS.find(m => m.id === selSpk.modelId) : null;

  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      {/* Header + view toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-sans uppercase tracking-wider text-text-dim">
          Visualização da Sala
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setView("2d")}
            className={`px-2 py-0.5 rounded text-[9px] font-mono ${view === "2d" ? "bg-primary/20 text-primary border border-primary/40" : "text-text-dim hover:text-text-secondary"}`}
          >2D</button>
          <button
            onClick={() => setView("3d")}
            className={`px-2 py-0.5 rounded text-[9px] font-mono ${view === "3d" ? "bg-primary/20 text-primary border border-primary/40" : "text-text-dim hover:text-text-secondary"}`}
          >3D</button>
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full h-64 bg-bg-surface border border-border-default rounded overflow-hidden relative">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Dispersion toggle */}
      <label className="flex items-center gap-1.5 text-text-dim text-[10px] cursor-pointer">
        <input
          type="checkbox"
          checked={showDispersion}
          onChange={(e) => setShowDispersion(e.target.checked)}
          className="accent-primary w-3 h-3"
        />
        Mostrar dispersão
      </label>

      {/* Room dimensions */}
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mt-1">
        Dimensões da Sala
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <NumInput label="Compr. (m)" value={room.length} onChange={v => updateRoom("length", v)} step={0.5} />
        <NumInput label="Largura (m)" value={room.width} onChange={v => updateRoom("width", v)} step={0.5} />
        <NumInput label="Altura (m)" value={room.height} onChange={v => updateRoom("height", v)} step={0.5} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <NumInput label="Palco Prof." value={room.stageDepth} onChange={v => updateRoom("stageDepth", v)} step={0.5} />
        <NumInput label="Palco Larg." value={room.stageWidth} onChange={v => updateRoom("stageWidth", v)} step={0.5} />
        <NumInput label="Palco Alt." value={room.stageHeight} onChange={v => updateRoom("stageHeight", v)} step={0.1} />
      </div>

      {/* Add speaker */}
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mt-1">
        Adicionar Caixa
      </div>
      <div className="flex gap-1">
        <select
          value={addingModel}
          onChange={(e) => setAddingModel(e.target.value)}
          className="flex-1 bg-bg-surface border border-border-default rounded px-1 py-1 text-[10px] text-text-primary"
        >
          {SPEAKER_MODELS.map(m => (
            <option key={m.id} value={m.id}>
              {m.brand} {m.model} ({m.hDispersion}°×{m.vDispersion}° | {m.maxSpl}dB)
            </option>
          ))}
        </select>
        <button
          onClick={addSpeaker}
          className="px-2 py-1 rounded bg-secondary/20 text-secondary border border-secondary/40 hover:bg-secondary/30 text-[10px]"
        >
          +
        </button>
      </div>

      {/* Speaker list */}
      <div className="text-[10px] font-sans uppercase tracking-wider text-text-dim mt-1">
        Caixas ({speakers.length})
      </div>
      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
        {speakers.map(spk => {
          const model = SPEAKER_MODELS.find(m => m.id === spk.modelId);
          return (
            <div
              key={spk.id}
              onClick={() => setSelectedSpeaker(spk.id === selectedSpeaker ? null : spk.id)}
              className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-[10px] transition-colors
                ${spk.id === selectedSpeaker ? "bg-primary/15 text-primary border border-primary/30" : "bg-bg-surface text-text-dim hover:bg-bg-elevated"}`}
            >
              <span style={{ color: model?.color }}>■</span>
              <span className="flex-1 ml-1.5 truncate">{spk.label}</span>
              <span className="text-text-muted mr-1">{model?.hDispersion}°</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeSpeaker(spk.id); }}
                className="text-text-muted hover:text-danger text-[10px]"
              >×</button>
            </div>
          );
        })}
      </div>

      {/* Selected speaker editor */}
      {selSpk && selModel && (
        <div className="flex flex-col gap-1.5 mt-1 p-2 bg-bg-surface border border-border-default rounded">
          <div className="text-[10px] text-primary font-semibold">{selSpk.label}</div>
          <div className="text-[9px] text-text-muted">
            {selModel.brand} {selModel.model} · {selModel.hDispersion}°H × {selModel.vDispersion}°V · {selModel.maxSpl}dB SPL
          </div>
          <div className="grid grid-cols-3 gap-1">
            <NumInput label="X (m)" value={selSpk.x} onChange={v => updateSpeaker("x", v)} step={0.5} />
            <NumInput label="Y (m)" value={selSpk.y} onChange={v => updateSpeaker("y", v)} step={0.5} />
            <NumInput label="Z (m)" value={selSpk.z} onChange={v => updateSpeaker("z", v)} step={0.5} />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <NumInput label="Ângulo H (°)" value={selSpk.aimAngle} onChange={v => updateSpeaker("aimAngle", v)} step={5} />
            <NumInput label="Tilt V (°)" value={selSpk.tiltAngle} onChange={v => updateSpeaker("tiltAngle", v)} step={5} />
          </div>
          <div className="grid grid-cols-1 gap-1">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim text-[9px]">Modelo</span>
              <select
                value={selSpk.modelId}
                onChange={(e) => {
                  updateSpeaker("modelId", e.target.value);
                  const nm = SPEAKER_MODELS.find(m => m.id === e.target.value);
                  if (nm) updateSpeaker("label", `${nm.brand} ${nm.model}`);
                }}
                className="bg-black border border-border-default rounded px-1 py-0.5 text-[9px] text-text-primary"
              >
                {SPEAKER_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.brand} {m.model}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tiny number input ──────────────────────────────────────────────

function NumInput({ label, value, onChange, step = 1 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-text-dim text-[9px]">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="bg-black border border-border-default rounded px-1 py-0.5 text-[10px] font-mono text-text-primary w-full"
      />
    </label>
  );
}
