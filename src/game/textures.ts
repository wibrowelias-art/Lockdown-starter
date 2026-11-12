import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const ROUND = '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';
const CHALK = '"Fredoka", "Comic Sans MS", cursive';

/** Green board: "BIOLOGY FINAL 10:00 - 11:30", "NO PHONES. NO TALKING. Good luck!" and a DNA helix. */
export function boardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 384);
  g.fillStyle = '#2f6a50';
  g.fillRect(0, 0, 1024, 384);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 1024, Math.random() * 384, 120, 6);
  g.fillStyle = '#f4f4ec';
  g.font = `600 70px ${CHALK}`;
  g.fillText('BIOLOGY FINAL', 50, 105);
  g.font = `500 46px ${CHALK}`;
  g.fillText('10:00 - 11:30', 54, 170);
  g.font = `600 44px ${CHALK}`;
  g.fillText('NO PHONES. NO TALKING.', 54, 285);
  g.fillText('Good luck!', 620, 285);
  // DNA helix
  g.strokeStyle = '#f4f4ec';
  g.lineWidth = 5;
  const x0 = 600;
  const x1 = 960;
  for (const ph of [0, Math.PI]) {
    g.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const y = 140 + Math.sin((x - x0) / 30 + ph) * 38;
      if (x === x0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 3;
  for (let x = x0 + 8; x < x1; x += 22) {
    const a = 140 + Math.sin((x - x0) / 30) * 38;
    const b = 140 + Math.sin((x - x0) / 30 + Math.PI) * 38;
    g.beginPath();
    g.moveTo(x, a);
    g.lineTo(x, b);
    g.stroke();
  }
  return tex(c);
}

export class ClockFace {
  texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private shown = -1;

  constructor() {
    const [c, g] = canvas(256, 256);
    this.g = g;
    this.texture = tex(c);
    this.set(10 * 60 + 42);
  }

  set(minutes: number): void {
    const m = Math.floor(minutes);
    if (m === this.shown) return;
    this.shown = m;
    const g = this.g;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fbfaf4';
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = '#1b1c22';
    g.stroke();
    g.fillStyle = '#1b1c22';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(128 + Math.sin(a) * 98, 128 - Math.cos(a) * 98);
      g.rotate(a);
      g.fillRect(-4, -9, 8, 18);
      g.restore();
    }
    const hand = (angle: number, len: number, w: number) => {
      g.save();
      g.translate(128, 128);
      g.rotate(angle);
      g.fillRect(-w / 2, -len, w, len + 10);
      g.restore();
    };
    hand((((m / 60) % 12) / 12) * Math.PI * 2, 58, 12);
    hand(((m % 60) / 60) * Math.PI * 2, 90, 8);
    this.texture.needsUpdate = true;
  }
}

export const SHEET_W = 512;
export const SHEET_H = 660;
const ROW_Y0 = 250;
const ROW_DY = 48;
const XS = [250, 310, 370, 430];
const R = 17;

export class AnswerSheet {
  texture: THREE.CanvasTexture;
  answers: (number | null)[] = Array(8).fill(null);
  hover: { row: number; col: number } | null = null;
  private g: CanvasRenderingContext2D;

  constructor() {
    const [c, g] = canvas(SHEET_W, SHEET_H);
    this.g = g;
    this.texture = tex(c);
    this.draw();
  }

  bubbleAt(u: number, v: number): { row: number; col: number } | null {
    const x = u * SHEET_W;
    const y = (1 - v) * SHEET_H;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 4; c++) if (Math.hypot(x - XS[c], y - (ROW_Y0 + r * ROW_DY)) <= R + 8) return { row: r, col: c };
    return null;
  }

  bubbleUV(row: number, col: number): [number, number] {
    return [XS[col] / SHEET_W, 1 - (ROW_Y0 + row * ROW_DY) / SHEET_H];
  }

  fill(row: number, col: number): void {
    this.answers[row] = col;
    this.draw();
  }

  setHover(h: { row: number; col: number } | null): void {
    if (h?.row === this.hover?.row && h?.col === this.hover?.col) return;
    this.hover = h;
    this.draw();
  }

  reset(): void {
    this.answers = Array(8).fill(null);
    this.hover = null;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.fillStyle = '#fbfaf5';
    g.fillRect(0, 0, SHEET_W, SHEET_H);
    g.strokeStyle = '#1b1c22';
    g.lineWidth = 6;
    g.strokeRect(3, 3, SHEET_W - 6, SHEET_H - 6);
    g.fillStyle = '#1b1c22';
    g.font = `700 32px ${ROUND}`;
    g.fillText('BIOLOGY - FINAL EXAM', 40, 66);
    g.font = `500 28px ${ROUND}`;
    g.fillText('Name:', 40, 120);
    g.font = `500 34px ${CHALK}`;
    g.fillStyle = '#2b3a8f';
    g.fillText('Noah R.', 130, 120);
    g.strokeStyle = '#8a8f9a';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(40, 160 + i * 22);
      g.lineTo(220, 160 + i * 22);
      g.stroke();
    }
    g.fillStyle = '#1b1c22';
    g.font = `600 20px ${ROUND}`;
    ['A', 'B', 'C', 'D'].forEach((l, i) => g.fillText(l, XS[i] - 6, 222));
    for (let r = 0; r < 8; r++) {
      const y = ROW_Y0 + r * ROW_DY;
      g.fillStyle = '#1b1c22';
      g.font = `600 22px ${ROUND}`;
      g.fillText(`${41 + r}.`, 170, y + 8);
      for (let c = 0; c < 4; c++) {
        g.beginPath();
        g.arc(XS[c], y, R, 0, Math.PI * 2);
        const filled = this.answers[r] === c;
        const hov = this.hover?.row === r && this.hover?.col === c;
        g.fillStyle = filled ? '#1b1c22' : hov ? '#f2d98a' : '#fbfaf5';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#1b1c22';
        g.stroke();
      }
    }
    this.texture.needsUpdate = true;
  }
}

/** Red-and-white poster beside the door. */
export function lockdownPoster(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 384);
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#d63a3a';
  g.fillRect(0, 0, 256, 92);
  g.strokeStyle = '#1b1c22';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 376);
  g.fillStyle = '#fff';
  g.font = `700 46px ${ROUND}`;
  g.textAlign = 'center';
  g.fillText('LOCKDOWN', 128, 64);
  g.textAlign = 'left';
  g.fillStyle = '#1b1c22';
  g.font = `600 36px ${ROUND}`;
  ['1 LOCK', '2 LIGHTS', '3 OUT OF', '   SIGHT'].forEach((l, i) => g.fillText(l, 26, 160 + i * 56));
  return tex(c);
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 128, size = 72): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `700 ${size}px ${ROUND}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return tex(c);
}

export function bulletinTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#b8864f';
  g.fillRect(0, 0, 512, 256);
  const cols = ['#f28ab2', '#ffd85e', '#7ec8f2', '#8fd694', '#c39af2', '#ff9f6b', '#fdf6e3'];
  for (let i = 0; i < 14; i++) {
    const x = 16 + (i % 7) * 70 + Math.random() * 10;
    const y = 16 + Math.floor(i / 7) * 118 + Math.random() * 10;
    g.save();
    g.translate(x + 28, y + 45);
    g.rotate((Math.random() - 0.5) * 0.15);
    g.fillStyle = cols[i % cols.length];
    g.fillRect(-28, -45, 56, 90);
    g.fillStyle = 'rgba(27,28,34,0.35)';
    for (let k = 0; k < 4; k++) g.fillRect(-20, -30 + k * 16, 40 - (k % 2) * 12, 5);
    g.fillStyle = '#d63a3a';
    g.beginPath();
    g.arc(0, -40, 5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = 12;
  g.strokeRect(0, 0, 512, 256);
  return tex(c);
}

export function posterCell(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 340);
  g.fillStyle = '#e8f3ea';
  g.fillRect(0, 0, 256, 340);
  g.fillStyle = '#2f6a50';
  g.font = `700 36px ${ROUND}`;
  g.fillText('THE CELL', 44, 50);
  g.strokeStyle = '#2f6a50';
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(128, 200, 95, 110, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c96a8a';
  g.beginPath();
  g.arc(120, 190, 32, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** Cream ceiling light panel with slats. */
export function panelTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#fffbe9';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1b1c22';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 122);
  g.lineWidth = 3;
  for (let x = 32; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 6);
    g.lineTo(x, 122);
    g.stroke();
  }
  return tex(c);
}

export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b9c1d0';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 256);
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9 / 2.4, 9 / 2.4);
  return t;
}

/** Soft stripes for light through blinds (additive). */
export function stripesTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 12; i++) {
    const y = i * 21 + 4;
    const grd = g.createLinearGradient(0, y, 0, y + 12);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, y, 64, 12);
  }
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.25, 'rgba(0,0,0,0)');
  edge.addColorStop(0.75, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 256);
  return tex(c);
}

/** A spare answer sheet, taped over the door window (backlit by the hall). */
export function coverTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#e4e6f0';
  for (let i = 0; i < 9; i++) g.fillRect(10, 40 + i * 22, 44, 4);
  g.fillStyle = 'rgba(240,220,150,0.9)';
  g.fillRect(0, 0, 64, 14);
  g.fillRect(0, 242, 64, 14);
  return tex(c);
}
