declare module 'gifenc' {
  export type Palette = number[][];
  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface WriteFrameOptions {
    palette?: Palette;
    /** Frame delay in milliseconds. */
    delay?: number;
    /** Netscape loop count: 0 = forever, -1 = once. Set on the first frame. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: PaletteFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: PaletteFormat,
  ): Uint8Array;

  export function nearestColorIndex(palette: Palette, pixel: number[]): number;
}
