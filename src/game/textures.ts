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

const HAND = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function boardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 384);
  g.fillStyle = '#e9ece9';
  g.fillRect(0, 0, 1024, 384);
  // faint ghost of erased marker
  g.globalAlpha = 0.08;
  g.fillStyle = '#335';
  g.font = `40px ${HAND}`;
  g.fillText('Krebs cycle ->  NADH  FADH2', 520, 330);
  g.globalAlpha = 1;
  g.fillStyle = '#1d3c78';
  g.font = `bold 64px ${HAND}`;
  g.fillText('BIOLOGY FINAL', 60, 100);
  g.fillStyle = '#2a2a2a';
  g.font = `34px ${HAND}`;
  g.fillText('Period 3  -  Ms. Okafor  -  Room 214', 60, 160);
  g.fillStyle = '#7a1f1f';
  g.fillText('Phones away. Eyes on your own paper.', 60, 225);
  g.fillStyle = '#2a2a2a';
  g.fillText('Bubble sheet: #41 - 48 last page', 60, 285);
  // a small hand-drawn cell
  g.strokeStyle = '#2d6a3e';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(860, 150, 110, 80, 0.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#2d6a3e';
  g.beginPath();
  g.arc(850, 150, 26, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(910, 110, 22, 10, 0.5, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(800, 200, 20, 9, -0.4, 0, Math.PI * 2);
  g.stroke();
  return tex(c);
}

export class ClockFace {
  texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private c: HTMLCanvasElement;
  private shown = -1;

  constructor() {
    [this.c, this.g] = canvas(256, 256);
    this.texture = tex(this.c);
    this.set(10 * 60 + 42);
  }

  /** minutes since midnight */
  set(minutes: number): void {
    const m = Math.floor(minutes);
    if (m === this.shown) return;
    this.shown = m;
    const g = this.g;
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#f3f1ea';
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#222';
    g.stroke();
    g.fillStyle = '#222';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
      g.rotate(a);
      g.fillRect(-3, -10, 6, 20);
      g.restore();
    }
    const hand = (angle: number, len: number, w: number) => {
      g.save();
      g.translate(128, 128);
      g.rotate(angle);
      g.fillRect(-w / 2, -len, w, len + 12);
      g.restore();
    };
    const hours = (m / 60) % 12;
    hand((hours / 12) * Math.PI * 2, 60, 10);
    hand(((m % 60) / 60) * Math.PI * 2, 92, 6);
    g.beginPath();
    g.arc(128, 128, 8, 0, Math.PI * 2);
    g.fill();
    this.texture.needsUpdate = true;
  }
}

export const SHEET_W = 512;
export const SHEET_H = 660;
export const BUBBLE_ROWS_Y0 = 210;
export const BUBBLE_ROW_DY = 54;
export const BUBBLE_XS = [210, 280, 350, 420];
export const BUBBLE_R = 18;

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

  /** Map a UV hit on the sheet to a bubble. */
  bubbleAt(u: number, v: number): { row: number; col: number } | null {
    const x = u * SHEET_W;
    const y = (1 - v) * SHEET_H;
    for (let r = 0; r < 8; r++) {
      const by = BUBBLE_ROWS_Y0 + r * BUBBLE_ROW_DY;
      for (let c = 0; c < 4; c++) {
        if (Math.hypot(x - BUBBLE_XS[c], y - by) <= BUBBLE_R + 9) return { row: r, col: c };
      }
    }
    return null;
  }

  /** UV of bubble centre (for tests / hand animation). */
  bubbleUV(row: number, col: number): [number, number] {
    return [BUBBLE_XS[col] / SHEET_W, 1 - (BUBBLE_ROWS_Y0 + row * BUBBLE_ROW_DY) / SHEET_H];
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
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, SHEET_W, SHEET_H);
    g.fillStyle = '#6b8f71';
    g.fillRect(0, 0, SHEET_W, 26);
    g.fillRect(0, SHEET_H - 18, SHEET_W, 18);
    g.fillStyle = '#2d4a33';
    g.font = `bold 26px ${SANS}`;
    g.fillText('ANSWER SHEET  -  BIOLOGY', 26, 66);
    g.font = `20px ${SANS}`;
    g.fillText('NAME:', 26, 112);
    g.strokeStyle = '#6b8f71';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(96, 114);
    g.lineTo(330, 114);
    g.stroke();
    g.fillStyle = '#28324a';
    g.font = `30px ${HAND}`;
    g.fillText('Noah', 110, 108);
    g.fillStyle = '#2d4a33';
    g.font = `18px ${SANS}`;
    g.fillText('Fill bubbles completely. No stray marks.', 26, 150);
    ['A', 'B', 'C', 'D'].forEach((l, i) => g.fillText(l, BUBBLE_XS[i] - 6, 182));
    for (let r = 0; r < 8; r++) {
      const y = BUBBLE_ROWS_Y0 + r * BUBBLE_ROW_DY;
      g.fillStyle = '#2d4a33';
      g.font = `bold 22px ${SANS}`;
      g.fillText(`${41 + r}.`, 120, y + 8);
      for (let c = 0; c < 4; c++) {
        const x = BUBBLE_XS[c];
        g.beginPath();
        g.arc(x, y, BUBBLE_R, 0, Math.PI * 2);
        const filled = this.answers[r] === c;
        const hov = this.hover && this.hover.row === r && this.hover.col === c;
        g.fillStyle = filled ? '#1b1b1f' : hov ? '#d9d2a8' : '#f4f1e6';
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = '#6b8f71';
        g.stroke();
      }
    }
    this.texture.needsUpdate = true;
  }
}

export function bookletTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 660);
  g.fillStyle = '#efede6';
  g.fillRect(0, 0, 512, 660);
  g.fillStyle = '#222';
  g.font = `bold 22px ${SANS}`;
  g.fillText('Part IV  (page 6 of 6)', 24, 44);
  const qs = [
    '41. Which organelle makes most of',
    '     a cell’s ATP?',
    '42. Osmosis moves water toward...',
    '43. A codon is made of how many',
    '     nucleotides?',
    '44. Where are proteins assembled?',
    '45. Chlorophyll absorbs mostly...',
    '46. Which phase lines chromosomes',
    '     up in the middle?',
    '47. Enzymes lower the ...',
    '48. Give one difference between',
    '     plant and animal cells.',
  ];
  g.font = `19px ${SANS}`;
  qs.forEach((q, i) => g.fillText(q, 24, 92 + i * 44));
  return tex(c);
}

export function posterCell(): THREE.CanvasTexture {
  const [c, g] = canvas(384, 512);
  g.fillStyle = '#1f3b4d';
  g.fillRect(0, 0, 384, 512);
  g.fillStyle = '#e8d9a8';
  g.font = `bold 44px ${SANS}`;
  g.fillText('THE CELL', 90, 70);
  g.strokeStyle = '#9fd4a3';
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(192, 280, 150, 170, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#c47a5a';
  g.beginPath();
  g.arc(180, 270, 46, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f0b860';
  g.lineWidth = 4;
  for (const [x, y, r] of [
    [110, 200, 0.4],
    [270, 340, -0.6],
    [250, 190, 1.1],
  ] as const) {
    g.beginPath();
    g.ellipse(x, y, 30, 13, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#9fd4a3';
  for (let i = 0; i < 26; i++) g.fillRect(70 + Math.random() * 240, 150 + Math.random() * 260, 4, 4);
  return tex(c);
}

export function posterMitosis(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#efe6cf';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#5a2e2e';
  g.font = `bold 34px ${SANS}`;
  g.fillText('MITOSIS', 180, 44);
  const names = ['pro', 'meta', 'ana', 'telo'];
  names.forEach((n, i) => {
    const x = 70 + i * 120;
    g.strokeStyle = '#5a2e2e';
    g.lineWidth = 4;
    g.beginPath();
    if (i < 3) g.arc(x, 140, 44, 0, Math.PI * 2);
    else {
      g.arc(x - 20, 140, 30, 0, Math.PI * 2);
      g.moveTo(x + 50, 140);
      g.arc(x + 20, 140, 30, 0, Math.PI * 2);
    }
    g.stroke();
    g.fillStyle = '#5a2e2e';
    g.font = `18px ${SANS}`;
    g.fillText(n + 'phase', x - 40, 220);
  });
  return tex(c);
}

export function posterQuote(): THREE.CanvasTexture {
  const [c, g] = canvas(384, 512);
  g.fillStyle = '#3d2f4f';
  g.fillRect(0, 0, 384, 512);
  g.fillStyle = '#f2e6d0';
  g.font = `bold 40px ${SANS}`;
  ['CURIOSITY', 'IS A', 'MUSCLE.'].forEach((l, i) => g.fillText(l, 40, 180 + i * 56));
  g.font = `22px ${SANS}`;
  g.fillText('Use it every day.', 40, 380);
  return tex(c);
}

export function signTexture(text: string, bg: string, fg: string, w = 256, h = 128, size = 72): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${size}px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return tex(c);
}

/** Soft stripes for light falling through blinds. White on black: use additive blending and tint. */
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
  // fade the edges
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.2, 'rgba(0,0,0,0)');
  edge.addColorStop(0.8, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 256);
  return tex(c);
}

export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4a4a46';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const shade = 70 + Math.floor(Math.random() * 14);
      g.fillStyle = `rgb(${shade},${shade},${shade - 4})`;
      g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
      for (let k = 0; k < 18; k++) {
        g.fillStyle = `rgba(30,30,30,${Math.random() * 0.25})`;
        g.fillRect(x * 64 + Math.random() * 62, y * 64 + Math.random() * 62, 3, 2);
      }
    }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9 / 1.2, 9 / 1.2);
  return t;
}
