// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Shared types for gifsmith. */

/** A single decoded frame ready to be encoded into the GIF. */
export interface RawFrame {
  /** RGBA pixel data, length === width * height * 4. */
  data: Uint8Array;
  width: number;
  height: number;
  /** How long this frame is shown, in milliseconds. */
  delayMs: number;
}

/** User-tunable conversion settings. */
export interface GifSettings {
  /** Frames sampled per second of source video. */
  fps: number;
  /** Target output width in pixels (height follows aspect ratio). 0 = source width. */
  width: number;
  /** Max colours in the palette (GIF caps at 256). */
  maxColors: number;
  /** Trim start, seconds. */
  start: number;
  /** Trim end, seconds. */
  end: number;
  /** Loop count: 0 = forever, n = n extra loops, -1 = play once. */
  loop: number;
}

/** Messages sent into the encode worker. */
export interface EncodeRequest {
  frames: RawFrame[];
  maxColors: number;
  loop: number;
}

/** Messages the encode worker sends back. */
export type EncodeResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array }
  | { type: 'error'; message: string };
