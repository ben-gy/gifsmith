import { describe, expect, it } from 'vitest';
import { encodeGif, readGifSize, GIF_MAGIC } from '../src/gif';
import type { RawFrame } from '../src/types';

/** Build a solid-colour RGBA frame. */
function solidFrame(w: number, h: number, r: number, g: number, b: number, delayMs = 100): RawFrame {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h, delayMs };
}

describe('encodeGif', () => {
  it('emits a valid GIF89a header', () => {
    const bytes = encodeGif([solidFrame(4, 4, 255, 0, 0)]);
    const magic = String.fromCharCode(...bytes.slice(0, 6));
    expect(magic).toBe(GIF_MAGIC);
  });

  it('writes the logical screen size from the first frame', () => {
    const bytes = encodeGif([solidFrame(8, 6, 0, 128, 255)]);
    expect(readGifSize(bytes)).toEqual({ width: 8, height: 6 });
  });

  it('encodes a multi-frame animation', () => {
    const frames = [
      solidFrame(4, 4, 255, 0, 0),
      solidFrame(4, 4, 0, 255, 0),
      solidFrame(4, 4, 0, 0, 255),
    ];
    const bytes = encodeGif(frames, { maxColors: 64, loop: 0 });
    expect(bytes.length).toBeGreaterThan(20);
    expect(readGifSize(bytes)).toEqual({ width: 4, height: 4 });
    // GIF trailer byte.
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it('throws on an empty frame list', () => {
    expect(() => encodeGif([])).toThrow(/no frames/i);
  });

  it('throws when frame data length does not match dimensions', () => {
    const bad: RawFrame = { data: new Uint8Array(10), width: 4, height: 4, delayMs: 100 };
    expect(() => encodeGif([bad])).toThrow(/bytes/i);
  });

  it('clamps absurd colour counts without throwing', () => {
    const bytes = encodeGif([solidFrame(2, 2, 10, 20, 30)], { maxColors: 99999 });
    expect(readGifSize(bytes)).toEqual({ width: 2, height: 2 });
  });

  it('handles a 1x1 frame', () => {
    const bytes = encodeGif([solidFrame(1, 1, 255, 255, 255)]);
    expect(readGifSize(bytes)).toEqual({ width: 1, height: 1 });
  });
});

describe('readGifSize', () => {
  it('rejects non-GIF data', () => {
    expect(() => readGifSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toThrow(/bad magic/i);
  });
  it('rejects truncated data', () => {
    expect(() => readGifSize(new Uint8Array([0x47, 0x49, 0x46]))).toThrow(/too short/i);
  });
});
