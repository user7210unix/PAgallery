"use strict";

/* ===== every tunable number lives here ===== */
const CONFIG = Object.freeze({
  RAW_BASE: "https://raw.githubusercontent.com/user7210unix/papes/main/",
  RESIZE_BASE: "https://wsrv.nl/?url=",
  PROXY_BASE: "https://chan-proxy.anonnousmes.workers.dev/?url=",
  PREVIEW_QUALITY: 70, PREVIEW_STEP_PX: 160, PREVIEW_MIN_PX: 320, PREVIEW_MAX_PX: 1280, MAX_DPR: 2,

  MAX_PARALLEL_LOADS: 4,      // images downloading at once
  LOAD_SPEED_PX: 6,           // only start downloads once motion is slower than this per frame
  MOUNT_MARGIN: 0.35,         // pieces within this (x screen size) of the viewport get created
  UNMOUNT_MARGIN: 0.6,        // ...and are destroyed beyond this

  CELL_VMIN: 0.36, WORLD_ASPECT: 1.7, WORLD_PAD_VMIN: 0.3, MIN_WORLD_VW: 1.3,
  FILL: 0.98, MAX_SPAN: 1.55, SIZE_JITTER: [0.82, 1.12], POSITION_JITTER: 0.22, TILT_MAX_DEG: 2.2,
  TORN_POINTS_PER_EDGE: 9, TORN_DEPTH_PCT: 2.6, BLOB_POINTS: 22, BLOB_RADIUS_PCT: 46, BLOB_WOBBLE_PCT: 10,
  CLIP_ODDS: { torn: 0.5, ellipse: 0.65, arch: 0.85 },   // cumulative; the rest become blobs

  EASE: 0.11, DRAG_EASE: 0.35, WHEEL_LINE_PX: 32, MOMENTUM: 14, DRAG_THRESHOLD_PX: 6, KEY_STEP: 0.3, SETTLE_PX: 0.1,
  INTRO_DRIFT_DELAY_MS: 2600, INTRO_DRIFT: { x: -0.12, y: -0.08 },

  PAPER_TILE_PX: 512, PAPER_FIBERS: 5200, PAPER_STAINS: 5, PAPER_SPECKS: 160, EDGE_WRAP_PX: 24, SEED: 2003,
  MARK_CHARS: ["景", "夜", "山", "水", "光"], ENSO_COUNT: 3, SEAL_SIZE_PX: [34, 56], ENSO_SIZE_PX: [200, 340]
});

/* three depths: far marks, middle wallpapers, near wallpapers (deeper = moves slower) */
const LAYER_SPECS = [
  { name: "marks", depth: 0.4 },
  { name: "mid", depth: 0.62, share: 0.35 },
  { name: "near", depth: 1, share: 0.65 }
];
const ENSO_PATH = "M104 22C52 20 20 62 26 108C32 156 80 184 124 172C170 160 188 112 172 72C164 52 146 38 128 30";

const $ = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lerp = (range, t) => range[0] + (range[1] - range[0]) * t;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===== paper: one small tile painted once, then repeated by CSS (no live filters) ===== */
function paintPaper() {
  const size = CONFIG.PAPER_TILE_PX, edge = CONFIG.EDGE_WRAP_PX;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const random = seededRandom(CONFIG.SEED);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#eedfae";
  ctx.fillRect(0, 0, size, size);

  /* draw a mark and its wrapped twins so the tile repeats without seams */
  const wrapped = (x, y, draw) => {
    const xs = x < edge ? [0, size] : x > size - edge ? [0, -size] : [0];
    const ys = y < edge ? [0, size] : y > size - edge ? [0, -size] : [0];
    xs.forEach((dx) => ys.forEach((dy) => draw(x + dx, y + dy)));
  };
  for (let i = 0; i < CONFIG.PAPER_STAINS; i++) {
    const radius = size * (0.18 + random() * 0.2);
    wrapped(random() * size, random() * size, (x, y) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(150,105,40,.09)"); gradient.addColorStop(1, "rgba(150,105,40,0)");
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
  }
  for (let i = 0; i < CONFIG.PAPER_FIBERS; i++) {
    const angle = random() * Math.PI * 2, length = 4 + random() * 18, light = i % 3 === 0;
    ctx.strokeStyle = light ? `rgba(255,250,225,${0.08 + random() * 0.1})` : `rgba(120,85,35,${0.03 + random() * 0.07})`;
    ctx.lineWidth = 0.5 + random() * 0.6;
    wrapped(random() * size, random() * size, (x, y) => {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length); ctx.stroke();
    });
  }
  for (let i = 0; i < CONFIG.PAPER_SPECKS; i++) {
    ctx.fillStyle = `rgba(70,45,15,${0.12 + random() * 0.2})`;
    wrapped(random() * size, random() * size, (x, y) => { ctx.beginPath(); ctx.arc(x, y, 0.4 + random() * 0.7, 0, Math.PI * 2); ctx.fill(); });
  }
  canvas.toBlob((blob) => {
    document.body.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
    document.body.style.backgroundSize = `${size}px ${size}px`;
  });
}

/* ===== organic edges: nothing here is a rectangle ===== */
const pct = (n) => `${n.toFixed(1)}%`;
function tornPolygon(random) {
  const n = CONFIG.TORN_POINTS_PER_EDGE, jag = () => random() * CONFIG.TORN_DEPTH_PCT, points = [];
  for (let i = 0; i < n; i++) points.push([(i / n) * 100, jag()]);
  for (let i = 0; i < n; i++) points.push([100 - jag(), (i / n) * 100]);
  for (let i = 0; i < n; i++) points.push([100 - (i / n) * 100, 100 - jag()]);
  for (let i = 0; i < n; i++) points.push([jag(), 100 - (i / n) * 100]);
  return `polygon(${points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(",")})`;
}
function blobPolygon(random) {
  const points = [];
  for (let i = 0; i < CONFIG.BLOB_POINTS; i++) {
    const angle = (i / CONFIG.BLOB_POINTS) * Math.PI * 2, radius = CONFIG.BLOB_RADIUS_PCT + (random() - 0.5) * CONFIG.BLOB_WOBBLE_PCT;
    points.push(`${pct(50 + Math.cos(angle) * radius)} ${pct(50 + Math.sin(angle) * radius)}`);
  }
  return `polygon(${points.join(",")})`;
}
function pickClip(random) {
  const roll = random(), odds = CONFIG.CLIP_ODDS;
  if (roll < odds.torn) return tornPolygon(random);
  if (roll < odds.ellipse) return "ellipse(50% 50% at 50% 50%)";
  if (roll < odds.arch) return "inset(0 round 50% 50% 3% 3% / 38% 38% 3% 3%)";
  return blobPolygon(random);
}

/* ===== world layout ===== */
const stage = $("stage"), viewer = $("viewer");
const manifest = (window.PAPES_MANIFEST || []).map(([path, width, height]) => ({ path, srcW: width, srcH: height }));
const layers = LAYER_SPECS.map((spec) => {
  const el = document.createElement("div"); el.className = `layer layer-${spec.name}`; stage.appendChild(el); return { ...spec, el };
});
const pieces = [];
let vw = 0, vh = 0, world = { w: 0, h: 0 }, panMin = { x: 0, y: 0 };

const shuffleRandom = seededRandom(CONFIG.SEED + 1);
const order = manifest.map((_, i) => i).sort(() => shuffleRandom() - 0.5);

const fullUrl = (path) => CONFIG.RAW_BASE + path.split("/").map(encodeURIComponent).join("/");
function previewUrls(piece) {
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.MAX_DPR);
  const width = clamp(Math.ceil((piece.w * dpr) / CONFIG.PREVIEW_STEP_PX) * CONFIG.PREVIEW_STEP_PX, CONFIG.PREVIEW_MIN_PX, CONFIG.PREVIEW_MAX_PX);
  const full = fullUrl(piece.path);
  return [`${CONFIG.RESIZE_BASE}${encodeURIComponent(full)}&w=${width}&q=${CONFIG.PREVIEW_QUALITY}&output=webp`, CONFIG.PROXY_BASE + encodeURIComponent(full)];
}

function layoutLayer(layer, indices, areaW, areaH) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(indices.length * (areaW / areaH))));
  const rows = Math.ceil(indices.length / cols);
  const cellW = areaW / cols, cellH = areaH / rows, nominal = Math.min(cellW, cellH) * CONFIG.FILL;
  indices.forEach((manifestIndex, slot) => {
    const random = seededRandom(CONFIG.SEED + manifestIndex * 13);
    const source = manifest[manifestIndex], aspect = source.srcW / source.srcH;
    let w = nominal * Math.sqrt(aspect) * lerp(CONFIG.SIZE_JITTER, random()), h = w / aspect;
    const shrink = Math.min(1, (cellW * CONFIG.MAX_SPAN) / w, (cellH * CONFIG.MAX_SPAN) / h);
    w *= shrink; h *= shrink;
    const cx = ((slot % cols) + 0.5 + (random() - 0.5) * 2 * CONFIG.POSITION_JITTER) * cellW;
    const cy = (Math.floor(slot / cols) + 0.5 + (random() - 0.5) * 2 * CONFIG.POSITION_JITTER) * cellH;
    pieces.push({
      ...source, id: manifestIndex, layer, depth: layer.depth, x: cx - w / 2, y: cy - h / 2, w, h,
      tilt: (random() - 0.5) * 2 * CONFIG.TILT_MAX_DEG, clip: pickClip(random), el: null, state: "none"
    });
  });
}

function layout() {
  vw = innerWidth; vh = innerHeight;
  pieces.forEach(unmount); pieces.length = 0;
  layers.forEach((layer) => layer.el.replaceChildren());

  const min = Math.min(vw, vh), cell = min * CONFIG.CELL_VMIN, pad = min * CONFIG.WORLD_PAD_VMIN;
  const midCount = Math.round(manifest.length * LAYER_SPECS[1].share);
  const nearIndices = order.slice(midCount), midIndices = order.slice(0, midCount);
  const nearCols = Math.ceil(Math.sqrt(nearIndices.length * CONFIG.WORLD_ASPECT));
  world.w = Math.max(nearCols * cell + pad * 2, vw * CONFIG.MIN_WORLD_VW);
  world.h = Math.max(Math.ceil(nearIndices.length / nearCols) * cell + pad * 2, vh * CONFIG.MIN_WORLD_VW);
  panMin = { x: vw - world.w, y: vh - world.h };

  const areaFor = (depth) => ({ w: (world.w - vw) * depth + vw, h: (world.h - vh) * depth + vh });
  const [, mid, near] = layers;
  layoutLayer(mid, midIndices, areaFor(mid.depth).w, areaFor(mid.depth).h);
  layoutLayer(near, nearIndices, areaFor(near.depth).w, areaFor(near.depth).h);
  buildMarks(areaFor(layers[0].depth));
}

/* a few quiet marks (seals, brush circles) deep behind the wallpapers */
function buildMarks(area) {
  const random = seededRandom(CONFIG.SEED + 99), host = layers[0].el;
  CONFIG.MARK_CHARS.forEach((char) => {
    const size = lerp(CONFIG.SEAL_SIZE_PX, random()), seal = document.createElement("div");
    seal.className = "far-mark far-seal"; seal.textContent = char;
    Object.assign(seal.style, { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.62}px`, left: `${random() * area.w}px`, top: `${random() * area.h}px`, transform: `rotate(${(random() - 0.5) * 16}deg)` });
    host.appendChild(seal);
  });
  for (let i = 0; i < CONFIG.ENSO_COUNT; i++) {
    const size = lerp(CONFIG.ENSO_SIZE_PX, random()), ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ring.setAttribute("viewBox", "0 0 200 200"); ring.setAttribute("class", "far-mark far-enso-wrap");
    ring.innerHTML = `<path class="far-enso" d="${ENSO_PATH}"/>`;
    Object.assign(ring.style, { width: `${size}px`, height: `${size}px`, left: `${random() * area.w}px`, top: `${random() * area.h}px`, transform: `rotate(${random() * 360}deg)` });
    host.appendChild(ring);
  }
}

/* ===== mount only what is near the screen; start downloads only when the wall is calm ===== */
let inFlight = 0, speed = 0;
function mount(piece) {
  const el = document.createElement("div");
  el.className = "pape";
  el.style.cssText = `left:${piece.x}px;top:${piece.y}px;width:${piece.w}px;height:${piece.h}px;--tilt:${piece.tilt}deg;--clip:${piece.clip}`;
  el.innerHTML = `<div class="shade"></div><button class="face" data-id="${piece.id}" aria-label="Open wallpaper"><img alt="" decoding="async"></button>`;
  piece.layer.el.appendChild(el);
  piece.el = el; piece.state = "idle";
}
function unmount(piece) {
  if (!piece.el) return;
  if (piece.state === "loading") {
    inFlight -= 1;
    const img = piece.el.querySelector("img"); img.onload = img.onerror = null; img.removeAttribute("src");
  }
  piece.el.remove(); piece.el = null; piece.state = "none";
}
function startLoad(piece) {
  piece.state = "loading"; inFlight += 1;
  const img = piece.el.querySelector("img"), urls = previewUrls(piece);
  let attempt = 0;
  const finish = (ok) => {
    if (piece.state !== "loading") return;
    inFlight -= 1; piece.state = ok ? "done" : "failed";
    if (ok) requestAnimationFrame(() => piece.el && piece.el.classList.add("in"));
    pump();
  };
  img.onload = () => finish(true);
  img.onerror = () => { attempt += 1; if (attempt < urls.length) img.src = urls[attempt]; else finish(false); };
  img.src = urls[0];
}
function pump() {
  if (speed > CONFIG.LOAD_SPEED_PX || inFlight >= CONFIG.MAX_PARALLEL_LOADS) return;
  const waiting = pieces.filter((p) => p.state === "idle").sort((a, b) => a.distance - b.distance);
  while (inFlight < CONFIG.MAX_PARALLEL_LOADS && waiting.length) startLoad(waiting.shift());
}
function sync() {
  const mountMargin = Math.max(vw, vh) * CONFIG.MOUNT_MARGIN, unmountMargin = Math.max(vw, vh) * CONFIG.UNMOUNT_MARGIN;
  for (const p of pieces) {
    const sx = p.x + current.x * p.depth, sy = p.y + current.y * p.depth;
    const outside = Math.max(-sx - p.w, sx - vw, -sy - p.h, sy - vh);
    p.distance = Math.hypot(sx + p.w / 2 - vw / 2, sy + p.h / 2 - vh / 2);
    if (!p.el && outside < mountMargin) mount(p);
    else if (p.el && outside > unmountMargin) unmount(p);
  }
}

/* ===== movement: one loop that sleeps when nothing moves ===== */
const target = { x: 0, y: 0 }, current = { x: 0, y: 0 };
let running = false, dragging = false;
const clampPan = () => { target.x = clamp(target.x, panMin.x, 0); target.y = clamp(target.y, panMin.y, 0); };

function frame() {
  const ease = dragging ? CONFIG.DRAG_EASE : CONFIG.EASE;
  const dx = (target.x - current.x) * ease, dy = (target.y - current.y) * ease;
  current.x += dx; current.y += dy; speed = Math.hypot(dx, dy);
  layers.forEach((layer) => { layer.el.style.transform = `translate3d(${current.x * layer.depth}px,${current.y * layer.depth}px,0)`; });
  sync(); pump();
  if (!dragging && Math.abs(target.x - current.x) < CONFIG.SETTLE_PX && Math.abs(target.y - current.y) < CONFIG.SETTLE_PX) { running = false; speed = 0; pump(); return; }
  requestAnimationFrame(frame);
}
function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }

let dragStart = null, lastMove = null, velocity = { x: 0, y: 0 }, dragDistance = 0;
stage.addEventListener("pointerdown", (e) => {
  if (viewer.classList.contains("open")) return;
  dragging = true; dragDistance = 0; velocity = { x: 0, y: 0 };
  dragStart = { x: e.clientX, y: e.clientY, tx: target.x, ty: target.y }; lastMove = { x: e.clientX, y: e.clientY };
  stage.setPointerCapture(e.pointerId); stage.classList.add("dragging"); wake();
});
stage.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const mx = e.clientX - dragStart.x, my = e.clientY - dragStart.y;
  dragDistance = Math.max(dragDistance, Math.hypot(mx, my));
  velocity = { x: e.clientX - lastMove.x, y: e.clientY - lastMove.y }; lastMove = { x: e.clientX, y: e.clientY };
  target.x = dragStart.tx + mx; target.y = dragStart.ty + my; clampPan();
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false; stage.classList.remove("dragging");
  if (dragDistance < CONFIG.DRAG_THRESHOLD_PX) {
    const face = document.elementFromPoint(e.clientX, e.clientY)?.closest(".face");
    if (face) openViewer(Number(face.dataset.id));
  } else { target.x += velocity.x * CONFIG.MOMENTUM; target.y += velocity.y * CONFIG.MOMENTUM; clampPan(); }
  wake();
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("click", (e) => { if (e.detail === 0) { const face = e.target.closest(".face"); if (face) openViewer(Number(face.dataset.id)); } });
stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? CONFIG.WHEEL_LINE_PX : 1;
  target.x -= e.deltaX * unit; target.y -= e.deltaY * unit; clampPan(); wake();
}, { passive: false });
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeViewer();
  const step = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (step && !viewer.classList.contains("open")) { target.x += step[0] * vw * CONFIG.KEY_STEP; target.y += step[1] * vh * CONFIG.KEY_STEP; clampPan(); wake(); }
});

/* ===== viewer: the whole wallpaper at its true proportions ===== */
function openViewer(id) {
  const piece = pieces.find((p) => p.id === id); if (!piece) return;
  const img = $("viewer-img"), url = fullUrl(piece.path), aspect = piece.srcW / piece.srcH;
  img.classList.remove("in"); img.removeAttribute("src");
  img.style.aspectRatio = `${piece.srcW} / ${piece.srcH}`;
  img.style.width = `min(var(--viewer-max-vw) * 1vw, ${aspect} * var(--viewer-max-vh) * 1vh)`;
  const cached = piece.el && piece.state === "done" ? piece.el.querySelector("img").currentSrc : "";
  const show = (src) => { img.src = src; img.classList.add("in"); };
  if (cached) show(cached);
  const full = new Image(); full.onload = () => show(url); full.src = url;
  $("viewer-dim").textContent = `${piece.srcW} × ${piece.srcH}`;
  $("viewer-dl").href = url;
  viewer.classList.add("open");
}
function closeViewer() { viewer.classList.remove("open"); }
viewer.addEventListener("click", (e) => { if (!e.target.closest("#viewer-dl")) closeViewer(); });

/* ===== start ===== */
let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const fx = panMin.x ? current.x / panMin.x : 0.5, fy = panMin.y ? current.y / panMin.y : 0.5;
    layout(); target.x = current.x = fx * panMin.x; target.y = current.y = fy * panMin.y; wake();
  }, 150);
});
paintPaper();
layout();
target.x = current.x = panMin.x / 2; target.y = current.y = panMin.y / 2;
wake();
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setTimeout(() => { target.x += vw * CONFIG.INTRO_DRIFT.x; target.y += vh * CONFIG.INTRO_DRIFT.y; clampPan(); wake(); }, CONFIG.INTRO_DRIFT_DELAY_MS);
}
$("intro").addEventListener("animationend", (e) => { if (e.target.id === "intro") e.target.remove(); });
