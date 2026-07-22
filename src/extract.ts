// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Frame extraction — the browser-side half of the pipeline.
 *
 * Loads a video File into a hidden <video>, then seeks to each sample
 * timestamp and reads the pixels back off a canvas. MediaRecorder-produced
 * clips report `duration === Infinity` until forced, so we resolve a real
 * duration up front with the well-known "seek to a huge time" trick.
 */

import { delayForFps, frameTimestamps, scaleDimensions, clampRange, MAX_FRAMES } from './timing';
import type { RawFrame } from './types';

export interface LoadedVideo {
  el: HTMLVideoElement;
  url: string;
  duration: number;
  width: number;
  height: number;
  /** Release the object URL + element. */
  dispose: () => void;
}

export interface ExtractOptions {
  fps: number;
  /** Target output width; 0 = native. */
  targetWidth: number;
  start: number;
  end: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ExtractResult {
  frames: RawFrame[];
  width: number;
  height: number;
}

const SEEK_TIMEOUT_MS = 8000;

/** Load a video file and resolve its true metadata. */
export async function loadVideo(file: File): Promise<LoadedVideo> {
  const url = URL.createObjectURL(file);
  const el = document.createElement('video');
  el.preload = 'auto';
  el.muted = true;
  el.playsInline = true;
  el.crossOrigin = 'anonymous';
  el.src = url;

  const dispose = () => {
    try {
      el.removeAttribute('src');
      el.load();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  };

  try {
    await onceWithTimeout(el, 'loadedmetadata', SEEK_TIMEOUT_MS);
    const duration = await resolveDuration(el);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not read the video duration — the file may be unsupported.');
    }
    const width = el.videoWidth;
    const height = el.videoHeight;
    if (!width || !height) {
      throw new Error('This file has no video track that the browser can decode.');
    }
    return { el, url, duration, width, height, dispose };
  } catch (err) {
    dispose();
    throw err;
  }
}

/** Sample frames from an already-loaded video. */
export async function extractFrames(
  loaded: LoadedVideo,
  opts: ExtractOptions,
): Promise<ExtractResult> {
  const { el } = loaded;
  const { start, end } = clampRange(opts.start, opts.end, loaded.duration);
  const { width, height } = scaleDimensions(loaded.width, loaded.height, opts.targetWidth);
  const times = frameTimestamps(start, end, opts.fps, MAX_FRAMES);
  const delayMs = delayForFps(opts.fps);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D canvas context.');

  const frames: RawFrame[] = [];
  for (let i = 0; i < times.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await seekTo(el, times[i]);
    ctx.drawImage(el, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    // getImageData allocates a fresh buffer each call, so we can hand the
    // backing ArrayBuffer straight to the worker later without copying.
    frames.push({
      data: new Uint8Array(img.data.buffer),
      width,
      height,
      delayMs,
    });
    opts.onProgress?.(i + 1, times.length);
  }

  if (frames.length === 0) {
    throw new Error('No frames could be sampled from this video.');
  }
  return { frames, width, height };
}

/** Force a finite duration out of streams that report Infinity. */
async function resolveDuration(el: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration;
  return new Promise<number>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      el.removeEventListener('durationchange', onDur);
      clearTimeout(timer);
    };
    const onDur = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        settled = true;
        cleanup();
        // Reset playhead before we start sampling.
        try {
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
        resolve(el.duration);
      }
    };
    const timer = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error('Timed out resolving the video duration.'));
      }
    }, SEEK_TIMEOUT_MS);
    el.addEventListener('durationchange', onDur);
    // The hack: seeking past the end makes the browser compute the real length.
    el.currentTime = 1e101;
  });
}

/** Seek the video to a timestamp and resolve once the frame is ready. */
function seekTo(el: HTMLVideoElement, time: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const target = Math.max(0, Math.min(time, (el.duration || 0) - 1e-3));
    let settled = false;
    const cleanup = () => {
      el.removeEventListener('seeked', onSeeked);
      clearTimeout(timer);
    };
    const onSeeked = () => {
      settled = true;
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error(`Timed out seeking to ${time.toFixed(2)}s.`));
      }
    }, SEEK_TIMEOUT_MS);
    el.addEventListener('seeked', onSeeked);
    // If we're already there, nudge so 'seeked' still fires.
    if (Math.abs(el.currentTime - target) < 1e-4) {
      el.currentTime = target + 1e-3;
    } else {
      el.currentTime = target;
    }
  });
}

function onceWithTimeout(el: HTMLVideoElement, event: string, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onErr = () => {
      cleanup();
      reject(new Error('The browser could not load this video file.'));
    };
    const onEv = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      el.removeEventListener(event, onEv);
      el.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading the video.'));
    }, ms);
    el.addEventListener(event, onEv);
    el.addEventListener('error', onErr);
  });
}
