/**
 * Encode worker — runs palette quantization + GIF encoding off the main
 * thread. Frames arrive as transferred ArrayBuffers (zero-copy); the finished
 * GIF is transferred back out.
 */

import { encodeGif } from './gif';
import type { EncodeRequest, EncodeResponse } from './types';

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<EncodeRequest>) => {
  const { frames, maxColors, loop } = e.data;
  try {
    const bytes = encodeGif(frames, {
      maxColors,
      loop,
      onProgress: (done, total) => {
        const msg: EncodeResponse = { type: 'progress', done, total };
        ctx.postMessage(msg);
      },
    });
    const msg: EncodeResponse = { type: 'done', bytes };
    // Transfer the underlying buffer back to the main thread.
    ctx.postMessage(msg, [bytes.buffer]);
  } catch (err) {
    const msg: EncodeResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(msg);
  }
};
