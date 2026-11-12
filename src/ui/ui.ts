import type { SimClock } from '../game/clock';
import type { Input } from '../game/input';
import { ENDING_IDS, type EndingId } from '../story/state';
import { ENDINGS, GUIDANCE } from '../story/endings';

export type Who = 'teacher' | 'theo' | 'zoe' | 'pa' | 'door' | 'officer' | 'noah';

const NAMES: Record<Who, string> = {
  teacher: 'Ms. Okafor',
  theo: 'Theo',
  zoe: 'Zoe',
  pa: 'PA system',
  door: 'Voice at the door',
  officer: 'Officer',
  noah: 'You',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export interface Option<T> {
  label: string;
  value: T;
  testid?: string;
}

export class PhoneUI {
  root = el('div', 'phone');
  isOpen = false;
  silenced = false;
  mode: 'lock' | 'chat' = 'lock';
  onSilence: (() => void) | null = null;
  onClose: (() => void) | null = null;
  canClose = true;
  private time = el('div', 'ph-time');
  private bigTime = el('div', 'ph-bigtime');
  private ring = el('button', 'ph-ring');
  private notes = el('div', 'ph-notes');
  private chat = el('div', 'ph-chat');
  private replies = el('div', 'ph-replies');
  private typingEl = el('div', 'ph-msg them typing', '<span></span><span></span><span></span>');
  private lockView = el('div', 'ph-lock');
  private chatView = el('div', 'ph-chatview');
  private closeBtn = el('button', 'ph-close', 'Put it away');

  constructor() {
    this.root.dataset.testid = 'phone';
    const status = el('div', 'ph-status');
    status.append(this.time, el('span', 'ph-batt', '41%'));
    this.ring.dataset.testid = 'phone-silent';
    this.ring.addEventListener('click', () => this.toggleSilent());
    this.lockView.append(this.bigTime, el('div', 'ph-date', 'Tuesday, November 18'), this.ring, this.notes);
    const head = el('div', 'ph-head', '<span class="ph-av">Z</span><span>Zoe</span>');
    this.chatView.append(head, this.chat, this.replies);
    this.closeBtn.dataset.testid = 'phone-close';
    this.closeBtn.addEventListener('click', () => this.onClose?.());
    const screen = el('div', 'ph-screen');
    screen.append(status, this.lockView, this.chatView, this.closeBtn);
    this.root.append(screen);
    this.setTime('10:44');
    this.renderRing();
    this.showMode('lock');
  }

  setTime(t: string): void {
    this.time.textContent = t;
    this.bigTime.textContent = t;
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
      : '<span class="ph-bell"></span><span>Ringer on - tap to silence</span>';
    this.ring.classList.toggle('on', !this.silenced);
  }

  showMode(m: 'lock' | 'chat'): void {
    this.mode = m;
    this.lockView.style.display = m === 'lock' ? '' : 'none';
    this.chatView.style.display = m === 'chat' ? '' : 'none';
  }

  open(m?: 'lock' | 'chat'): void {
    if (m) this.showMode(m);
    this.isOpen = true;
    this.root.classList.add('open');
    this.closeBtn.style.display = this.canClose ? '' : 'none';
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }

  setCanClose(v: boolean): void {
    this.canClose = v;
    this.closeBtn.style.display = v ? '' : 'none';
  }

  notify(from: string, text: string): void {
    const n = el('div', 'ph-note', `<b>${esc(from)}</b><span>${esc(text)}</span>`);
    this.notes.prepend(n);
    while (this.notes.children.length > 3) this.notes.lastElementChild?.remove();
  }

  addMsg(from: 'zoe' | 'me', text: string): void {
    this.typing(false);
    const m = el('div', `ph-msg ${from === 'me' ? 'me' : 'them'}`);
    m.textContent = text;
    m.dataset.testid = from === 'me' ? 'msg-me' : 'msg-zoe';
    this.chat.append(m);
    this.chat.scrollTop = this.chat.scrollHeight;
  }

  typing(on: boolean): void {
    if (on) {
      this.chat.append(this.typingEl);
      this.chat.scrollTop = this.chat.scrollHeight;
    } else this.typingEl.remove();
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
      });
      this.replies.append(b);
    }
    // replies shrink the chat area: keep the newest message in view
    this.chat.scrollTop = this.chat.scrollHeight;
    requestAnimationFrame(() => (this.chat.scrollTop = this.chat.scrollHeight));
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
    this.chat.innerHTML = '';
    this.replies.innerHTML = '';
    this.renderRing();
    this.showMode('lock');
    this.close();
    this.setTime('10:44');
  }
}

export class UI {
  root: HTMLElement;
  phone = new PhoneUI();
  private hud = el('div', 'hud');
  private top = el('div', 'topbar');
  private stamp = el('div', 'stamp');
  private skipBtn = el('button', 'tb skip', 'Skip scene &#9656;');
  private exitBtn = el('button', 'tb exit', 'Exit &#10005;');
  private soundBtn = el('button', 'tb sound', 'Sound: on');
  private subs = el('div', 'subs');
  private caps = el('div', 'caps');
  private obj = el('div', 'objectives');
  private noiseBox = el('div', 'noise', '<span class="lbl">NOISE</span><div class="bar"><div class="fill"></div></div><div class="why"></div>');
  private promptEl = el('div', 'prompt');
  private hintEl = el('div', 'hint');
  private cross = el('div', 'cross');
  private choiceBox = el('div', 'choices');
  private doorBox = el('div', 'doorchoice');
  private breatheBox = el('div', 'breathe');
  private actions = el('div', 'actions');
  private joy = el('div', 'joy', '<div class="knob"></div>');
  private fadeEl = el('div', 'fade');
  private screen = el('div', 'screen');
  phoneBtn = el('button', 'act phone-btn', '<span class="ph-ico"></span><span>Phone</span>');
  crouchBtn = el('button', 'act', 'Crouch');
  useBtn = el('button', 'act', 'Use');
  breatheBtn = el('button', 'breathe-btn', 'Hold to breathe in');
  private subTimers: (() => void)[] = [];
  onSkip: (() => void) | null = null;
  onExit: (() => void) | null = null;
  onMute: ((muted: boolean) => void) | null = null;
  onBreathe: ((down: boolean) => void) | null = null;
  private muted = false;

  constructor(
    host: HTMLElement,
    private clock: SimClock,
    private input: Input,
  ) {
    this.root = host;
    this.skipBtn.dataset.testid = 'skip';
    this.exitBtn.dataset.testid = 'exit';
    this.soundBtn.dataset.testid = 'sound';
    this.skipBtn.addEventListener('click', () => this.onSkip?.());
    this.exitBtn.addEventListener('click', () => this.onExit?.());
    this.soundBtn.addEventListener('click', () => this.toggleMute());
    this.top.append(this.stamp, el('div', 'spacer'), this.soundBtn, this.skipBtn, this.exitBtn);
    this.noiseBox.dataset.testid = 'noise';
    this.obj.dataset.testid = 'objectives';
    this.subs.dataset.testid = 'subtitles';
    this.caps.dataset.testid = 'captions';
    this.doorBox.dataset.testid = 'door-choice';
    this.phoneBtn.dataset.testid = 'phone-btn';
    this.crouchBtn.dataset.testid = 'crouch-btn';
    this.useBtn.dataset.testid = 'use-btn';
    this.breatheBtn.dataset.testid = 'breathe-btn';
    this.actions.append(this.crouchBtn, this.useBtn, this.phoneBtn);
    this.breatheBox.innerHTML = '<div class="ring"><div class="ring-fill"></div></div><div class="b-label"></div>';
    this.breatheBox.append(this.breatheBtn);
    const hold = (down: boolean) => (e: Event) => {
      e.preventDefault();
      this.onBreathe?.(down);
    };
    this.breatheBtn.addEventListener('pointerdown', hold(true));
    this.breatheBtn.addEventListener('pointerup', hold(false));
    this.breatheBtn.addEventListener('pointerleave', hold(false));
    this.breatheBtn.addEventListener('pointercancel', hold(false));
    this.hud.append(
      this.cross,
      this.promptEl,
      this.hintEl,
      this.obj,
      this.noiseBox,
      this.caps,
      this.subs,
      this.choiceBox,
      this.doorBox,
      this.breatheBox,
      this.joy,
      this.actions,
      this.phone.root,
    );
    host.append(this.hud, this.fadeEl, this.screen, this.top);
    this.setupJoystick();
    this.setHud(false);
    this.noiseVisible(false);
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.soundBtn.textContent = this.muted ? 'Sound: off' : 'Sound: on';
    this.onMute?.(this.muted);
  }

  setMutedLabel(m: boolean): void {
    this.muted = m;
    this.soundBtn.textContent = m ? 'Sound: off' : 'Sound: on';
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

  /** Show a line of dialogue. Returns its duration in sim seconds. */
  say(who: Who, text: string, opts: { whisper?: boolean; dur?: number } = {}): number {
    const dur = opts.dur ?? Math.max(2.2, 1.1 + text.length * 0.055);
    const line = el('div', `sub ${who}${opts.whisper ? ' whisper' : ''}`);
    line.innerHTML = `<span class="who">${esc(NAMES[who])}${opts.whisper ? ' <i>(whispering)</i>' : ''}</span><span class="txt">${esc(text)}</span>`;
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
  }

  objectives(items: { label: string; done: boolean; optional?: boolean; testid?: string }[] | null): void {
    if (!items) {
      this.obj.style.display = 'none';
      return;
    }
    this.obj.style.display = '';
    this.obj.innerHTML = items
      .map(
        (i) =>
          `<div class="o ${i.done ? 'done' : ''} ${i.optional ? 'opt' : ''}" ${i.testid ? `data-testid="${i.testid}"` : ''}><span class="box"></span>${esc(i.label)}</div>`,
      )
      .join('');
  }

  noise(value: number, reason?: string): void {
    const fill = this.noiseBox.querySelector('.fill') as HTMLElement;
    fill.style.width = `${Math.min(100, value)}%`;
    fill.classList.toggle('high', value >= 45);
    this.noiseBox.dataset.value = String(value);
    if (reason) {
      const why = this.noiseBox.querySelector('.why') as HTMLElement;
      why.textContent = reason;
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

  choices<T>(opts: Option<T>[], pick: (v: T) => void): void {
    this.choiceBox.innerHTML = '';
    for (const o of opts) {
      const b = el('button', 'choice');
      b.textContent = o.label;
      if (o.testid) b.dataset.testid = o.testid;
      b.addEventListener('click', () => {
        this.choiceBox.innerHTML = '';
        pick(o.value);
      });
      this.choiceBox.append(b);
    }
  }

  clearChoices(): void {
    this.choiceBox.innerHTML = '';
  }

  doorChoice(pick: (v: 'open' | 'locked') => void): void {
    this.doorBox.innerHTML = '';
    const open = el('button', 'door-btn open', 'OPEN THE DOOR');
    const keep = el('button', 'door-btn keep', 'KEEP IT LOCKED');
    open.dataset.testid = 'door-open';
    keep.dataset.testid = 'door-keep';
    open.addEventListener('click', () => {
      this.doorBox.innerHTML = '';
      pick('open');
    });
    keep.addEventListener('click', () => {
      this.doorBox.innerHTML = '';
      pick('locked');
    });
    this.doorBox.append(open, keep);
  }

  clearDoorChoice(): void {
    this.doorBox.innerHTML = '';
  }

  breathe(state: { progress: number; label: string } | null): void {
    if (!state) {
      this.breatheBox.style.display = 'none';
      return;
    }
    this.breatheBox.style.display = '';
    const fill = this.breatheBox.querySelector('.ring-fill') as HTMLElement;
    fill.style.transform = `scale(${0.25 + 0.75 * state.progress})`;
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

  showTitle(found: EndingId[], onBegin: () => void, onLeave: () => void): void {
    const s = this.showScreen(
      `<div class="card title-card" data-testid="title">
        <div class="kicker">A short interactive story &middot; demo</div>
        <h1>ROOM 214</h1>
        <div class="notice" data-testid="content-notice">
          <h2>Content notice</h2>
          <p>This story takes place during a <b>school lockdown</b>. You will hear an unseen threat in the hallway,
          people who are afraid, and in some endings someone is hurt off-screen. Nothing violent is ever shown.
          It may be distressing.</p>
          <p>You can leave at any time with <b>Exit</b> (top-right), and skip any scene with <b>Skip scene</b>.</p>
        </div>
        <div class="controls-help">
          <div><b>Look</b> drag the view &middot; <b>Use</b> click / tap things</div>
          <div><b>Move</b> WASD / arrows / joystick &middot; <b>Crouch</b> C &middot; <b>Phone</b> P</div>
          <div>Headphones recommended. All sound is synthesised; dialogue is subtitled.</div>
        </div>
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

  showEnding(id: EndingId, lines: string[], found: EndingId[], onReplay: () => void, onExit: () => void, lineDelay = 2.2): void {
    const info = ENDINGS[id];
    const s = this.showScreen(
      `<div class="card end-card" data-testid="ending" data-ending="${id}">
        <div class="kicker">Ending ${info.number} of ${ENDING_IDS.length}</div>
        <h1>${esc(info.title)}</h1>
        <div class="epilogue">${lines.map((l) => `<p class="ep">${esc(l)}</p>`).join('')}</div>
        <div class="after">
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

  /** Reveal the epilogue at once (Skip on the ending screen). */
  revealEnding(): void {
    this.screen.querySelectorAll('.ep, .after').forEach((e) => e.classList.add('in'));
  }

  reset(): void {
    this.clearText();
    this.clearChoices();
    this.clearDoorChoice();
    this.breathe(null);
    this.objectives(null);
    this.prompt(null);
    this.hint(null);
    this.noise(0);
    this.noiseVisible(false);
    this.phone.reset();
    this.timestamp('');
  }
}
