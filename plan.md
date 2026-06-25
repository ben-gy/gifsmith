# Tool Plan: gifsmith

## Overview
- **Name:** gifsmith
- **Repo name:** gifsmith
- **Tagline:** Turn any video into a GIF, entirely in your browser — nothing is uploaded.

## Problem It Solves
You have a short video clip — a screen recording, a phone capture, a meme reaction — and you
need a GIF. Every "video to GIF" result on Google is an ad-laden site that uploads your file to
a server, slaps a watermark on it, caps the resolution, or makes you wait in a queue. For
anything remotely sensitive (an internal demo recording, a private moment) uploading is a
non-starter. gifsmith does the whole conversion locally: decode frames from the video, quantize
a palette, encode an animated GIF — all in the tab, offline-capable, no watermark, no account.

## Why This Must Be Client-Side
- **Privacy** — screen recordings and personal clips never leave the device.
- **No-account friction** — no sign-up, no queue, no watermark.
- **Offline** — once the page is cached it works on a plane with no network at all.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| HTMLVideoElement + precise seeking | Decode the source video and sample frames at chosen timestamps | Hard requirement (every browser has it) |
| Canvas 2D `drawImage` / `getImageData` | Resize each frame and read its RGBA pixels | Hard requirement |
| Web Workers + Transferable ArrayBuffer | Run GIF quantization/encoding off the main thread; frames moved zero-copy | Falls back to main-thread encode |
| gifenc | Fast color quantization + GIF89a encoding | N/A — bundled |
| MediaRecorder + `canvas.captureStream` | Generate a sample clip in-browser for the "try a sample" path | Sample button hidden if unsupported |
| Web Share API / Clipboard API | Share or copy the finished GIF | Download always available |
| Service Worker (vite-plugin-pwa) | Offline use after first load | App still works online without it |

## Workflow (input → process → output)
1. User drops/picks a video (or clicks "try a sample" which records one locally).
2. gifsmith loads it, shows a preview, lets the user pick a trim range, frame rate, width, and
   color count. Frames are sampled by seeking the video; pixels are read off a canvas.
3. A worker quantizes each frame and encodes an animated GIF. The user previews it and
   downloads / copies / shares it.

## Non-Goals
- No audio (GIF has none).
- No multi-clip stitching v1.
- No cloud, no account, ever.
- No advanced dithering controls v1 (color-count is the quality dial).

## Target Audience
Someone making a quick reaction GIF or a how-to from a screen recording — casual, on a laptop,
wants it fast and doesn't want their clip on some random server. Light, friendly, fun tone.

## Style Direction
**Tone:** friendly, a little playful (GIFs are fun).
**Colour palette:** light, warm off-white surfaces with a vivid violet→pink accent — energetic
but clean, not a hacker terminal.
**UI density:** balanced/spacious.
**Dark/light theme:** light (consumer/creative audience).
**Reference tools for feel:** ezgif (but trustworthy + private), Squoosh (clean workflow).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite.
- **Key libraries:** gifenc (encode), vite-plugin-pwa (offline).
- **Worker strategy:** single dedicated worker for quantize+encode; frames transferred in.
- **Storage:** localStorage for last-used settings only.

## Privacy & Trust Model
**Protected**
- The video and every frame — decoded, resized and encoded entirely in the tab.
- The output GIF — created in memory; only saved when the user downloads it.

**Not protected**
- The initial page load (GitHub Pages / CDN sees the request for the static site).
- Nothing about the video content — it never goes anywhere to be seen.

**Trust surface**
- The static site bundle (hash-pinned via GitHub Pages deploy).
- The TLS chain between the user and GitHub Pages.
- No third-party scripts, fonts, analytics, or trackers at runtime.

## UX Required Surfaces
- Drop zone (drag-drop, tap-to-pick) + "try a sample" generator.
- Trim range + fps/width/colors controls with live frame-count + size estimate.
- Determinate two-phase progress (sampling frames → encoding) with throughput.
- Event log drawer (decode / frame / encode / system / ui categories).
- How-It-Works modal, Threat Model modal, About modal.
- Output: preview + download + copy-to-clipboard + Web Share.
- Glossary tooltips (frame rate, palette, quantize, scale, loop).
- Keyboard: Escape closes modals, Enter starts conversion.
- Sticky footer "Built by benrichardson.dev".
