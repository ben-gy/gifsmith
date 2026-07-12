# gifsmith

**Turn any video into a GIF, entirely in your browser. No uploads, no watermark, works offline.**

Live: https://gifsmith.benrichardson.dev

---

## what it is

gifsmith converts a video clip into an animated GIF without uploading anything. Drop in an
MP4, WebM or MOV (anything your browser can play), pick a trim range, frame rate, width and
colour count, and gifsmith samples the frames, quantizes a palette and encodes the GIF — all
on your device.

Every other "video to GIF" tool on the web uploads your file to a server, queues it, caps the
resolution and stamps a watermark on the result. For a screen recording of an internal demo or
a private clip, uploading isn't an option. gifsmith does the whole job locally, so the video
never leaves the tab. Once the page is cached it even works with the network switched off.

It's aimed at anyone making a quick reaction GIF, a how-to from a screen recording, or a loop
for a chat thread — fast, private, and free.

## how it works

```
video file ──▶ <video> element ──▶ seek to each frame timestamp
                                         │
                                         ▼
                         canvas drawImage + getImageData (RGBA, resized)
                                         │  (frames transferred zero-copy)
                                         ▼
                              Web Worker ── gifenc ── quantize ▶ palette
                                         │            applyPalette ▶ indices
                                         ▼
                              animated GIF89a bytes ──▶ Blob ──▶ download / copy / share
```

1. **Load** — the file opens in a hidden `<video>` element. Nothing is sent anywhere.
2. **Sample** — gifsmith seeks the video to evenly-spaced timestamps for the chosen frame rate,
   draws each frame onto a canvas at the chosen width, and reads the raw RGBA pixels back.
3. **Encode** — a Web Worker reduces each frame to a ≤256-colour palette (GIF's hard limit) and
   writes the animated GIF89a byte stream, off the main thread so the UI stays responsive.
4. **Save** — preview the looping result, then download, copy to clipboard, or share it.

The "Try a demo GIF" button synthesizes a short looping animation directly as frames and runs
it through the same encoder — a zero-dependency way to see the output without supplying a file.

## browser APIs used

- **HTMLVideoElement + precise seeking** — decode the source and sample frames at exact times.
- **Canvas 2D (`drawImage` / `getImageData`)** — resize frames and read their pixels.
- **Web Workers + Transferable `ArrayBuffer`** — quantize and encode off the main thread, with
  frames moved zero-copy.
- **Clipboard API (`ClipboardItem`)** — copy the finished GIF.
- **Web Share API** — share the GIF via the system sheet (mostly mobile).
- **Service Worker (vite-plugin-pwa)** — offline use after first load.

## security / privacy model

**Protected**

- Your source video — decoded, resized and read entirely inside the tab.
- Every sampled frame — pixels never leave the browser.
- The finished GIF — built in memory; written to disk only when you click download.

**Not protected**

- The initial page load — GitHub Pages and its CDN log the request for the static site.
- What you do with the GIF after saving it.
- Nothing about the video content, because it's never transmitted anywhere.

**Trust model**

- The static site bundle, hash-pinned by the GitHub Pages deploy.
- The TLS chain between you and GitHub Pages.
- No third-party fonts or trackers; your video never leaves the device. A strict Content-Security-
  Policy allows only the app itself plus the cookie-less Cloudflare Web Analytics beacon
  (anonymous page-view counts — no personal data, no cross-site tracking).

## stack

- Vite 6 + vanilla TypeScript
- [gifenc](https://github.com/mattdesl/gifenc) for palette quantization + GIF encoding
- vite-plugin-pwa for the offline service worker
- Vitest for unit tests
- GitHub Pages for hosting, deployed via GitHub Actions

No runtime dependencies beyond gifenc. No cookies, no fingerprinting, no third-party fonts.
The only analytics is Cloudflare Web Analytics — anonymous, cookie-less page-view counts;
no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys
`dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS
record for `gifsmith.benrichardson.dev` at `ben-gy.github.io`.

## license

MIT — see [LICENSE](./LICENSE).
