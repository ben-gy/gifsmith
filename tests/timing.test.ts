import { describe, expect, it } from 'vitest';
import {
  clampRange,
  delayForFps,
  estimateGifBytes,
  formatBytes,
  formatDuration,
  frameTimestamps,
  scaleDimensions,
  MAX_FRAMES,
  MIN_DELAY_MS,
} from '../src/timing';

describe('scaleDimensions', () => {
  it('preserves aspect ratio when shrinking', () => {
    expect(scaleDimensions(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
  });
  it('never upscales beyond source width', () => {
    expect(scaleDimensions(320, 240, 640)).toEqual({ width: 320, height: 240 });
  });
  it('treats 0 as "keep original"', () => {
    expect(scaleDimensions(640, 360, 0)).toEqual({ width: 640, height: 360 });
  });
  it('guards against zero / negative source', () => {
    expect(scaleDimensions(0, 0, 100)).toEqual({ width: 1, height: 1 });
  });
  it('keeps height at least 1 for extreme aspect ratios', () => {
    const { height } = scaleDimensions(4000, 10, 40);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe('delayForFps', () => {
  it('computes ms per frame', () => {
    expect(delayForFps(10)).toBe(100);
    expect(delayForFps(20)).toBe(50);
  });
  it('clamps to the GIF floor', () => {
    expect(delayForFps(1000)).toBe(MIN_DELAY_MS);
  });
  it('handles invalid fps', () => {
    expect(delayForFps(0)).toBe(MIN_DELAY_MS);
    expect(delayForFps(NaN)).toBe(MIN_DELAY_MS);
  });
});

describe('clampRange', () => {
  it('clamps within [0, duration]', () => {
    expect(clampRange(-2, 99, 10)).toEqual({ start: 0, end: 10 });
  });
  it('keeps a valid in-bounds range', () => {
    expect(clampRange(2, 5, 10)).toEqual({ start: 2, end: 5 });
  });
  it('expands a degenerate range to the full clip', () => {
    expect(clampRange(5, 5, 10)).toEqual({ start: 5, end: 10 });
  });
  it('handles non-finite duration', () => {
    expect(clampRange(1, 2, Infinity)).toEqual({ start: 0, end: 0 });
  });
});

describe('frameTimestamps', () => {
  it('produces evenly spaced timestamps', () => {
    const t = frameTimestamps(0, 1, 4);
    expect(t).toHaveLength(4);
    expect(t[0]).toBe(0);
    expect(t[1]).toBeCloseTo(0.25, 5);
  });
  it('always returns at least one frame', () => {
    expect(frameTimestamps(3, 3, 12)).toEqual([3]);
  });
  it('caps the number of frames', () => {
    const t = frameTimestamps(0, 10000, 60, MAX_FRAMES);
    expect(t.length).toBe(MAX_FRAMES);
  });
  it('respects a custom cap', () => {
    expect(frameTimestamps(0, 100, 30, 10).length).toBe(10);
  });
  it('handles invalid fps by returning the start frame', () => {
    expect(frameTimestamps(2, 8, 0)).toEqual([2]);
  });
});

describe('estimateGifBytes', () => {
  it('scales with pixels and frames', () => {
    const small = estimateGifBytes(100, 100, 5);
    const big = estimateGifBytes(200, 200, 5);
    expect(big).toBeGreaterThan(small);
  });
  it('grows with frame count', () => {
    expect(estimateGifBytes(100, 100, 10)).toBeGreaterThan(estimateGifBytes(100, 100, 1));
  });
});

describe('formatBytes', () => {
  it('formats byte ranges', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss.t', () => {
    expect(formatDuration(5)).toBe('0:05.0');
    expect(formatDuration(65.4)).toBe('1:05.4');
  });
  it('clamps negatives', () => {
    expect(formatDuration(-3)).toBe('0:00.0');
  });
});
