// Procedural PBR textures, generated at load time on a canvas: albedo, normal and
// roughness for every surface in Room 214. No downloaded assets (the network used to
// build this blocks the usual CC0 sites), so nothing here needs a licence.

import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

/** Small fast deterministic RNG so textures look the same every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Value noise (tileable), returns 0..1. */
function noiseField(w: number, h: number, cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const gw = cells;
  const gh = Math.max(1, Math.round((cells * h) / w));
  const grid = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * gh;
    const y0 = Math.floor(gy) % gh;
    const y1 = (y0 + 1) % gh;
    const fy = sm(gy - Math.floor(gy));
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * gw;
      const x0 = Math.floor(gx) % gw;
      const x1 = (x0 + 1) % gw;
      const fx = sm(gx - Math.floor(gx));
      const a = grid[y0 * gw + x0] + (grid[y0 * gw + x1] - grid[y0 * gw + x0]) * fx;
      const b = grid[y1 * gw + x0] + (grid[y1 * gw + x1] - grid[y1 * gw + x0]) * fx;
      out[y * w + x] = a + (b - a) * fy;
    }
  }
  return out;
}

function fbm(w: number, h: number, base: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noiseField(w, h, base << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Normal map from a height field (tileable Sobel). */
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): HTMLCanvasElement {
  const [c, g] = canvas(w, hh);
  const img = g.createImageData(w, hh);
  const at = (x: number, y: number) => h[((y + hh) % hh) * w + ((x + w) % w)];
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/** Greyscale canvas from a float field (for roughness: three reads the G channel). */
function greyCanvas(f: Float32Array, w: number, h: number): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(0, Math.min(255, f[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export interface PBRSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

function set(albedo: HTMLCanvasElement, normal: HTMLCanvasElement, rough: HTMLCanvasElement): PBRSet {
  return { map: tex(albedo, true), normalMap: tex(normal, false), roughnessMap: tex(rough, false) };
}

/** Clone a set with a repeat (shares the image data). */
export function repeatSet(s: PBRSet, rx: number, ry: number): PBRSet {
  const c = (t: THREE.Texture) => {
    const n = t.clone();
    n.repeat.set(rx, ry);
    n.needsUpdate = true;
    return n;
  };
  return { map: c(s.map), normalMap: c(s.normalMap), roughnessMap: c(s.roughnessMap) };
}

// ------------------------------------------------------------------ surfaces

/** Waxed vinyl composition tile, 30 cm squares, 4x4 per texture (1.2 m). */
export function floorTile(size = 1024): PBRSet {
  const r = rng(11);
  const [a, g] = canvas(size);
  const n = size / 4;
  const speck = fbm(size, size, 64, 2, 3);
  const big = fbm(size, size, 4, 3, 5);
  const img = g.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const tint: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const v = r();
    tint.push(v < 0.18 ? [176, 184, 196] : v < 0.3 ? [140, 152, 172] : [154, 166, 186]);
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / n);
      const ty = Math.floor(y / n);
      const lx = x % n;
      const ly = y % n;
      const joint = Math.min(lx, ly, n - 1 - lx, n - 1 - ly) < 1.5;
      const [cr, cg, cb] = tint[ty * 4 + tx];
      const i = y * size + x;
      const s = speck[i] > 0.72 ? 26 : speck[i] < 0.25 ? -14 : 0;
      const wave = (big[i] - 0.5) * 22;
      const k = joint ? 0.6 : 1;
      img.data[i * 4] = (cr + s + wave) * k;
      img.data[i * 4 + 1] = (cg + s + wave) * k;
      img.data[i * 4 + 2] = (cb + s + wave * 0.8) * k;
      img.data[i * 4 + 3] = 255;
      height[i] = joint ? 0 : 1 - speck[i] * 0.05;
      rough[i] = joint ? 0.7 : 0.22 + big[i] * 0.18 + (speck[i] > 0.7 ? 0.1 : 0);
    }
  g.putImageData(img, 0, 0);
  // scuff marks (dark rubber arcs) and a few lighter worn patches
  g.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(40,40,46,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    const cx = r() * size;
    const cy = r() * size;
    g.arc(cx, cy, 8 + r() * 40, r() * 6, r() * 6 + 0.6 + r());
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 40; k++) {
    const cx = Math.floor(r() * size);
    const cy = Math.floor(r() * size);
    for (let d = 0; d < 30; d++) rough[((cy + d) % size) * size + ((cx + Math.floor(r() * 20)) % size)] = 0.55;
  }
  return set(a, normalFromHeight(height, size, size, 2.2), greyCanvas(rough, size, size));
}

/** Painted concrete block (CMU) 40 x 20 cm. Texture = 1.6 m square. */
export function blockWall(size = 1024, paint: [number, number, number] = [234, 224, 202]): PBRSet {
  const bw = size / 4;
  const bh = size / 8;
  const pit = fbm(size, size, 128, 2, 21);
  const blot = fbm(size, size, 8, 3, 22);
  const [a, g] = canvas(size);
  const img = g.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    for (let x = 0; x < size; x++) {
      const lx = (x + off) % bw;
      const ly = y % bh;
      const mortar = Math.min(lx, bw - 1 - lx) < 3 || Math.min(ly, bh - 1 - ly) < 3;
      const i = y * size + x;
      const p = pit[i];
      const pits = p > 0.78 ? -0.5 : 0;
      const shade = (blot[i] - 0.5) * 16 + (pits ? -18 : 0) + (mortar ? -10 : 0);
      img.data[i * 4] = paint[0] + shade;
      img.data[i * 4 + 1] = paint[1] + shade;
      img.data[i * 4 + 2] = paint[2] + shade * 0.9;
      img.data[i * 4 + 3] = 255;
      height[i] = (mortar ? 0.2 : 1) + pits * 0.3 + p * 0.06;
      rough[i] = 0.78 + p * 0.12;
    }
  }
  g.putImageData(img, 0, 0);
  return set(a, normalFromHeight(height, size, size, 1.6), greyCanvas(rough, size, size));
}

/** Acoustic ceiling tiles 60 cm with fissures/perforations and a T-bar grid. Texture = 1.2 m. */
export function ceilingTile(size = 512): PBRSet {
  const r = rng(31);
  const n = size / 2;
  const fis = fbm(size, size, 48, 3, 33);
  const [a, g] = canvas(size);
  const img = g.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size).fill(0.92);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const lx = x % n;
      const ly = y % n;
      const bar = Math.min(lx, ly, n - 1 - lx, n - 1 - ly) < 4;
      const i = y * size + x;
      const hole = fis[i] < 0.3;
      const v = bar ? 222 : hole ? 196 : 232 + (fis[i] - 0.5) * 10;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v - 2;
      img.data[i * 4 + 2] = v - 8;
      img.data[i * 4 + 3] = 255;
      height[i] = bar ? 1.3 : hole ? 0.6 : 1;
      if (bar) rough[i] = 0.5;
    }
  g.putImageData(img, 0, 0);
  // pinhole perforations
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    if (Math.min(x % n, y % n, n - 1 - (x % n), n - 1 - (y % n)) < 6) continue;
    g.fillStyle = 'rgba(120,118,112,0.8)';
    g.fillRect(x, y, 2, 2);
    height[y * size + x] = 0.3;
  }
  return set(a, normalFromHeight(height, size, size, 1.4), greyCanvas(rough, size, size));
}

/** Light laminate desktop with fine grain and scratches. */
export function laminate(size = 512): PBRSet {
  const r = rng(41);
  const grain = fbm(size, size, 6, 4, 42);
  const fine = fbm(size, size, 96, 1, 43);
  const [a, g] = canvas(size);
  const img = g.createImageData(size, size);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const stripe = Math.sin((x / size) * 60 + grain[i] * 18) * 0.5 + 0.5;
      const v = stripe * 18 + fine[i] * 8;
      img.data[i * 4] = 206 + v;
      img.data[i * 4 + 1] = 160 + v * 0.8;
      img.data[i * 4 + 2] = 104 + v * 0.5;
      img.data[i * 4 + 3] = 255;
      rough[i] = 0.42 + fine[i] * 0.1;
      height[i] = stripe * 0.05;
    }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 70; k++) {
    g.lineWidth = 0.6 + r();
    g.beginPath();
    const x = r() * size;
    const y = r() * size;
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 40);
    g.stroke();
  }
  // pencil marks and a ring stain
  g.strokeStyle = 'rgba(70,70,80,0.25)';
  for (let k = 0; k < 12; k++) {
    g.beginPath();
    const x = r() * size;
    const y = r() * size;
    g.moveTo(x, y);
    g.lineTo(x + r() * 30, y + (r() - 0.5) * 8);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,80,40,0.18)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(size * 0.7, size * 0.3, 28, 0, Math.PI * 2);
  g.stroke();
  return set(a, normalFromHeight(height, size, size, 1), greyCanvas(rough, size, size));
}

/** Brushed metal: fine directional streaks (normal + roughness). */
export function brushed(size = 256): PBRSet {
  const r = rng(51);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    let v = r();
    for (let x = 0; x < size; x++) {
      v = v * 0.96 + r() * 0.04;
      h[y * size + x] = v;
    }
  }
  const [a, g] = canvas(size);
  g.fillStyle = '#b8bcc4';
  g.fillRect(0, 0, size, size);
  const rough = new Float32Array(size * size).map((_, i) => 0.3 + h[i] * 0.15);
  return set(a, normalFromHeight(h, size, size, 2.5), greyCanvas(rough, size, size));
}

/** Painted metal (door, lockers): orange-peel and wear. */
export function paintedMetal(color: [number, number, number], seed: number, size = 512): PBRSet {
  const peel = fbm(size, size, 64, 2, seed);
  const wear = fbm(size, size, 6, 4, seed + 7);
  const [a, g] = canvas(size);
  const img = g.createImageData(size, size);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const w = wear[i] > 0.74 ? (wear[i] - 0.74) * 4 : 0;
    const s = (peel[i] - 0.5) * 10 - w * 40;
    img.data[i * 4] = color[0] + s;
    img.data[i * 4 + 1] = color[1] + s;
    img.data[i * 4 + 2] = color[2] + s;
    img.data[i * 4 + 3] = 255;
    rough[i] = 0.35 + peel[i] * 0.15 + w * 0.3;
    height[i] = peel[i] * 0.3;
  }
  g.putImageData(img, 0, 0);
  return set(a, normalFromHeight(height, size, size, 1.2), greyCanvas(rough, size, size));
}

/** Knit (sweaters) or twill (trousers) normal + roughness; colour comes from the material. */
export function fabric(kind: 'knit' | 'twill' | 'nylon', size = 256): { normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const h = new Float32Array(size * size);
  const n = fbm(size, size, 32, 2, kind === 'knit' ? 61 : kind === 'twill' ? 62 : 63);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v: number;
      if (kind === 'knit') {
        const cx = x % 16;
        const row = Math.floor(y / 12);
        const ly = (y % 12) / 12;
        const side = cx < 8 ? cx / 8 : (16 - cx) / 8;
        v = Math.sin(side * Math.PI) * (0.6 + 0.4 * Math.sin(ly * Math.PI + (row % 2) * 0.5));
      } else if (kind === 'twill') v = Math.sin(((x + y) / size) * Math.PI * 80) * 0.5 + 0.5;
      else v = (x % 24 < 2 || y % 24 < 2 ? 1 : 0.4) + Math.sin((x / size) * Math.PI * 128) * 0.1;
      h[y * size + x] = v + n[y * size + x] * 0.3;
    }
  const rough = new Float32Array(size * size).map((_, i) => (kind === 'nylon' ? 0.5 : 0.85) + n[i] * 0.1);
  return { normalMap: tex(normalFromHeight(h, size, size, kind === 'knit' ? 3 : 1.5), false), roughnessMap: tex(greyCanvas(rough, size, size), false) };
}

/** Chalkboard: green slate, chalk dust smudges, chalk writing (passed as a drawing callback). */
export function chalkboard(draw: (g: Ctx, w: number, h: number) => void): PBRSet {
  const w = 1024;
  const h = 384;
  const dust = fbm(w, h, 12, 4, 71);
  const [a, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const d = dust[i] > 0.55 ? (dust[i] - 0.55) * 90 : 0;
    img.data[i * 4] = 38 + d;
    img.data[i * 4 + 1] = 86 + d;
    img.data[i * 4 + 2] = 64 + d;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // eraser swipes
  const r = rng(72);
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(220,230,220,${0.03 + r() * 0.04})`;
    g.save();
    g.translate(r() * w, r() * h);
    g.rotate((r() - 0.5) * 0.4);
    g.fillRect(-90, -14, 180, 28);
    g.restore();
  }
  draw(g, w, h);
  const rough = new Float32Array(w * h).fill(0.9);
  const height = dust.map((v) => v * 0.2);
  const t = set(a, normalFromHeight(height, w, h, 1), greyCanvas(rough, w, h));
  for (const x of [t.map, t.normalMap, t.roughnessMap]) x.wrapS = x.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Wired safety glass for the door window: a wire grid with alpha. */
export function wiredGlass(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  g.strokeStyle = 'rgba(60,64,70,0.75)';
  g.lineWidth = 1.5;
  for (let x = 0; x <= 128; x += 21) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  for (let y = 0; y <= 512; y += 21) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Smudges and fingerprints (a decal near the light switch), and floor scuff decals. */
export function smudgeDecal(seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  const [c, g] = canvas(256);
  for (let k = 0; k < 26; k++) {
    const x = 60 + r() * 136;
    const y = 60 + r() * 136;
    const grd = g.createRadialGradient(x, y, 1, x, y, 10 + r() * 18);
    grd.addColorStop(0, 'rgba(70,60,50,0.22)');
    grd.addColorStop(1, 'rgba(70,60,50,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, 10 + r() * 14, 7 + r() * 8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft light pool (radial falloff), for light spill and shafts. */
export function radialTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 0, 1, 64, 0, 128);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.5, '#555555');
  grd.addColorStop(1, '#000000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Vertical light shaft gradient (for beams through blinds and the door gap). */
export function shaftTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.3, 'rgba(0,0,0,0)');
  edge.addColorStop(0.7, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

/** Build every PBR set the room needs, reporting progress (0..1). */
export async function buildLibrary(onProgress: (p: number, label: string) => void, quality: 'low' | 'high'): Promise<Library> {
  const S = quality === 'low' ? 512 : 1024;
  const steps: [string, () => unknown][] = [];
  const lib = {} as Library;
  steps.push(['floor tiles', () => (lib.floor = floorTile(S))]);
  steps.push(['painted block', () => (lib.wall = blockWall(S))]);
  steps.push(['ceiling tiles', () => (lib.ceiling = ceilingTile(512))]);
  steps.push(['laminate', () => (lib.laminate = laminate(512))]);
  steps.push(['brushed steel', () => (lib.brushed = brushed(256))]);
  steps.push(['door paint', () => (lib.door = paintedMetal([72, 108, 170], 81))]);
  steps.push(['locker paint', () => (lib.locker = paintedMetal([158, 166, 180], 91))]);
  steps.push(['knit', () => (lib.knit = fabric('knit'))]);
  steps.push(['twill', () => (lib.twill = fabric('twill'))]);
  steps.push(['nylon', () => (lib.nylon = fabric('nylon'))]);
  for (let i = 0; i < steps.length; i++) {
    onProgress(i / steps.length, steps[i][0]);
    await new Promise((r) => setTimeout(r, 0));
    steps[i][1]();
  }
  onProgress(1, 'done');
  return lib;
}

export interface Library {
  floor: PBRSet;
  wall: PBRSet;
  ceiling: PBRSet;
  laminate: PBRSet;
  brushed: PBRSet;
  door: PBRSet;
  locker: PBRSet;
  knit: { normalMap: THREE.Texture; roughnessMap: THREE.Texture };
  twill: { normalMap: THREE.Texture; roughnessMap: THREE.Texture };
  nylon: { normalMap: THREE.Texture; roughnessMap: THREE.Texture };
}
