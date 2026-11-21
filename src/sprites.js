// Sprite loading: slices Terraria-style vertical sheets into per-frame canvas textures.
import * as THREE from "../vendor/three.module.min.js";

const META = {
  bunny: { src: "bunny.png", fw: 48, fh: 40, n: 7 },
  lepus: { src: "lepus.png", fw: 100, fh: 76, n: 7 },
  lepus_epic: { src: "lepus_epic.png", fw: 100, fh: 76, n: 7 },
  small_lepus: { src: "small_lepus.png", fw: 48, fh: 40, n: 5 },
  lepuszilla: { src: "lepuszilla.png", fw: 92, fh: 68, n: 1 },
  small_egg: { src: "small_egg.png" },
  big_egg: { src: "big_egg.png" },
  suspicious_egg: { src: "suspicious_egg.png" },
  choc_egg: { src: "choc_egg.png", fw: 22, fh: 28, n: 2 },
};

export const sheets = {};

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("failed " + src));
    i.src = src;
  });
}

// Tight-crop transparent borders (shared per sheet so frames don't jitter) and return a texture.
function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flipped(c) {
  const f = document.createElement("canvas");
  f.width = c.width; f.height = c.height;
  const g = f.getContext("2d");
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return tex(f);
}

function cropBox(canvases) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const c of canvases) {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
  }
  if (x1 < 0) return { x: 0, y: 0, w: canvases[0].width, h: canvases[0].height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function makeSheet(img, m) {
  const fw = m.fw || img.width, fh = m.fh || img.height, n = m.n || 1;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("canvas");
    c.width = fw; c.height = fh;
    c.getContext("2d").drawImage(img, 0, i * fh, fw, fh, 0, 0, fw, fh);
    raw.push(c);
  }
  const box = cropBox(raw);
  const cs = raw.map((r) => {
    const c = document.createElement("canvas");
    c.width = box.w; c.height = box.h;
    c.getContext("2d").drawImage(r, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return c;
  });
  return { frames: cs.map(tex), framesF: cs.map(flipped), w: box.w, h: box.h, n };
}

function canvasSheet(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  return { frames: [tex(c)], framesF: [flipped(c)], w, h, n: 1 };
}

function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }

function carrotArt(g, golden) {
  const body = golden ? "#ffd23a" : "#f28a1c", shade = golden ? "#d9a21a" : "#c96a10", leaf = "#4cc24a";
  px(g, 6, 0, 2, 5, leaf); px(g, 4, 1, 2, 3, "#3a9c3a"); px(g, 8, 1, 2, 3, "#3a9c3a"); px(g, 7, -1 + 1, 2, 3, leaf);
  px(g, 4, 5, 8, 4, body); px(g, 5, 9, 6, 4, body); px(g, 6, 13, 4, 4, body); px(g, 7, 17, 2, 3, body);
  px(g, 10, 6, 2, 3, shade); px(g, 9, 10, 2, 3, shade); px(g, 6, 7, 2, 1, shade); px(g, 7, 12, 2, 1, shade);
  if (golden) { px(g, 5, 6, 1, 2, "#fff6a8"); px(g, 6, 5, 1, 1, "#fff"); }
}

export async function loadSprites() {
  await Promise.all(
    Object.entries(META).map(async ([k, m]) => {
      sheets[k] = makeSheet(await loadImg("assets/sprites/" + m.src), m);
    })
  );
  sheets.carrot = canvasSheet(16, 22, (g) => { g.translate(0, 1); carrotArt(g, false); });
  sheets.golden = canvasSheet(16, 22, (g) => { g.translate(0, 1); carrotArt(g, true); });
  // Garden patches: dirt mound with leafy tuft (empty) and with a carrot top showing (ripe).
  const patch = (ripe, golden) => (g) => {
    px(g, 2, 12, 20, 6, "#6b4423"); px(g, 4, 10, 16, 3, "#7d5230"); px(g, 6, 18, 12, 2, "#4f3119");
    const leaf = ["#3a9c3a", "#4cc24a", "#66dd5c"];
    for (let i = 0; i < 5; i++) px(g, 6 + i * 3, 4 + (i % 2) * 2, 2, 7 - (i % 2) * 2, leaf[i % 3]);
    if (ripe) { px(g, 9, 6, 6, 6, golden ? "#ffd23a" : "#f28a1c"); px(g, 10, 5, 4, 2, golden ? "#ffe97a" : "#ff9f33"); }
  };
  sheets.patch_empty = canvasSheet(24, 20, patch(false, false));
  sheets.patch_ripe = canvasSheet(24, 20, patch(true, false));
  sheets.patch_golden = canvasSheet(24, 20, patch(true, true));
  sheets.heart = canvasSheet(9, 8, (g) => {
    const c = "#ff4d6d";
    px(g, 1, 0, 3, 1, c); px(g, 5, 0, 3, 1, c); px(g, 0, 1, 9, 3, c); px(g, 1, 4, 7, 1, c); px(g, 2, 5, 5, 1, c); px(g, 3, 6, 3, 1, c); px(g, 4, 7, 1, 1, c);
    px(g, 1, 1, 2, 1, "#ff9db0");
  });
  sheets.hungry = canvasSheet(9, 9, (g) => {
    px(g, 3, 0, 3, 6, "#ffd23a"); px(g, 3, 7, 3, 2, "#ffd23a"); px(g, 4, 1, 1, 4, "#a06a00");
  });
  sheets.sparkle = canvasSheet(9, 9, (g) => {
    px(g, 4, 0, 1, 9, "#fff6a8"); px(g, 0, 4, 9, 1, "#fff6a8"); px(g, 3, 3, 3, 3, "#fff");
  });
  sheets.cloud = canvasSheet(64, 24, (g) => {
    g.fillStyle = "#fff";
    for (const [x, y, w, h] of [[4, 12, 56, 8], [12, 6, 24, 10], [28, 3, 22, 12], [44, 9, 16, 8]]) g.fillRect(x, y, w, h);
  });
  // Soft blob shadow.
  const sc = document.createElement("canvas");
  sc.width = sc.height = 64;
  const sg = sc.getContext("2d");
  const grad = sg.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(0,0,0,0.55)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
  sheets.shadow = { frames: [new THREE.CanvasTexture(sc)], framesF: [], w: 64, h: 64, n: 1 };
  return sheets;
}

// Small data-URL icons for the HUD (first frame of a sheet).
const iconCache = {};
export function iconURL(sheetName, frame = 0) {
  const k = sheetName + frame;
  if (iconCache[k]) return iconCache[k];
  const t = sheets[sheetName].frames[frame];
  iconCache[k] = t.image.toDataURL();
  return iconCache[k];
}
