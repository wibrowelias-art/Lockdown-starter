import type { SimClock } from '../game/clock';
import type { Input } from '../game/input';
import { ENDING_IDS, type EndingId } from '../story/state';
import { ENDINGS, GUIDANCE } from '../story/endings';

export type Who = 'teacher' | 'theo' | 'zoe' | 'pa' | 'door' | 'officer' | 'noah' | 'ines' | 'hana' | 'malik' | 'sam' | 'jo';

const NAMES: Record<Who, string> = {
  teacher: 'Ms. Okafor',
  theo: 'Theo',
  zoe: 'Zoe',
  pa: 'PA',
  door: 'At the door',
  officer: 'Officer',
  noah: 'Noah',
  ines: 'Ines',
  hana: 'Hana',
  malik: 'Malik',
  sam: 'Sam',
  jo: 'Jo',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface Option<T> {
  label: string;
  value: T;
  testid?: string;
}

export interface Settings {
  sensitivity: number;
  invertY: boolean;
  sound: boolean;
  lowQuality: boolean;
}

type Thread = 'zoe' | 'mom';

export class PhoneUI {
  root = el('div', 'phone-wrap');
  private phone = el('div', 'phone');
  isOpen = false;
  silenced = false;
  mode: 'lock' | 'chat' = 'lock';
  thread: Thread = 'zoe';
  onSilence: (() => void) | null = null;
  onClose: (() => void) | null = null;
  /** a reply was picked (lets the game re-capture the mouse) */
  onPicked: (() => void) | null = null;
  canClose = true;
  private time = el('div', 'ph-time');
  private batt = el('div', 'ph-batt');
  private bigTime = el('div', 'ph-bigtime');
  private ring = el('button', 'ph-ring');
  private notes = el('div', 'ph-notes');
  private chats: Record<Thread, HTMLElement> = { zoe: el('div', 'ph-chat'), mom: el('div', 'ph-chat') };
  private head = el('div', 'ph-head');
  private tabs = el('div', 'ph-tabs');
  private replies = el('div', 'ph-replies');
  private typingEl = el('div', 'ph-msg them typing', '<span></span><span></span><span></span>');
  private lockView = el('div', 'ph-lock');
  private chatView = el('div', 'ph-chatview');
  private closeBtn = el('button', 'ph-close', 'Put it away');
  private banners = el('div', 'banners');
  glowCovered = false;

  constructor() {
    this.root.dataset.testid = 'phone';
    const status = el('div', 'ph-status');
    status.append(this.time, this.batt);
    this.ring.dataset.testid = 'phone-silent';
    this.ring.addEventListener('click', () => this.toggleSilent());
    this.lockView.append(this.bigTime, el('div', 'ph-date', 'Tuesday, November 18'), this.ring, this.notes);
    for (const t of ['zoe', 'mom'] as Thread[]) {
      const b = el('button', `ph-tab ${t}`, t === 'zoe' ? 'Zoe' : 'Mom');
      b.dataset.testid = `tab-${t}`;
      b.addEventListener('click', () => this.showThread(t));
      this.tabs.append(b);
    }
    this.chatView.append(this.head, this.tabs, this.chats.zoe, this.chats.mom, this.replies);
    this.closeBtn.dataset.testid = 'phone-close';
    this.closeBtn.addEventListener('click', () => this.onClose?.());
    const screen = el('div', 'ph-screen');
    screen.append(status, this.lockView, this.chatView, this.closeBtn);
    this.phone.append(screen);
    const hand = el('div', 'ph-hand', '<i></i><i></i><i></i><i></i><b></b>');
    this.root.append(hand, this.phone, el('div', 'ph-sleeve'));
    this.banners.dataset.testid = 'banners';
    this.setTime('10:44');
    this.setBattery(9);
    this.renderRing();
    this.showMode('lock');
    this.showThread('zoe');
    // earlier chat: Noah's tease is the stake
    this.addMsg('zoe', 'good luck on the final lol', { silent: true });
    this.addMsg('me', 'ur gonna need it more', { silent: true });
    this.addMsg('mom', 'good luck today sweetie!! ❤️', { silent: true, thread: 'mom' });
  }

  get bannerEl(): HTMLElement {
    return this.banners;
  }

  setTime(t: string): void {
    this.time.textContent = t;
    this.bigTime.textContent = t;
  }

  setBattery(pct: number): void {
    this.batt.innerHTML = `<span class="pct">${pct}%</span><span class="cell ${pct <= 3 ? 'crit' : ''}"><span style="width:${Math.max(0, Math.min(100, pct * 4))}%"></span></span>`;
    this.batt.dataset.value = String(pct);
  }

  private toggleSilent(): void {
    if (this.silenced) return;
    this.silenced = true;
    this.renderRing();
    this.onSilence?.();
  }

  renderRing(): void {
    this.ring.innerHTML = this.silenced
      ? '<span class="ph-bell off"></span><span>Silent mode on</span>'
      : '<span class="ph-bell"></span><span>Ringer on: tap to silence</span>';
    this.ring.classList.toggle('on', !this.silenced);
  }

  showMode(m: 'lock' | 'chat'): void {
    this.mode = m;
    this.lockView.style.display = m === 'lock' ? '' : 'none';
    this.chatView.style.display = m === 'chat' ? '' : 'none';
  }

  showThread(t: Thread): void {
    this.thread = t;
    this.chats.zoe.style.display = t === 'zoe' ? '' : 'none';
    this.chats.mom.style.display = t === 'mom' ? '' : 'none';
    this.head.innerHTML = t === 'zoe' ? '<span class="ph-av z">Z</span><div><b>Zoe</b><small>Active now</small></div>' : '<span class="ph-av m">M</span><div><b>Mom</b><small>&nbsp;</small></div>';
    this.tabs.querySelectorAll('.ph-tab').forEach((b) => b.classList.toggle('on', b.classList.contains(t)));
    this.scroll();
  }

  open(m?: 'lock' | 'chat'): void {
    if (m) this.showMode(m);
    this.isOpen = true;
    this.root.classList.add('open');
    this.closeBtn.style.display = this.canClose ? '' : 'none';
    this.scroll();
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
    this.setCovered(false);
  }

  setCanClose(v: boolean): void {
    this.canClose = v;
    this.closeBtn.style.display = v ? '' : 'none';
  }

  setCovered(v: boolean): void {
    this.glowCovered = v;
    this.root.classList.toggle('covered', v);
  }

  notify(from: string, text: string): void {
    const n = el('div', 'ph-note', `<b>${esc(from)}</b><span>${esc(text)}</span>`);
    this.notes.prepend(n);
    while (this.notes.children.length > 3) this.notes.lastElementChild?.remove();
  }

  addMsg(from: 'zoe' | 'me' | 'mom' | 'meMom', text: string, opts: { time?: string; tag?: string; silent?: boolean; thread?: Thread } = {}): void {
    const thread: Thread = opts.thread ?? (from === 'mom' || from === 'meMom' ? 'mom' : 'zoe');
    const chat = this.chats[thread];
    if (thread === 'zoe') this.typing(false);
    if (opts.time) chat.append(el('div', 'ph-stamp', esc(opts.time)));
    const mine = from === 'me' || from === 'meMom';
    const m = el('div', `ph-msg ${mine ? 'me' : 'them'}`);
    m.textContent = text;
    m.dataset.testid = mine ? 'msg-me' : `msg-${from}`;
    chat.append(m);
    if (opts.tag) {
      const tg = el('div', 'ph-tag', esc(opts.tag));
      tg.dataset.testid = 'dont-open';
      chat.append(tg);
    }
    this.scroll();
    if (!opts.silent && !mine && this.isOpen) this.banner(from === 'mom' ? 'Mom' : 'Zoe', text, opts.time ?? this.time.textContent ?? '', opts.tag);
  }

  banner(from: string, text: string, time: string, tag?: string): void {
    const b = el(
      'div',
      'banner',
      `<div class="bn-top"><span class="ph-av ${from === 'Zoe' ? 'z' : from === 'You' ? 'n' : 'm'}">${esc(from[0])}</span><b>${esc(from)}</b><span class="bn-time">${esc(time)}</span></div><div class="bn-text">${esc(text)}</div>${tag ? `<div class="bn-tag">${esc(tag)}</div>` : ''}`,
    );
    this.banners.prepend(b);
    while (this.banners.children.length > 1) this.banners.lastElementChild?.remove();
    setTimeout(() => b.classList.add('out'), 3800);
    setTimeout(() => b.remove(), 4400);
  }

  typing(on: boolean): void {
    if (on) {
      this.chats.zoe.append(this.typingEl);
      this.scroll();
    } else this.typingEl.remove();
  }

  private scroll(): void {
    const c = this.chats[this.thread];
    c.scrollTop = c.scrollHeight;
    requestAnimationFrame(() => (c.scrollTop = c.scrollHeight));
  }

  setReplies<T>(opts: Option<T>[], pick: (v: T) => void): void {
    this.replies.innerHTML = '';
    for (const o of opts) {
      const b = el('button', 'ph-reply');
      b.textContent = o.label;
      if (o.testid) b.dataset.testid = o.testid;
      b.addEventListener('click', () => {
        this.replies.innerHTML = '';
        pick(o.value);
        this.onPicked?.();
      });
      this.replies.append(b);
    }
    this.scroll();
  }

  clearReplies(): void {
    this.replies.innerHTML = '';
  }

  flash(): void {
    this.root.classList.remove('buzz');
    void this.root.offsetWidth;
    this.root.classList.add('buzz');
  }

  reset(): void {
    this.silenced = false;
    this.notes.innerHTML = '';
    this.chats.zoe.innerHTML = '';
    this.chats.mom.innerHTML = '';
    this.addMsg('zoe', 'good luck on the final lol', { silent: true });
    this.addMsg('me', 'ur gonna need it more', { silent: true });
    this.addMsg('mom', 'good luck today sweetie!! ❤️', { silent: true, thread: 'mom' });
    this.replies.innerHTML = '';
    this.banners.innerHTML = '';
    this.renderRing();
    this.showMode('lock');
    this.showThread('zoe');
    this.close();
    this.setTime('10:44');
    this.setBattery(9);
  }
}

export interface ChecklistItem {
  label: string;
  done: boolean;
  missed?: boolean;
  optional?: boolean;
  group?: string;
  testid?: string;
}

export class UI {
  root: HTMLElement;
  phone = new PhoneUI();
  private hud = el('div', 'hud');
  private top = el('div', 'topbar');
  private stamp = el('div', 'stamp');
  private optBtn = el('button', 'tb', 'Options');
  private skipBtn = el('button', 'tb skip', 'Skip scene &#9656;');
  private exitBtn = el('button', 'tb exit', 'Exit &#10005;');
  private subs = el('div', 'subs');
  private caps = el('div', 'caps');
  private list = el('div', 'checklist');
  private noiseBox = el('div', 'noise', '<span class="lbl">NOISE</span><div class="bar"><div class="fill"></div></div><div class="why"></div>');
  private promptEl = el('div', 'prompt');
  private hintEl = el('div', 'hint');
  private cross = el('div', 'cross');
  private choiceBox = el('div', 'choices');
  private doorBox = el('div', 'doorchoice');
  private holdBox = el('div', 'holdmeter', '<div class="hm-title">HOLD STILL</div><div class="hm-bar"><div class="hm-fill"></div></div><div class="hm-sub"></div>');
  private breatheBox = el('div', 'breathe', '<div class="ring"><div class="guide"></div><div class="you"></div></div><div class="b-label"></div>');
  private actions = el('div', 'actions');
  private joy = el('div', 'joy', '<div class="knob"></div>');
  private fadeEl = el('div', 'fade');
  private titleCard = el('div', 'titlecard');
  private screen = el('div', 'screen');
  private pauseEl = el('div', 'pause');
  private optionsEl = el('div', 'options');
  phoneBtn = el('button', 'act phone-btn', '<span class="ph-ico"></span><span>Phone</span>');
  crouchBtn = el('button', 'act', 'Crouch');
  useBtn = el('button', 'act', 'Use');
  holdBtn = el('button', 'act hold-btn', 'Hold');
  breatheBtn = el('button', 'breathe-btn', 'Hold to breathe');
  private subTimers: (() => void)[] = [];
  onSkip: (() => void) | null = null;
  onExit: (() => void) | null = null;
  onSettings: ((s: Settings) => void) | null = null;
  onResume: (() => void) | null = null;
  onHold: ((down: boolean) => void) | null = null;
  onUseHold: ((down: boolean) => void) | null = null;
  /** buttons need the mouse: release pointer lock while they're up */
  onNeedsPointer: (() => void) | null = null;
  onPicked: (() => void) | null = null;
  settings: Settings;

  constructor(
    host: HTMLElement,
    private clock: SimClock,
    private input: Input,
    settings: Settings,
  ) {
    this.root = host;
    this.settings = settings;
    this.skipBtn.dataset.testid = 'skip';
    this.exitBtn.dataset.testid = 'exit';
    this.optBtn.dataset.testid = 'options-btn';
    this.skipBtn.addEventListener('click', () => this.onSkip?.());
    this.exitBtn.addEventListener('click', () => this.onExit?.());
    this.optBtn.addEventListener('click', () => this.toggleOptions());
    this.top.append(this.stamp, el('div', 'spacer'), this.optBtn, this.skipBtn, this.exitBtn);
    for (const [e, id] of [
      [this.noiseBox, 'noise'],
      [this.list, 'checklist'],
      [this.subs, 'subtitles'],
      [this.caps, 'captions'],
      [this.doorBox, 'door-choice'],
      [this.phoneBtn, 'phone-btn'],
      [this.crouchBtn, 'crouch-btn'],
      [this.useBtn, 'use-btn'],
      [this.holdBtn, 'hold-btn'],
      [this.breatheBtn, 'breathe-btn'],
      [this.holdBox, 'holdmeter'],
      [this.titleCard, 'titlecard'],
      [this.pauseEl, 'pause'],
    ] as [HTMLElement, string][])
      e.dataset.testid = id;
    this.actions.append(this.crouchBtn, this.holdBtn, this.useBtn, this.phoneBtn);
    this.breatheBox.append(this.breatheBtn);
    const press = (btn: HTMLElement, fn: (d: boolean) => void) => {
      const h = (down: boolean) => (e: Event) => {
        e.preventDefault();
        fn(down);
      };
      btn.addEventListener('pointerdown', h(true));
      btn.addEventListener('pointerup', h(false));
      btn.addEventListener('pointerleave', h(false));
      btn.addEventListener('pointercancel', h(false));
    };
    press(this.breatheBtn, (d) => this.onHold?.(d));
    press(this.holdBtn, (d) => this.onHold?.(d));
    press(this.useBtn, (d) => this.onUseHold?.(d));
    this.hud.append(
      this.cross,
      this.promptEl,
      this.hintEl,
      this.list,
      this.noiseBox,
      this.caps,
      this.subs,
      this.choiceBox,
      this.doorBox,
      this.holdBox,
      this.breatheBox,
      this.joy,
      this.actions,
      this.phone.root,
      this.phone.bannerEl,
    );
    this.buildOptions();
    this.pauseEl.innerHTML = '<div class="pause-card"><h2>Paused</h2><p>Click to resume.</p><button class="big" data-testid="resume">Resume</button></div>';
    this.pauseEl.querySelector('[data-testid=resume]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onResume?.();
    });
    host.append(this.hud, this.titleCard, this.fadeEl, this.screen, this.pauseEl, this.optionsEl, this.top);
    this.setupJoystick();
    this.setHud(false);
    this.noiseVisible(false);
    this.holdMeter(null);
    this.breathe(null);
    this.pause(false);
  }

  // ---------- options ----------

  private buildOptions(): void {
    const s = this.settings;
    this.optionsEl.innerHTML = `<div class="opt-card" data-testid="options">
      <h2>Options</h2>
      <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}" data-k="sensitivity"></label>
      <label><input type="checkbox" ${s.invertY ? 'checked' : ''} data-k="invertY"> Invert Y</label>
      <label><input type="checkbox" ${s.sound ? 'checked' : ''} data-k="sound" data-testid="opt-sound"> Sound</label>
      <label><input type="checkbox" ${s.lowQuality ? 'checked' : ''} data-k="lowQuality" data-testid="opt-lowq"> Low quality (no outlines or bloom, for phones)</label>
      <button class="big" data-testid="options-close">Done</button>
    </div>`;
    this.optionsEl.querySelectorAll('input').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Settings;
        (this.settings as unknown as Record<string, unknown>)[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        this.onSettings?.(this.settings);
      }),
    );
    this.optionsEl.querySelector('[data-testid=options-close]')!.addEventListener('click', () => this.toggleOptions(false));
    this.optionsEl.style.display = 'none';
  }

  toggleOptions(v?: boolean): void {
    const show = v ?? this.optionsEl.style.display === 'none';
    this.optionsEl.style.display = show ? '' : 'none';
    if (show) this.input.exitLock();
  }

  get optionsOpen(): boolean {
    return this.optionsEl.style.display !== 'none';
  }

  pause(v: boolean): void {
    this.pauseEl.style.display = v ? '' : 'none';
  }

  private setupJoystick(): void {
    const knob = this.joy.querySelector('.knob') as HTMLElement;
    let id: number | null = null;
    let cx = 0;
    let cy = 0;
    const R = 50;
    const set = (x: number, y: number) => {
      let dx = x - cx;
      let dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.joy.x = dx / R;
      this.input.joy.y = -dy / R;
    };
    this.joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      const r = this.joy.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      this.joy.setPointerCapture(e.pointerId);
      set(e.clientX, e.clientY);
    });
    this.joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) set(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.input.joy.x = 0;
      this.input.joy.y = 0;
    };
    this.joy.addEventListener('pointerup', end);
    this.joy.addEventListener('pointercancel', end);
  }

  // ---------- visibility ----------

  setHud(v: boolean): void {
    this.hud.style.display = v ? '' : 'none';
  }

  setTopbar(skip: boolean): void {
    this.skipBtn.style.display = skip ? '' : 'none';
  }

  setMovement(v: boolean, touch: boolean): void {
    this.joy.style.display = v && touch ? '' : 'none';
    this.crouchBtn.style.display = v ? '' : 'none';
    this.useBtn.style.display = touch ? '' : 'none';
    this.holdBtn.style.display = touch ? '' : 'none';
  }

  setPhoneButton(v: boolean, badge = false): void {
    this.phoneBtn.style.display = v ? '' : 'none';
    this.phoneBtn.classList.toggle('badge', badge);
  }

  setCrosshair(v: boolean): void {
    this.cross.style.display = v ? '' : 'none';
  }

  // ---------- text ----------

  timestamp(text: string): void {
    this.stamp.textContent = text;
  }

  showTitleCard(big: string, small: string, sec: number): void {
    this.titleCard.innerHTML = `<div class="tc-big">${esc(big)}</div><div class="tc-small">${esc(small)}</div>`;
    this.titleCard.classList.add('in');
    this.subTimers.push(this.clock.after(sec, () => this.titleCard.classList.remove('in')));
  }

  say(who: Who, text: string, opts: { whisper?: boolean; dur?: number } = {}): number {
    const dur = opts.dur ?? Math.max(2.0, 1.0 + text.length * 0.055);
    const line = el('div', `sub ${who}${opts.whisper ? ' whisper' : ''}`);
    line.innerHTML = `<span class="who">${esc(NAMES[who])}</span><span class="txt">${esc(text)}</span>`;
    this.subs.append(line);
    while (this.subs.children.length > 2) this.subs.firstElementChild?.remove();
    this.subTimers.push(this.clock.after(dur, () => line.remove()));
    return dur;
  }

  caption(text: string, dur = 3.5): void {
    const c = el('div', 'cap');
    c.textContent = text;
    this.caps.append(c);
    while (this.caps.children.length > 3) this.caps.firstElementChild?.remove();
    this.subTimers.push(this.clock.after(dur, () => c.remove()));
  }

  clearText(): void {
    this.subTimers.forEach((c) => c());
    this.subTimers = [];
    this.subs.innerHTML = '';
    this.caps.innerHTML = '';
    this.titleCard.classList.remove('in');
  }

  /** Poster-style checklist. Items with a group are shown under "1 LOCK / 2 LIGHTS / 3 OUT OF SIGHT". */
  checklist(title: string | null, items: ChecklistItem[] = [], timer?: number): void {
    if (!title) {
      this.list.style.display = 'none';
      return;
    }
    this.list.style.display = '';
    let html = `<div class="cl-head">${esc(title)}</div>`;
    if (timer !== undefined) html += `<div class="cl-timer"><span style="width:${Math.max(0, Math.min(1, timer)) * 100}%"></span></div>`;
    let group = '';
    for (const i of items) {
      if (i.group && i.group !== group) {
        group = i.group;
        html += `<div class="cl-group">${esc(group)}</div>`;
      }
      html += `<div class="o ${i.done ? 'done' : ''} ${i.missed ? 'missed' : ''} ${i.optional ? 'opt' : ''}" ${i.testid ? `data-testid="${i.testid}"` : ''}><span class="box"></span><span>${esc(i.label)}</span></div>`;
    }
    this.list.innerHTML = html;
  }

  noise(value: number, reason?: string): void {
    const fill = this.noiseBox.querySelector('.fill') as HTMLElement;
    fill.style.width = `${Math.min(100, value)}%`;
    fill.classList.toggle('high', value >= 45);
    this.noiseBox.dataset.value = String(value);
    if (reason) {
      (this.noiseBox.querySelector('.why') as HTMLElement).textContent = reason;
      this.noiseBox.classList.remove('pulse');
      void this.noiseBox.offsetWidth;
      this.noiseBox.classList.add('pulse');
    }
  }

  noiseVisible(v: boolean): void {
    this.noiseBox.style.display = v ? '' : 'none';
  }

  prompt(text: string | null): void {
    this.promptEl.textContent = text ?? '';
    this.promptEl.style.display = text ? '' : 'none';
  }

  hint(text: string | null): void {
    this.hintEl.textContent = text ?? '';
    this.hintEl.style.display = text ? '' : 'none';
  }

  choices<T>(opts: Option<T>[], pick: (v: T) => void, title?: string): void {
    this.choiceBox.innerHTML = title ? `<div class="ch-title">${esc(title)}</div>` : '';
    const row = el('div', 'ch-row');
    for (const o of opts) {
      const b = el('button', 'choice');
      b.textContent = o.label;
      if (o.testid) b.dataset.testid = o.testid;
      b.addEventListener('click', () => {
        this.choiceBox.innerHTML = '';
        pick(o.value);
        this.onPicked?.();
      });
      row.append(b);
    }
    this.choiceBox.append(row);
    this.onNeedsPointer?.();
  }

  clearChoices(): void {
    this.choiceBox.innerHTML = '';
  }

  doorChoice(pick: (v: 'open' | 'locked' | 'text') => void, canText: boolean): void {
    this.doorBox.innerHTML = '<div class="wwyd">WHAT WOULD YOU DO?</div>';
    const row = el('div', 'door-row');
    const mk = (label: string, cls: string, v: 'open' | 'locked' | 'text', id: string) => {
      const b = el('button', `door-btn ${cls}`, label);
      b.dataset.testid = id;
      b.addEventListener('click', () => {
        this.doorBox.innerHTML = '';
        pick(v);
        this.onPicked?.();
      });
      row.append(b);
    };
    mk('OPEN THE DOOR', 'open', 'open', 'door-open');
    mk('KEEP IT LOCKED', 'keep', 'locked', 'door-keep');
    if (canText) mk('SEND ONE LAST TEXT', 'text', 'text', 'door-text');
    this.doorBox.append(row);
    this.onNeedsPointer?.();
  }

  clearDoorChoice(): void {
    this.doorBox.innerHTML = '';
  }

  holdMeter(state: { progress: number; sub: string; ok: boolean } | null): void {
    if (!state) {
      this.holdBox.style.display = 'none';
      return;
    }
    this.holdBox.style.display = '';
    (this.holdBox.querySelector('.hm-fill') as HTMLElement).style.width = `${Math.round(state.progress * 100)}%`;
    (this.holdBox.querySelector('.hm-sub') as HTMLElement).textContent = state.sub;
    this.holdBox.classList.toggle('bad', !state.ok);
  }

  breathe(state: { guide: number; you: number; label: string } | null): void {
    if (!state) {
      this.breatheBox.style.display = 'none';
      return;
    }
    this.breatheBox.style.display = '';
    (this.breatheBox.querySelector('.guide') as HTMLElement).style.transform = `scale(${0.3 + 0.7 * state.guide})`;
    (this.breatheBox.querySelector('.you') as HTMLElement).style.transform = `scale(${0.3 + 0.7 * state.you})`;
    (this.breatheBox.querySelector('.b-label') as HTMLElement).textContent = state.label;
  }

  fade(to: number, sec: number): void {
    this.fadeEl.style.transition = `opacity ${Math.max(0, sec / Math.max(1, this.clock.speed))}s ease`;
    this.fadeEl.style.opacity = String(to);
  }

  // ---------- full screens ----------

  private showScreen(html: string, cls: string): HTMLElement {
    this.screen.className = `screen ${cls}`;
    this.screen.innerHTML = html;
    this.screen.style.display = '';
    return this.screen;
  }

  hideScreen(): void {
    this.screen.style.display = 'none';
    this.screen.innerHTML = '';
  }

  showTitle(found: EndingId[], onBegin: () => void, onLeave: () => void, touch: boolean): void {
    const s = this.showScreen(
      `<div class="card title-card" data-testid="title">
        <div class="kicker">An interactive story &middot; demo v2</div>
        <h1>ROOM 214</h1>
        <div class="notice" data-testid="content-notice">
          <h2>Content notice</h2>
          <p>This story takes place during a <b>school lockdown</b>. You will hear an unseen threat in the hallway,
          people who are afraid, and in some endings someone is hurt off-screen. Nothing violent is ever shown,
          and you can never fight anyone. It may be distressing.</p>
          <p><b>Exit</b> (top-right) leaves at any time. <b>Skip scene</b> skips any scene.</p>
        </div>
        <div class="controls-help">${
          touch
            ? '<div><b>Look</b> drag &middot; <b>Move</b> joystick &middot; <b>Use</b> tap or Use &middot; <b>Hold</b> hold still / breathe &middot; <b>Phone</b></div>'
            : '<div><b>Mouse</b> look (click the view to capture it, Esc to pause) &middot; <b>Click / E</b> use (hold for heavy things)</div><div><b>WASD</b> move &middot; <b>Shift</b> hurry (loud) &middot; <b>C / Ctrl</b> crouch &middot; <b>Space</b> hold still / breathe &middot; <b>Tab</b> phone</div>'
        }<div>12-15 minutes. Headphones recommended: you will need to hear where things are.</div></div>
        <div class="row">
          <button class="big" data-testid="begin">Begin</button>
          <button class="big ghost" data-testid="leave">Not today</button>
        </div>
        <div class="found">${found.length ? `Endings found: ${found.length} of ${ENDING_IDS.length}` : ''}</div>
      </div>`,
      'title',
    );
    s.querySelector('[data-testid=begin]')!.addEventListener('click', onBegin);
    s.querySelector('[data-testid=leave]')!.addEventListener('click', onLeave);
  }

  showExit(from: string | null, onRestart: () => void): void {
    const s = this.showScreen(
      `<div class="card exit-card" data-testid="exit-screen">
        <h2>You left the story.</h2>
        <p>That's completely okay. If something in it brought up difficult feelings, take a breath,
        step away from the screen, and talk to someone you trust.</p>
        <p class="guidance" data-testid="guidance">${esc(GUIDANCE)}</p>
        <div class="row"><button class="big" data-testid="restart">Back to the start</button></div>
        ${from ? `<div class="found">Left during: ${esc(from)}</div>` : ''}
      </div>`,
      'exit',
    );
    s.querySelector('[data-testid=restart]')!.addEventListener('click', onRestart);
  }

  showEnding(id: EndingId, lines: string[], found: EndingId[], stats: string, onReplay: () => void, onExit: () => void, lineDelay = 2.2): void {
    const info = ENDINGS[id];
    const s = this.showScreen(
      `<div class="card end-card" data-testid="ending" data-ending="${id}">
        <div class="kicker">Ending ${info.number} of ${ENDING_IDS.length}</div>
        <h1>${esc(info.title)}</h1>
        <div class="epilogue">${lines.map((l) => `<p class="ep">${esc(l)}</p>`).join('')}</div>
        <div class="after">
          <div class="stats">${esc(stats)}</div>
          <p class="guidance" data-testid="guidance">${esc(GUIDANCE)}</p>
          <div class="found">Endings found: ${found.length} of ${ENDING_IDS.length}</div>
          <div class="row">
            <button class="big" data-testid="replay">Play again</button>
            <button class="big ghost" data-testid="end-exit">Exit</button>
          </div>
        </div>
      </div>`,
      'end',
    );
    const eps = [...s.querySelectorAll<HTMLElement>('.ep')];
    const after = s.querySelector('.after') as HTMLElement;
    eps.forEach((p, i) => this.clock.after(0.6 + i * lineDelay, () => p.classList.add('in')));
    this.clock.after(0.8 + eps.length * lineDelay, () => after.classList.add('in'));
    s.querySelector('[data-testid=replay]')!.addEventListener('click', onReplay);
    s.querySelector('[data-testid=end-exit]')!.addEventListener('click', onExit);
  }

  revealEnding(): void {
    this.screen.querySelectorAll('.ep, .after').forEach((e) => e.classList.add('in'));
  }

  reset(): void {
    this.clearText();
    this.clearChoices();
    this.clearDoorChoice();
    this.breathe(null);
    this.holdMeter(null);
    this.checklist(null);
    this.prompt(null);
    this.hint(null);
    this.noise(0);
    this.noiseVisible(false);
    this.phone.reset();
    this.timestamp('');
  }
}
