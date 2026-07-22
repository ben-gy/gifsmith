// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * GIF encoding — a thin, pure wrapper around gifenc.
 *
 * Takes already-decoded RGBA frames and produces an animated GIF89a byte
 * stream. No DOM, no workers, no globals: this is the testable heart of the
 * tool, exercised directly by Vitest and also imported by the worker.
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { RawFrame } from './types';

export interface EncodeOptions {
  /** Max palette colours per frame (1–256). */
  maxColors?: number;
  /** Loop count: 0 = forever (default), -1 = play once, n = n extra loops. */
  loop?: number;
  /** Called after each frame is written. */
  onProgress?: (done: number, total: number) => void;
}

/** GIF89a magic — exported for tests/validation. */
export const GIF_MAGIC = 'GIF89a';

function clampColors(n: number | undefined): number {
  if (!Number.isFinite(n as number)) return 256;
  return Math.max(2, Math.min(256, Math.round(n as number)));
}

/**
 * Encode frames into a GIF. Each frame gets its own optimised palette
 * (better colour fidelity than a single global palette for video).
 */
export function encodeGif(frames: RawFrame[], opts: EncodeOptions = {}): Uint8Array {
  if (frames.length === 0) {
    throw new Error('Cannot encode a GIF with no frames.');
  }
  const maxColors = clampColors(opts.maxColors);
  const loop = opts.loop ?? 0;
  const gif = GIFEncoder();
  const total = frames.length;

  for (let i = 0; i < total; i++) {
    const f = frames[i];
    const expected = f.width * f.height * 4;
    if (f.data.length !== expected) {
      throw new Error(
        `Frame ${i} has ${f.data.length} bytes but ${f.width}×${f.height} needs ${expected}.`,
      );
    }
    // gifenc expects a plain Uint8Array RGBA buffer.
    const rgba = f.data;
    const palette = quantize(rgba, maxColors, { format: 'rgb565' });
    const index = applyPalette(rgba, palette, 'rgb565');
    gif.writeFrame(index, f.width, f.height, {
      palette,
      delay: Math.max(0, Math.round(f.delayMs)),
      // The Netscape loop extension is written from the first frame only.
      repeat: i === 0 ? loop : undefined,
    });
    opts.onProgress?.(i + 1, total);
  }

  gif.finish();
  return gif.bytes();
}

/** Read the logical-screen dimensions from an encoded GIF header. */
export function readGifSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 10) throw new Error('Not a GIF: too short.');
  const magic = String.fromCharCode(...bytes.slice(0, 6));
  if (magic !== 'GIF89a' && magic !== 'GIF87a') {
    throw new Error(`Not a GIF: bad magic "${magic}".`);
  }
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  return { width, height };
}
