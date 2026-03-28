'use client';

import { useEffect, useRef } from 'react';
import type { RiskLevel } from '@/data/mock-cameras';

interface Figure {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  opacity: number;
}

interface Detection {
  figure: Figure;
  label: string;
  confidence: number;
  color: string;
  ttl: number; // frames remaining
}

const RISK_BOX_COLOR: Record<RiskLevel, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

const RISK_LABELS: Record<RiskLevel, string[]> = {
  critical: ['WEAPON DETECTED', 'AGGRESSION', 'FIGHT', 'THREAT'],
  high: ['LOITERING', 'CROWD SURGE', 'SUSPICIOUS', 'RUNNING'],
  medium: ['PERSON', 'VEHICLE', 'BACKPACK', 'BICYCLE'],
};

function seededNoise(x: number, y: number, t: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + t * 74.3) * 43758.5453;
  return n - Math.floor(n);
}

interface Props {
  cameraName: string;
  cameraId: string;
  riskLevel: RiskLevel;
  width?: number;
  height?: number;
}

export function MockCctvFeed({ cameraName, cameraId, riskLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    figures: Figure[];
    detections: Detection[];
    frame: number;
    nextDetectionAt: number;
  }>({
    figures: [],
    detections: [],
    frame: 0,
    nextDetectionAt: 60,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Aliased so closures inside draw() see non-nullable types
    const c = canvas;
    const g = ctx;

    // Init figures
    const figureCount = riskLevel === 'critical' ? 5 : riskLevel === 'high' ? 4 : 3;
    stateRef.current.figures = Array.from({ length: figureCount }, (_, i) => ({
      x: 80 + (i / figureCount) * (c.width - 160),
      y: c.height * 0.3 + Math.random() * c.height * 0.35,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.2,
      w: 14 + Math.random() * 8,
      h: 32 + Math.random() * 14,
      opacity: 0.55 + Math.random() * 0.35,
    }));

    let raf: number;

    function draw() {
      const s = stateRef.current;
      const W = c.width;
      const H = c.height;
      s.frame++;

      // Background — dark with slight green tint (night vision)
      g.fillStyle = '#0a0f0a';
      g.fillRect(0, 0, W, H);

      // Film grain
      const grainData = g.createImageData(W, H);
      for (let i = 0; i < grainData.data.length; i += 4) {
        const px = (i / 4) % W;
        const py = Math.floor((i / 4) / W);
        const n = seededNoise(px, py, s.frame * 0.3) * 18;
        grainData.data[i] = n;
        grainData.data[i + 1] = n + 2;
        grainData.data[i + 2] = n;
        grainData.data[i + 3] = 255;
      }
      g.putImageData(grainData, 0, 0);

      // Ground plane suggestion
      g.fillStyle = 'rgba(30,40,30,0.4)';
      g.fillRect(0, H * 0.65, W, H * 0.35);

      // Move and draw figures
      for (const fig of s.figures) {
        fig.x += fig.vx;
        fig.y += fig.vy;
        // Bounce off edges
        if (fig.x < 20 || fig.x > W - 20) fig.vx *= -1;
        if (fig.y < H * 0.25 || fig.y > H * 0.72) fig.vy *= -1;
        // Occasional direction change
        if (Math.random() < 0.004) fig.vx = (Math.random() - 0.5) * 0.6;
        if (Math.random() < 0.002) fig.vy = (Math.random() - 0.5) * 0.2;

        // Figure silhouette (head + body)
        g.save();
        g.globalAlpha = fig.opacity;
        g.fillStyle = '#1a2a1a';
        // Body
        g.fillRect(fig.x - fig.w / 2, fig.y - fig.h / 2, fig.w, fig.h);
        // Head
        g.beginPath();
        g.arc(fig.x, fig.y - fig.h / 2 - fig.w * 0.4, fig.w * 0.4, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      // Spawn new detection
      if (s.frame >= s.nextDetectionAt && s.figures.length > 0) {
        const fig = s.figures[Math.floor(Math.random() * s.figures.length)];
        const color = RISK_BOX_COLOR[riskLevel];
        const labels = RISK_LABELS[riskLevel];
        s.detections.push({
          figure: fig,
          label: labels[Math.floor(Math.random() * labels.length)],
          confidence: 0.72 + Math.random() * 0.27,
          color,
          ttl: riskLevel === 'critical' ? 110 : 80,
        });
        const interval = riskLevel === 'critical' ? 90 : riskLevel === 'high' ? 130 : 200;
        s.nextDetectionAt = s.frame + interval + Math.floor(Math.random() * 60);
      }

      // Draw detections
      s.detections = s.detections.filter((d) => d.ttl > 0);
      for (const det of s.detections) {
        det.ttl--;
        const fig = det.figure;
        const alpha = Math.min(1, det.ttl / 12);
        const pad = 6;
        const bx = fig.x - fig.w / 2 - pad;
        const by = fig.y - fig.h / 2 - fig.w * 0.8 - pad;
        const bw = fig.w + pad * 2;
        const bh = fig.h + fig.w * 0.8 + pad * 2;

        // Box
        g.save();
        g.globalAlpha = alpha;
        g.strokeStyle = det.color;
        g.lineWidth = 1.5;
        g.strokeRect(bx, by, bw, bh);

        // Corner accents
        const cs = 7;
        g.lineWidth = 2.5;
        [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].forEach(([cx, cy], i) => {
          g.beginPath();
          g.moveTo(cx + (i % 2 === 0 ? cs : -cs), cy);
          g.lineTo(cx, cy);
          g.lineTo(cx, cy + (i < 2 ? cs : -cs));
          g.stroke();
        });

        // Label
        g.font = 'bold 9px monospace';
        g.fillStyle = det.color;
        g.fillText(`${det.label} ${(det.confidence * 100).toFixed(0)}%`, bx, by - 3);
        g.restore();
      }

      // Scanlines
      g.save();
      g.globalAlpha = 0.07;
      for (let y = 0; y < H; y += 3) {
        g.fillStyle = '#000';
        g.fillRect(0, y, W, 1);
      }
      g.restore();

      // Vignette
      const vignette = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = vignette;
      g.fillRect(0, 0, W, H);

      // HUD — camera info
      g.save();
      g.font = '10px monospace';
      g.fillStyle = 'rgba(120,200,120,0.75)';

      // Top-left: camera ID
      g.fillText(`CAM ${cameraId.slice(-6).toUpperCase()}`, 8, 16);
      g.fillText(cameraName.toUpperCase().slice(0, 22), 8, 28);

      // Top-right: REC blink
      if (Math.floor(s.frame / 30) % 2 === 0) {
        g.fillStyle = '#ef4444';
        g.beginPath();
        g.arc(W - 14, 12, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(120,200,120,0.75)';
        g.fillText('REC', W - 36, 16);
      }

      // Bottom-left: timestamp
      const now = new Date();
      const ts = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      g.fillText(ts, 8, H - 8);

      // Bottom-right: risk level
      g.fillStyle = RISK_BOX_COLOR[riskLevel];
      g.font = 'bold 10px monospace';
      const rlText = riskLevel.toUpperCase();
      g.fillText(rlText, W - g.measureText(rlText).width - 8, H - 8);

      g.restore();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, [cameraId, cameraName, riskLevel]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={270}
      className="w-full h-full"
    />
  );
}
