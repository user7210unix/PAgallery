# 壁紙 — a wallpaper artwork

Open `index.html`. Needs internet (images stream frompapes repo).

- Drag, scroll, trackpad or arrow keys to move through the wall. Click a piece to unroll it.
- Only wallpapers near the screen exist in the page; the rest are not loaded or in the DOM.
- `js/manifest.js` holds path + real width/height of every wallpaper (so layout is exact before anything loads).
  After adding wallpapers: `python tools/make-manifest.py /path/to/papes`
- All tuning lives in `CONFIG` at the top of `js/main.js`.
