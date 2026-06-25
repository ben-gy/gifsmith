/**
 * Pure timing / sizing math for the conversion pipeline.
 *
 * Kept dependency-free and side-effect-free so it can be unit tested in
 * isolation — this is the arithmetic that decides which frames get sampled,
 * how big they are, and how long each is shown.
 */

/** Absolute ceiling on frames in one GIF, to protect memory / encode time. */
export const MAX_FRAMES = 500;

/** GIF delays are stored in centiseconds; ~2cs (20ms) is the practical floor. */
export const MIN_DELAY_MS = 20;

/**
 * Scale a source frame to a target width, preserving aspect ratio and never
 * upscaling. Returns even, >=1 integer dimensions.
 */
export function scaleDimensions(
  srcW: number,
  srcH: number,
  targetW: number,
): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) return { width: 1, height: 1 };
  // 0 or anything >= source means "keep native size".
  if (targetW <= 0 || targetW >= srcW) {
    return { width: Math.round(srcW), height: Math.round(srcH) };
  }
  const ratio = targetW / srcW;
  const width = Math.max(1, Math.round(targetW));
  const height = Math.max(1, Math.round(srcH * ratio));
  return { width, height };
}

/** Per-frame display time in ms for a given fps, clamped to the GIF floor. */
export function delayForFps(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return MIN_DELAY_MS;
  return Math.max(MIN_DELAY_MS, Math.round(1000 / fps));
}

/** Clamp a [start, end] trim range into a valid window within [0, duration]. */
export function clampRange(
  start: number,
  end: number,
  duration: number,
): { start: number; end: number } {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  let s = Math.max(0, Math.min(start, d));
  let e = Math.max(s, Math.min(end, d));
  // Degenerate range (e.g. a single-frame still): give it at least one frame.
  if (e <= s) e = d;
  return { start: s, end: e };
}

/**
 * Evenly-spaced sample timestamps (seconds) across [start, end) at the given
 * fps. Always returns at least one timestamp. The list is capped at MAX_FRAMES
 * (the effective fps drops to fit).
 */
export function frameTimestamps(
  start: number,
  end: number,
  fps: number,
  maxFrames: number = MAX_FRAMES,
): number[] {
  const span = Math.max(0, end - start);
  if (span <= 1e-6 || !Number.isFinite(fps) || fps <= 0) {
    return [round3(Math.max(0, start))];
  }
  let count = Math.max(1, Math.floor(span * fps));
  if (count > maxFrames) count = maxFrames;
  const step = span / count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(round3(start + i * step));
  }
  return out;
}

/** Estimate the encoded GIF size in bytes (rough upper-ish heuristic). */
export function estimateGifBytes(
  width: number,
  height: number,
  frameCount: number,
): number {
  // GIF LZW typically lands ~0.7–1.5 bytes/pixel for photographic frames;
  // use 1.0 as a deliberately conservative estimate plus per-frame overhead.
  const perFrame = width * height * 1.0 + 64;
  return Math.round(perFrame * frameCount + 800);
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Format a duration in seconds as m:ss.t (tenths). */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
