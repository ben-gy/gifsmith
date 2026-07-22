// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * gifsmith — entry point and orchestration.
 *
 * Wires the input surfaces, owns the screen state machine
 * (idle → editor → converting → result), and coordinates the frame extractor
 * (main thread) with the encode worker (background thread).
 */

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import { registerSW } from 'virtual:pwa-register';
import { emit, mountEventDrawer } from './eventlog';
import { initGlossary } from './glossary';
import { extractFrames, loadVideo, type LoadedVideo } from './extract';
import { canMakeDemo, makeDemoFrames } from './sample';
import {
  clampRange,
  estimateGifBytes,
  formatBytes,
  formatDuration,
  frameTimestamps,
  scaleDimensions,
  MAX_FRAMES,
} from './timing';
import type { EncodeResponse, GifSettings, RawFrame } from './types';
import {
  createProgress,
  downloadBlob,
  h,
  initModalTriggers,
  mount,
  setStatus,
} from './ui';

const SETTINGS_KEY = 'gifsmith.settings.v1';
const WIDTH_PRESETS = [240, 320, 480, 640, 0]; // 0 = original
const FPS_PRESETS = [8, 10, 12, 15, 20, 24];
const COLOR_PRESETS = [
  { value: 256, label: 'best (256)' },
  { value: 128, label: 'good (128)' },
  { value: 64, label: 'small (64)' },
];

interface AppState {
  video: LoadedVideo | null;
  settings: GifSettings;
  worker: Worker | null;
  abort: AbortController | null;
  resultUrl: string | null;
}

const state: AppState = {
  video: null,
  settings: loadSettings(),
  worker: null,
  abort: null,
  resultUrl: null,
};

const app = mount();

// ───────────────────────── bootstrap ─────────────────────────

function boot(): void {
  initModalTriggers();
  initGlossary();
  setupDrawerToggle();
  document.addEventListener('keydown', onGlobalKey);
  renderIdle();
  emit('system', 'ok', 'gifsmith ready — your video never leaves this tab', { backend: 'none' });

  try {
    registerSW({ immediate: true });
  } catch {
    /* offline support is best-effort */
  }
}

function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && state.video && !state.worker) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const btn = document.getElementById('create-btn') as HTMLButtonElement | null;
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  }
}

function setupDrawerToggle(): void {
  const drawer = document.getElementById('event-drawer');
  const toggle = document.getElementById('drawer-toggle');
  if (!drawer || !toggle) return;
  let mounted = false;
  let dispose: (() => void) | null = null;
  toggle.addEventListener('click', () => {
    const open = drawer.classList.toggle('hidden');
    const isOpen = !open;
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.classList.toggle('active', isOpen);
    if (isOpen && !mounted) {
      dispose = mountEventDrawer(drawer);
      mounted = true;
    } else if (!isOpen && dispose) {
      dispose();
      dispose = null;
      mounted = false;
    }
  });
}

// ───────────────────────── idle screen ─────────────────────────

function renderIdle(): void {
  disposeVideo();
  setStatus('ready', 'idle');
  app.innerHTML = '';

  const input = h('input', {
    type: 'file',
    accept: 'video/*',
    id: 'file-input',
    hidden: true,
  }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void handleFile(file);
  });

  const dz = h(
    'div',
    { class: 'dropzone', id: 'dropzone', role: 'button', tabindex: 0, 'aria-label': 'Choose a video file' },
    h('div', { class: 'dz-icon' }, iconFilm()),
    h('div', { class: 'dz-title' }, 'Drop a video here'),
    h('div', { class: 'dz-sub' }, 'or click to choose — MP4, WebM, MOV, and more'),
    h('div', { class: 'dz-hint' }, 'Your clip is processed entirely on your device. Nothing is uploaded.'),
  );
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  wireDropzone(dz);

  const actions = h('div', { class: 'idle-actions' });
  if (canMakeDemo()) {
    const demoBtn = h(
      'button',
      { type: 'button', class: 'btn btn-ghost', id: 'demo-btn' },
      'Try a demo GIF',
    );
    demoBtn.addEventListener('click', () => void handleDemo(demoBtn as HTMLButtonElement));
    actions.appendChild(demoBtn);
  }

  const hero = h(
    'section',
    { class: 'hero' },
    h('h1', { class: 'hero-title' }, 'Video → GIF, right in your browser'),
    h(
      'p',
      { class: 'hero-sub' },
      'No uploads, no watermark, no account. gifsmith decodes, resizes and encodes everything locally — it even works offline.',
    ),
    input,
    dz,
    actions,
  );
  app.appendChild(hero);
}

function wireDropzone(dz: HTMLElement): void {
  const over = (on: boolean) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.toggle('dragover', on);
  };
  dz.addEventListener('dragenter', over(true));
  dz.addEventListener('dragover', over(true));
  dz.addEventListener('dragleave', over(false));
  dz.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  });
}

async function handleDemo(btn: HTMLButtonElement): Promise<void> {
  if (state.worker) return;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Rendering demo…';
  setStatus('rendering demo', 'busy');
  emit('frame', 'info', 'Synthesizing a looping demo animation on your device');
  try {
    const frames = makeDemoFrames();
    emit('frame', 'ok', 'Demo frames ready', { count: frames.length });
    const bytes = await encodeInWorker(frames, 256, 0, (done, total) => {
      setStatus('encoding demo', 'busy', `${done}/${total}`);
    });
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
    emit('encode', 'ok', 'Demo GIF encoded', { size: formatBytes(blob.size) });
    setStatus('done', 'ok', formatBytes(blob.size));
    renderResult(blob, { width: frames[0].width, height: frames[0].height, frames: frames.length }, {});
  } catch (err) {
    fail('Could not render the demo GIF', err);
    btn.disabled = false;
    btn.textContent = original ?? 'Try a demo GIF';
  }
}

async function handleFile(file: File): Promise<void> {
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(file.name)) {
    fail('That doesn’t look like a video file', new Error(`type: ${file.type || 'unknown'}`));
    return;
  }
  setStatus('loading video', 'busy');
  emit('decode', 'info', `Loading ${file.name}`, { size: formatBytes(file.size) });
  try {
    disposeVideo();
    const loaded = await loadVideo(file);
    state.video = loaded;
    // Default the trim window to the whole clip, capped to a sane GIF length.
    const end = Math.min(loaded.duration, 6);
    state.settings.start = 0;
    state.settings.end = end;
    emit('decode', 'ok', 'Video decoded', {
      dims: `${loaded.width}×${loaded.height}`,
      duration: formatDuration(loaded.duration),
    });
    setStatus('ready', 'idle');
    renderEditor(loaded);
  } catch (err) {
    fail('Could not load that video', err);
    renderIdle();
  }
}

// ───────────────────────── editor screen ─────────────────────────

function renderEditor(loaded: LoadedVideo): void {
  app.innerHTML = '';
  const s = state.settings;

  // Source preview (the same element we seek for extraction).
  loaded.el.controls = true;
  loaded.el.className = 'preview-video';
  loaded.el.currentTime = clampRange(s.start, s.end, loaded.duration).start;

  const previewWrap = h('div', { class: 'preview-wrap' }, loaded.el);

  // ── trim ──
  const startRange = rangeInput('trim-start', 0, loaded.duration, 0.1, s.start);
  const endRange = rangeInput('trim-end', 0, loaded.duration, 0.1, s.end);
  const trimReadout = h('div', { class: 'trim-readout' });
  const trim = h(
    'div',
    { class: 'control trim' },
    h('label', {}, 'Trim'),
    h(
      'div',
      { class: 'trim-rows' },
      h('div', { class: 'trim-row' }, h('span', { class: 'trim-tag' }, 'start'), startRange),
      h('div', { class: 'trim-row' }, h('span', { class: 'trim-tag' }, 'end'), endRange),
    ),
    trimReadout,
  );

  // ── fps / width / colors ──
  const fpsSel = selectInput('sel-fps', FPS_PRESETS.map((f) => ({ value: f, label: `${f} fps` })), s.fps);
  const widthSel = selectInput(
    'sel-width',
    WIDTH_PRESETS.map((w) => ({ value: w, label: w === 0 ? 'original' : `${w}px` })),
    s.width,
  );
  const colorSel = selectInput('sel-colors', COLOR_PRESETS, s.maxColors);
  const loopSel = selectInput(
    'sel-loop',
    [
      { value: 0, label: 'forever' },
      { value: 1, label: 'once' },
      { value: 3, label: '3×' },
    ],
    s.loop === -1 ? 1 : s.loop,
  );

  const controls = h(
    'div',
    { class: 'controls-grid' },
    labeled('Frame rate', 'fps', fpsSel),
    labeled('Width', 'scale', widthSel),
    labeled('Colours', 'palette', colorSel),
    labeled('Loop', 'loop', loopSel),
  );

  // ── estimate ──
  const estimate = h('div', { class: 'estimate', id: 'estimate' });

  // ── actions ──
  const createBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary', id: 'create-btn' },
    iconSpark(),
    h('span', {}, 'Create GIF'),
  );
  const newBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Choose another video');
  newBtn.addEventListener('click', () => renderIdle());
  const actions = h('div', { class: 'editor-actions' }, createBtn, newBtn);

  const progressMount = h('div', { class: 'progress-mount', id: 'progress-mount' });

  const panel = h(
    'section',
    { class: 'editor' },
    previewWrap,
    h('div', { class: 'editor-controls' }, trim, controls, estimate, actions, progressMount),
  );
  app.appendChild(panel);

  // ── live wiring ──
  const refresh = () => {
    let start = parseFloat(startRange.value);
    let end = parseFloat(endRange.value);
    if (start > end) {
      // Keep them ordered by pushing the other handle.
      if (document.activeElement === startRange) end = start;
      else start = end;
      startRange.value = String(start);
      endRange.value = String(end);
    }
    s.start = start;
    s.end = end;
    s.fps = parseInt(fpsSel.value, 10);
    s.width = parseInt(widthSel.value, 10);
    s.maxColors = parseInt(colorSel.value, 10);
    const loopVal = parseInt(loopSel.value, 10);
    s.loop = loopVal === 1 ? -1 : loopVal;
    saveSettings(s);

    const range = clampRange(s.start, s.end, loaded.duration);
    const dims = scaleDimensions(loaded.width, loaded.height, s.width);
    const frames = frameTimestamps(range.start, range.end, s.fps, MAX_FRAMES).length;
    const bytes = estimateGifBytes(dims.width, dims.height, frames);
    const capped = frames >= MAX_FRAMES;
    trimReadout.textContent = `${formatDuration(range.start)} → ${formatDuration(range.end)}  ·  ${formatDuration(range.end - range.start)} selected`;
    estimate.innerHTML = '';
    estimate.append(
      stat(`${dims.width}×${dims.height}`, 'output size'),
      stat(String(frames), capped ? 'frames (capped)' : 'frames'),
      stat(`~${formatBytes(bytes)}`, 'est. file'),
    );
    if (capped) {
      estimate.appendChild(
        h('div', { class: 'estimate-warn' }, `Capped at ${MAX_FRAMES} frames — lower the fps or trim shorter for a smoother result.`),
      );
    }
    loaded.el.currentTime = range.start;
  };
  [startRange, endRange, fpsSel, widthSel, colorSel, loopSel].forEach((el) =>
    el.addEventListener('input', refresh),
  );
  refresh();

  createBtn.addEventListener('click', () => void runConversion(loaded));
}

// ───────────────────────── conversion ─────────────────────────

async function runConversion(loaded: LoadedVideo): Promise<void> {
  if (state.worker) return;
  const s = { ...state.settings };
  const createBtn = document.getElementById('create-btn') as HTMLButtonElement | null;
  const progressMount = document.getElementById('progress-mount');
  if (!progressMount) return;

  loaded.el.pause();
  if (createBtn) createBtn.disabled = true;

  const progress = createProgress('Sampling frames…');
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-cancel' }, 'Cancel');
  progressMount.innerHTML = '';
  progressMount.append(progress.el, cancelBtn);

  const abort = new AbortController();
  state.abort = abort;
  cancelBtn.addEventListener('click', () => cancelConversion());

  setStatus('working', 'busy');
  const t0 = performance.now();

  try {
    // ── phase 1: sample frames on the main thread ──
    emit('frame', 'info', 'Sampling frames from the video');
    const { frames, width, height } = await extractFrames(loaded, {
      fps: s.fps,
      targetWidth: s.width,
      start: s.start,
      end: s.end,
      signal: abort.signal,
      onProgress: (done, total) => {
        progress.set((done / total) * 0.5, `Sampling frames… ${done}/${total}`);
      },
    });
    const sampleMs = performance.now() - t0;
    emit('frame', 'ok', 'Frames sampled', {
      count: frames.length,
      dims: `${width}×${height}`,
      took: `${(sampleMs / 1000).toFixed(1)}s`,
    });

    // ── phase 2: encode in the worker ──
    const bytes = await encodeInWorker(frames, s.maxColors, s.loop, (done, total) => {
      const fps = done / Math.max(0.001, (performance.now() - t0 - sampleMs) / 1000);
      progress.set(0.5 + (done / total) * 0.5, `Encoding GIF… ${done}/${total} (${fps.toFixed(0)} fps)`);
    });

    const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/gif' });
    emit('encode', 'ok', 'GIF encoded', {
      size: formatBytes(blob.size),
      took: `${((performance.now() - t0) / 1000).toFixed(1)}s`,
    });
    state.abort = null;
    setStatus('done', 'ok', formatBytes(blob.size));
    renderResult(blob, { width, height, frames: frames.length }, { loaded });
  } catch (err) {
    state.abort = null;
    if ((err as Error)?.name === 'AbortError') {
      emit('system', 'warn', 'Conversion cancelled');
      setStatus('cancelled', 'idle');
      renderEditor(loaded);
      return;
    }
    fail('Conversion failed', err);
    if (createBtn) createBtn.disabled = false;
    if (progressMount) progressMount.innerHTML = '';
    const retry = h('button', { type: 'button', class: 'btn btn-primary' }, 'Try again');
    retry.addEventListener('click', () => void runConversion(loaded));
    progressMount?.appendChild(retry);
  }
}

function encodeInWorker(
  frames: RawFrame[],
  maxColors: number,
  loop: number,
  onProgress: (done: number, total: number) => void,
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    emit('encode', 'info', 'Starting encode worker', { colors: maxColors });
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    state.worker = worker;

    const cleanup = () => {
      worker.terminate();
      state.worker = null;
    };

    worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress(msg.done, msg.total);
      } else if (msg.type === 'done') {
        cleanup();
        resolve(msg.bytes);
      } else {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'Worker crashed during encoding.'));
    };

    // Transfer each frame's backing buffer for a zero-copy hand-off.
    const transfer = frames.map((f) => f.data.buffer);
    worker.postMessage({ frames, maxColors, loop }, transfer);
  });
}

function cancelConversion(): void {
  state.abort?.abort();
  if (state.worker) {
    state.worker.terminate();
    state.worker = null;
    if (state.video) {
      emit('system', 'warn', 'Conversion cancelled');
      setStatus('cancelled', 'idle');
      renderEditor(state.video);
    }
  }
}

// ───────────────────────── result screen ─────────────────────────

function renderResult(
  blob: Blob,
  meta: { width: number; height: number; frames: number },
  opts: { loaded?: LoadedVideo },
): void {
  app.innerHTML = '';
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  const url = URL.createObjectURL(blob);
  state.resultUrl = url;

  const img = h('img', {
    src: url,
    class: 'result-img',
    alt: 'Your generated GIF, looping',
  }) as HTMLImageElement;

  const stats = h(
    'div',
    { class: 'result-stats' },
    stat(`${meta.width}×${meta.height}`, 'dimensions'),
    stat(String(meta.frames), 'frames'),
    stat(formatBytes(blob.size), 'file size'),
  );

  const downloadBtn = h('button', { type: 'button', class: 'btn btn-primary' }, iconDownload(), h('span', {}, 'Download GIF'));
  downloadBtn.addEventListener('click', () => {
    downloadBlob(blob, 'gifsmith.gif');
    emit('ui', 'ok', 'GIF downloaded');
  });

  const actions = h('div', { class: 'result-actions' }, downloadBtn);

  // Copy to clipboard (Chromium-class browsers).
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const copyBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Copy');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/gif': blob })]);
        copyBtn.textContent = 'Copied!';
        emit('ui', 'ok', 'GIF copied to clipboard');
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
      } catch (err) {
        emit('ui', 'err', 'Clipboard copy failed', { reason: (err as Error).message });
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
      }
    });
    actions.appendChild(copyBtn);
  }

  // Web Share (mostly mobile).
  const shareFile = new File([blob], 'gifsmith.gif', { type: 'image/gif' });
  if (navigator.canShare?.({ files: [shareFile] })) {
    const shareBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Share');
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [shareFile], title: 'gifsmith GIF' });
        emit('ui', 'ok', 'Shared via the system share sheet');
      } catch {
        /* user dismissed */
      }
    });
    actions.appendChild(shareBtn);
  }

  const secondary = h('div', { class: 'result-secondary' });
  if (opts.loaded) {
    const loaded = opts.loaded;
    const againBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Tweak settings');
    againBtn.addEventListener('click', () => renderEditor(loaded));
    secondary.appendChild(againBtn);
  }
  const newBtn = h(
    'button',
    { type: 'button', class: 'btn btn-ghost' },
    opts.loaded ? 'New video' : 'Start over',
  );
  newBtn.addEventListener('click', () => renderIdle());
  secondary.appendChild(newBtn);

  const section = h(
    'section',
    { class: 'result' },
    h('div', { class: 'result-badge' }, iconCheck(), h('span', {}, 'GIF ready — built entirely on your device')),
    h('div', { class: 'result-preview' }, img),
    stats,
    actions,
    secondary,
  );
  app.appendChild(section);
}

// ───────────────────────── helpers ─────────────────────────

function fail(message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  emit('system', 'err', message, { detail });
  setStatus('error', 'err', message);
  // Surface a dismissible banner.
  const existing = document.querySelector('.error-banner');
  if (existing) existing.remove();
  const banner = h(
    'div',
    { class: 'error-banner', role: 'alert' },
    h('span', {}, `${message}. ${detail}`),
    h('button', { type: 'button', class: 'banner-close', 'aria-label': 'dismiss' }, '×'),
  );
  banner.querySelector('.banner-close')?.addEventListener('click', () => banner.remove());
  app.prepend(banner);
}

function disposeVideo(): void {
  if (state.video) {
    state.video.dispose();
    state.video = null;
  }
  if (state.resultUrl) {
    URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
  }
}

function rangeInput(
  id: string,
  min: number,
  max: number,
  step: number,
  value: number,
): HTMLInputElement {
  return h('input', {
    type: 'range',
    id,
    min,
    max: Math.max(max, min + step),
    step,
    value,
    class: 'range',
  }) as HTMLInputElement;
}

function selectInput(
  id: string,
  options: Array<{ value: number; label: string }>,
  value: number,
): HTMLSelectElement {
  const sel = h('select', { id, class: 'select' }) as HTMLSelectElement;
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label) as HTMLOptionElement;
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  // If the stored value isn't a preset, select the closest sensible default.
  if (!options.some((o) => o.value === value) && options.length) {
    (sel.options[0] as HTMLOptionElement).selected = true;
  }
  return sel;
}

function labeled(label: string, term: string, control: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'control' },
    h('label', {}, h('span', { class: 'glossary-link', 'data-term': term }, label)),
    control,
  );
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label));
}

function loadSettings(): GifSettings {
  const fallback: GifSettings = { fps: 12, width: 480, maxColors: 256, start: 0, end: 6, loop: 0 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GifSettings>;
    return { ...fallback, ...parsed, start: 0, end: 6 };
  } catch {
    return fallback;
  }
}

function saveSettings(s: GifSettings): void {
  try {
    // Persist only the sticky preferences, not the per-clip trim.
    const { fps, width, maxColors, loop } = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fps, width, maxColors, loop }));
  } catch {
    /* ignore */
  }
}

// ── inline icons ──
function iconFilm(): HTMLElement {
  return svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>');
}
function iconSpark(): HTMLElement {
  return svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>');
}
function iconDownload(): HTMLElement {
  return svg('<path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14"/>');
}
function iconCheck(): HTMLElement {
  return svg('<path d="M5 12l4 4L19 7"/>');
}
function svg(inner: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  return wrap;
}

boot();
