// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Demo frame generator.
 *
 * Synthesizes a short, seamlessly-looping animation directly as RGBA frames so
 * the "try a demo" button can run the *real* encode pipeline without the user
 * supplying a file. Drawing straight to frames (rather than recording a video
 * and decoding it back) keeps this dependency-free and reliable everywhere.
 */

import type { RawFrame } from './types';

export function canMakeDemo(): boolean {
  return typeof document !== 'undefined';
}

/** Render one frame of the looping demo at phase p ∈ [0, 1). */
function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, p: number): void {
  const angle = p * Math.PI * 2;

  // Sweeping gradient background (full hue cycle => seamless loop).
  const hue = p * 360;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue}, 80%, 60%)`);
  g.addColorStop(1, `hsl(${(hue + 70) % 360}, 80%, 52%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Orbiting dot.
  const cx = w / 2 + Math.cos(angle) * (w * 0.28);
  const cy = h / 2 + Math.sin(angle) * (h * 0.28);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Centre label.
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.font = `bold ${Math.round(h * 0.14)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('gifsmith', w / 2, h / 2);
}

export interface DemoOptions {
  width?: number;
  height?: number;
  frameCount?: number;
  delayMs?: number;
}

/** Produce a looping demo as decoded RGBA frames, ready for the encoder. */
export function makeDemoFrames(opts: DemoOptions = {}): RawFrame[] {
  const w = opts.width ?? 320;
  const h = opts.height ?? 240;
  const count = opts.frameCount ?? 24;
  const delayMs = opts.delayMs ?? 80;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D canvas context for the demo.');

  const frames: RawFrame[] = [];
  for (let i = 0; i < count; i++) {
    drawFrame(ctx, w, h, i / count);
    const img = ctx.getImageData(0, 0, w, h);
    frames.push({ data: new Uint8Array(img.data.buffer), width: w, height: h, delayMs });
  }
  return frames;
}
