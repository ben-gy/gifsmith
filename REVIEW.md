# gifsmith — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/gifsmith/ *(redirects to the custom domain)*
- **Custom domain:** https://gifsmith.benrichardson.dev

## What it is

Turn any video into an animated GIF entirely in your browser — frame extraction via
HTMLVideoElement seek + Canvas, encoding via gifenc in a Web Worker. No uploads, no
watermark; works offline.

## DNS

CNAME `gifsmith` → `ben-gy.github.io` (Cloudflare, DNS-only) — already created.
