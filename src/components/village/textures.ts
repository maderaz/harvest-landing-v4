// Every surface in Nieuw Amsterdam is painted at runtime onto a 2D canvas.
// Nothing is fetched: no image files, no CDN, no loader states. Each helper
// returns a cached THREE.CanvasTexture (plus a matching normal map derived
// from its own luminance) so materials can be shared across the town.

import * as THREE from "three";
import { mulberry32, type Rng } from "./random";

type Ctx = CanvasRenderingContext2D;

interface Painted {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

const cache = new Map<string, Painted>();
const disposables: THREE.Texture[] = [];

function canvasOf(size: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/**
 * Cheap normal map: treat the colour texture's luminance as a height field
 * and take its gradient. Good enough for brick courses, plank seams and
 * cobbles, and it costs nothing to ship.
 */
function normalFromCanvas(source: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const size = source.width;
  const src = source.getContext("2d")!.getImageData(0, 0, size, size).data;
  const { canvas, ctx } = canvasOf(size);
  const out = ctx.createImageData(size, size);

  const lum = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x: number, y: number) => lum[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function register(
  key: string,
  size: number,
  repeat: number,
  normalStrength: number,
  paint: (ctx: Ctx, size: number, rng: Rng) => void,
): Painted {
  const cached = cache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = canvasOf(size);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  paint(ctx, size, mulberry32(hash));

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const normalMap = new THREE.CanvasTexture(normalFromCanvas(canvas, normalStrength));
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);
  normalMap.anisotropy = 4;

  const painted = { map, normalMap };
  cache.set(key, painted);
  disposables.push(map, normalMap);
  return painted;
}

/** Called on unmount so a re-entered page does not leak GPU memory. */
export function disposeTextures() {
  for (const t of disposables) t.dispose();
  disposables.length = 0;
  cache.clear();
}

// ---------------------------------------------------------------------------
// painters
// ---------------------------------------------------------------------------

function grain(ctx: Ctx, size: number, rng: Rng, amount: number, alpha: number) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
}

function brickPainter(mortar: string, tones: string[]) {
  return (ctx: Ctx, size: number, rng: Rng) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, size, size);

    // Dutch "kleine moppen" are small: roughly 21 x 5 cm laid in stretcher bond.
    const rows = 26;
    const h = size / rows;
    const w = h * 4.2;
    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * w * 0.5 - w;
      for (let x = offset; x < size + w; x += w) {
        const tone = tones[Math.floor(rng() * tones.length)];
        ctx.fillStyle = tone;
        ctx.fillRect(x + 1, row * h + 1, w - 2.2, h - 2.2);
        // A darker weathered lip along the bottom edge of every brick.
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.fillRect(x + 1, row * h + h - 3.2, w - 2.2, 1.4);
        if (rng() < 0.14) {
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(x + 2, row * h + 2, w - 5, h * 0.35);
        }
      }
    }
    grain(ctx, size, rng, size * 6, 0.05);
  };
}

export function brickRed() {
  return register(
    "brick-red",
    512,
    1,
    3.2,
    brickPainter("#b9ad9a", ["#8d4433", "#95503a", "#7d3a2c", "#a2573f", "#874230", "#9c5b45"]),
  );
}

export function brickYellow() {
  // Yellow IJssel brick, shipped from Holland as ballast - the fancy houses.
  return register(
    "brick-yellow",
    512,
    1,
    3.2,
    brickPainter("#c8bfa6", ["#c9ae74", "#d4bb84", "#bfa269", "#d8c496", "#c3a86f"]),
  );
}

export function plaster() {
  return register("plaster", 256, 1, 1.2, (ctx, size, rng) => {
    ctx.fillStyle = "#e6dfcd";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const r = rng() * 18 + 4;
      ctx.fillStyle = `rgba(${190 + rng() * 45},${182 + rng() * 45},${160 + rng() * 45},0.25)`;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Damp staining creeping up from the ground course.
    const stain = ctx.createLinearGradient(0, size, 0, size * 0.55);
    stain.addColorStop(0, "rgba(96,88,70,0.34)");
    stain.addColorStop(1, "rgba(96,88,70,0)");
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, size, size);
    grain(ctx, size, rng, size * 4, 0.05);
  });
}

export function roofTile() {
  return register("roof-tile", 512, 1, 4.5, (ctx, size, rng) => {
    ctx.fillStyle = "#5d2c22";
    ctx.fillRect(0, 0, size, size);
    const cols = 12;
    const w = size / cols;
    const h = w * 1.35;
    for (let row = -1; row * h < size; row++) {
      for (let col = -1; col <= cols; col++) {
        const x = col * w + (row % 2 ? w * 0.5 : 0);
        const y = row * h;
        const shade = 0.82 + rng() * 0.34;
        // S-pantile: a bright barrel with a shadowed valley to its left.
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, `rgba(${Math.floor(96 * shade)},${Math.floor(44 * shade)},${Math.floor(32 * shade)},1)`);
        g.addColorStop(0.42, `rgba(${Math.floor(184 * shade)},${Math.floor(88 * shade)},${Math.floor(58 * shade)},1)`);
        g.addColorStop(0.72, `rgba(${Math.floor(148 * shade)},${Math.floor(68 * shade)},${Math.floor(46 * shade)},1)`);
        g.addColorStop(1, `rgba(${Math.floor(78 * shade)},${Math.floor(36 * shade)},${Math.floor(26 * shade)},1)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h * 0.86);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.14, x, y + h * 0.86);
        ctx.closePath();
        ctx.fill();
        if (rng() < 0.12) {
          ctx.fillStyle = "rgba(120,140,80,0.28)"; // moss in the wet courses
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.8, w * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    grain(ctx, size, rng, size * 3, 0.06);
  });
}

export function thatch() {
  return register("thatch", 512, 1, 5.5, (ctx, size, rng) => {
    ctx.fillStyle = "#7c6334";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const len = 8 + rng() * 26;
      const tilt = (rng() - 0.5) * 0.5;
      const v = 100 + rng() * 105;
      ctx.strokeStyle = `rgba(${v + 40},${v + 12},${v * 0.55},0.5)`;
      ctx.lineWidth = 1 + rng();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + tilt * len, y + len);
      ctx.stroke();
    }
    // Combed courses - the horizontal bands a thatcher leaves behind.
    for (let y = 0; y < size; y += size / 6) {
      ctx.fillStyle = "rgba(40,28,12,0.22)";
      ctx.fillRect(0, y, size, 3);
    }
  });
}

export function woodPlank() {
  return register("wood-plank", 512, 1, 3.0, (ctx, size, rng) => {
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(0, 0, size, size);
    const planks = 7;
    const w = size / planks;
    for (let i = 0; i < planks; i++) {
      const base = 84 + rng() * 46;
      ctx.fillStyle = `rgb(${base + 22},${base - 8},${base - 34})`;
      ctx.fillRect(i * w + 1.5, 0, w - 3, size);
      for (let g = 0; g < 34; g++) {
        const y = rng() * size;
        ctx.strokeStyle = `rgba(${base - 40},${base - 54},${base - 66},${0.15 + rng() * 0.3})`;
        ctx.lineWidth = 0.6 + rng() * 1.4;
        ctx.beginPath();
        ctx.moveTo(i * w + 2, y);
        ctx.bezierCurveTo(
          i * w + w * 0.3, y + (rng() - 0.5) * 16,
          i * w + w * 0.7, y + (rng() - 0.5) * 16,
          i * w + w - 2, y + (rng() - 0.5) * 10,
        );
        ctx.stroke();
      }
      if (rng() < 0.5) {
        const ky = rng() * size;
        const kx = i * w + w * (0.3 + rng() * 0.4);
        for (let r = 7; r > 0; r--) {
          ctx.strokeStyle = `rgba(${base - 55},${base - 66},${base - 76},0.5)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(kx, ky, r * 1.5, r * 0.9, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    grain(ctx, size, rng, size * 3, 0.05);
  });
}

export function timber() {
  // Darker, tar-treated structural oak: palisade logs, piers, hulls.
  return register("timber", 256, 1, 2.6, (ctx, size, rng) => {
    ctx.fillStyle = "#3b2c1d";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * size;
      const v = 44 + rng() * 66;
      ctx.strokeStyle = `rgba(${v + 18},${v},${v - 14},${0.3 + rng() * 0.4})`;
      ctx.lineWidth = 0.7 + rng() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 12, size);
      ctx.stroke();
    }
  });
}

export function stoneWall() {
  return register("stone-wall", 512, 1, 4.2, (ctx, size, rng) => {
    ctx.fillStyle = "#6b6355";
    ctx.fillRect(0, 0, size, size);
    const rows = 9;
    const h = size / rows;
    for (let row = 0; row < rows; row++) {
      let x = -rng() * 40;
      while (x < size) {
        const w = h * (1.1 + rng() * 1.9);
        const v = 118 + rng() * 58;
        ctx.fillStyle = `rgb(${v},${v - 6},${v - 20})`;
        ctx.beginPath();
        ctx.roundRect(x + 2, row * h + 2, w - 4, h - 4, 3 + rng() * 4);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fillRect(x + 3, row * h + h - 6, w - 6, 2.5);
        x += w;
      }
    }
    grain(ctx, size, rng, size * 8, 0.06);
  });
}

export function cobble() {
  return register("cobble", 512, 1, 3.6, (ctx, size, rng) => {
    ctx.fillStyle = "#4b463c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1500; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 5 + rng() * 8;
      const v = 96 + rng() * 62;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
      g.addColorStop(0, `rgb(${v + 26},${v + 22},${v + 12})`);
      g.addColorStop(1, `rgb(${v - 26},${v - 26},${v - 32})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.7 + rng() * 0.35), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    grain(ctx, size, rng, size * 6, 0.07);
  });
}

export function dirtRoad() {
  return register("dirt-road", 256, 1, 1.8, (ctx, size, rng) => {
    ctx.fillStyle = "#7d6a4c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2400; i++) {
      const v = 88 + rng() * 70;
      ctx.fillStyle = `rgba(${v + 22},${v},${v - 30},${0.2 + rng() * 0.35})`;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 1 + rng() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cart ruts, worn parallel to the road direction. Kept faint - too
    // strong and the ribbon reads as decking rather than beaten earth.
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(70,58,40,${0.05 + rng() * 0.07})`;
      ctx.lineWidth = 3 + rng() * 9;
      const x = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 24, size);
      ctx.stroke();
    }
  });
}

export function grassGround() {
  return register("grass", 512, 1, 1.4, (ctx, size, rng) => {
    ctx.fillStyle = "#5d6b38";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 16000; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const g = 78 + rng() * 76;
      ctx.strokeStyle = `rgba(${g * 0.72},${g},${g * 0.44},${0.35 + rng() * 0.4})`;
      ctx.lineWidth = 0.8 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 5, y - 3 - rng() * 6);
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${120 + rng() * 60},${110 + rng() * 50},${70 + rng() * 40},0.2)`;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 12 + rng() * 40, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Neutral grey ground detail. The terrain's colour - sand, turf, trodden
 * dirt, orchard shade - lives in vertex colours; this only supplies the
 * high-frequency break-up that keeps a 400 m field from looking like felt.
 */
export function groundDetail() {
  return register("ground-detail", 512, 1, 1.1, (ctx, size, rng) => {
    ctx.fillStyle = "#b4b4b4";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
      const v = 130 + rng() * 92;
      ctx.strokeStyle = `rgba(${v},${v},${v},${0.25 + rng() * 0.35})`;
      ctx.lineWidth = 0.7 + rng() * 1.3;
      const x = rng() * size;
      const y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 6, y - 2 - rng() * 7);
      ctx.stroke();
    }
    for (let i = 0; i < 260; i++) {
      const v = 96 + rng() * 120;
      ctx.fillStyle = `rgba(${v},${v},${v},0.16)`;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, 8 + rng() * 46, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function sailCloth() {
  return register("sail", 256, 1, 1.6, (ctx, size, rng) => {
    ctx.fillStyle = "#ded3bb";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5000; i++) {
      const v = 196 + rng() * 46;
      ctx.fillStyle = `rgba(${v},${v - 8},${v - 26},0.35)`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 1);
    }
    // Bolt seams every few feet, the way a sailmaker stitches panels.
    for (let y = 0; y < size; y += size / 5) {
      ctx.fillStyle = "rgba(120,104,74,0.45)";
      ctx.fillRect(0, y, size, 2);
    }
  });
}

export function fieldCrop() {
  return register("field", 256, 1, 1.5, (ctx, size, rng) => {
    ctx.fillStyle = "#6b5a33";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 14) {
      ctx.fillStyle = `rgb(${110 + rng() * 30},${118 + rng() * 34},${52 + rng() * 26})`;
      ctx.fillRect(0, y, size, 8);
      ctx.fillStyle = "rgba(50,40,22,0.4)";
      ctx.fillRect(0, y + 8, size, 3);
    }
    grain(ctx, size, rng, size * 8, 0.08);
  });
}

/**
 * The Prinsenvlag - orange, white and blue - as flown by the West India
 * Company over Fort Amsterdam, with the company's monogram in the centre.
 */
export function princeFlag(): THREE.CanvasTexture {
  const key = "flag";
  const existing = cache.get(key);
  if (existing) return existing.map;

  const { canvas, ctx } = canvasOf(256);
  const bands = ["#d97a25", "#efe9dc", "#2a4a86"];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, (i * 256) / 3, 256, 256 / 3 + 1);
  }
  ctx.fillStyle = "#1e1a14";
  ctx.font = "bold 74px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.75;
  ctx.fillText("GWC", 128, 130);
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const normalMap = map; // flat cloth, no relief needed
  cache.set(key, { map, normalMap });
  disposables.push(map);
  return map;
}

/** Small window pane grid - leaded glass, lit warm after dark. */
export function windowGlass(): THREE.CanvasTexture {
  const key = "window";
  const existing = cache.get(key);
  if (existing) return existing.map;

  const { canvas, ctx } = canvasOf(128);
  ctx.fillStyle = "#2b3a3c";
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(7);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 3; x++) {
      const v = 60 + rng() * 60;
      ctx.fillStyle = `rgb(${v * 0.7},${v * 0.95},${v})`;
      ctx.fillRect(x * 42 + 5, y * 31 + 4, 32, 23);
    }
  }
  ctx.strokeStyle = "#20211d";
  ctx.lineWidth = 4;
  for (let x = 0; x <= 3; x++) {
    ctx.beginPath();
    ctx.moveTo(x * 42 + 2, 0);
    ctx.lineTo(x * 42 + 2, 128);
    ctx.stroke();
  }
  for (let y = 0; y <= 4; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * 31 + 1);
    ctx.lineTo(128, y * 31 + 1);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, { map, normalMap: map });
  disposables.push(map);
  return map;
}
