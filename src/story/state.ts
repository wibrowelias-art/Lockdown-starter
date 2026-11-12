// Pure story state machine. No DOM, no Three.js: everything that decides an
// ending lives here so it can be unit-tested in isolation.

export type SceneId = 'title' | 'exam' | 'code' | 'texts' | 'waiting' | 'door' | 'ending' | 'exited';

export const PLAY_ORDER: SceneId[] = ['exam', 'code', 'texts', 'waiting', 'door', 'ending'];

export type NoiseSource =
  | 'phoneBuzz'
  | 'chairKnock'
  | 'footstep'
  | 'theoPanic'
  | 'teacherLights'
  | 'teacherPhone'
  | 'teacherDrag'
  | 'teacherTheo';

/** How much each mistake adds to the noise level (0-100). */
export const NOISE_COST: Record<NoiseSource, number> = {
  phoneBuzz: 12,
  chairKnock: 9,
  footstep: 1.5,
  theoPanic: 12,
  teacherLights: 8,
  teacherPhone: 6,
  teacherDrag: 6,
  teacherTheo: 6,
};

export const NOISE_LABEL: Record<NoiseSource, string> = {
  phoneBuzz: 'your phone buzzed',
  chairKnock: 'a chair scraped',
  footstep: 'footsteps',
  theoPanic: "Theo's breathing",
  teacherLights: 'Ms. Okafor had to reach the lights',
  teacherPhone: 'Ms. Okafor had to take your phone',
  teacherDrag: 'Ms. Okafor had to pull you back',
  teacherTheo: "Theo's chair scraped",
};

/** At or above this, whoever is in the hall has heard Room 214. */
export const NOISE_HIGH = 45;
export const NOISE_MAX = 100;
/** At or above this, Zoe felt you were with her. */
export const TRUST_GOOD = 2;

export type ReplyKind = 'calm' | 'stay' | 'come' | 'nothing';
export const REPLY_ROUNDS = 2;
/** Trust change per reply, per round. Round 2 "come" is "run for it": no trust gained. */
export const REPLY_TRUST: Record<ReplyKind, [number, number]> = {
  calm: [2, 2],
  stay: [1, 1],
  come: [1, 0],
  nothing: [-1, -1],
};

export type LockdownStep = 'awayFromDoor' | 'crouched' | 'lightsOff' | 'phoneSilenced';
export const LOCKDOWN_STEPS: LockdownStep[] = ['awayFromDoor', 'crouched', 'lightsOff', 'phoneSilenced'];

export type DoorChoice = 'open' | 'locked';
export type EndingId = 'all_clear' | 'left_on_read' | 'long_minute' | 'door_held' | 'open_door';
export const ENDING_IDS: EndingId[] = ['all_clear', 'left_on_read', 'long_minute', 'door_held', 'open_door'];

export interface NoiseEntry {
  source: NoiseSource;
  amount: number;
  scene: SceneId;
}

export interface StoryState {
  scene: SceneId;
  /** Scene the player was in when they pressed Exit. */
  exitedFrom: SceneId | null;
  zoeTrust: number;
  noise: number;
  helpedClassmate: boolean;
  theoHelp: { pulledDown: boolean; breathed: boolean };
  bubbles: number[];
  gaveEraser: boolean;
  steps: Record<LockdownStep, boolean>;
  /** Steps Ms. Okafor had to do for you when time ran out. */
  teacherDid: LockdownStep[];
  replies: (ReplyKind | null)[];
  toldZoeToCome: boolean;
  finalChoice: DoorChoice | null;
  ending: EndingId | null;
  noiseLog: NoiseEntry[];
  skipped: SceneId[];
}

export type StoryEvent =
  | { type: 'BEGIN' }
  | { type: 'FILL_BUBBLE'; index: number }
  | { type: 'GIVE_ERASER' }
  | { type: 'EXAM_END' }
  | { type: 'NOISE'; source: NoiseSource }
  | { type: 'STEP'; step: LockdownStep }
  | { type: 'HELP_THEO'; how: 'pulledDown' | 'breathed' }
  | { type: 'CODE_END' }
  | { type: 'REPLY'; round: number; reply: ReplyKind }
  | { type: 'TEXTS_END' }
  | { type: 'WAIT_END' }
  | { type: 'CHOOSE_DOOR'; choice: DoorChoice }
  | { type: 'SKIP' }
  | { type: 'EXIT' }
  | { type: 'RESTART' };

export function initialState(): StoryState {
  return {
    scene: 'title',
    exitedFrom: null,
    zoeTrust: 0,
    noise: 0,
    helpedClassmate: false,
    theoHelp: { pulledDown: false, breathed: false },
    bubbles: [],
    gaveEraser: false,
    steps: { awayFromDoor: false, crouched: false, lightsOff: false, phoneSilenced: false },
    teacherDid: [],
    replies: Array.from({ length: REPLY_ROUNDS }, () => null),
    toldZoeToCome: false,
    finalChoice: null,
    ending: null,
    noiseLog: [],
    skipped: [],
  };
}

export const BUBBLE_COUNT = 8;

export function computeEnding(s: Pick<StoryState, 'zoeTrust' | 'noise' | 'helpedClassmate'>, choice: DoorChoice): EndingId {
  const loud = s.noise >= NOISE_HIGH;
  if (choice === 'open') {
    // Opening the door always costs something. How much depends on whether
    // Theo was steady enough to help hold it, and whether the hall knew you were there.
    if (!s.helpedClassmate && loud) return 'open_door';
    return 'door_held';
  }
  if (s.zoeTrust < TRUST_GOOD) return 'left_on_read';
  if (loud || !s.helpedClassmate) return 'long_minute';
  return 'all_clear';
}

function addNoise(s: StoryState, source: NoiseSource): StoryState {
  const before = s.noise;
  const noise = Math.min(NOISE_MAX, round1(before + NOISE_COST[source]));
  return {
    ...s,
    noise,
    noiseLog: [...s.noiseLog, { source, amount: round1(noise - before), scene: s.scene }],
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function applyReply(s: StoryState, round: number, reply: ReplyKind): StoryState {
  if (round < 0 || round >= REPLY_ROUNDS || s.replies[round] !== null) return s;
  const replies = s.replies.slice();
  replies[round] = reply;
  return {
    ...s,
    replies,
    zoeTrust: s.zoeTrust + REPLY_TRUST[reply][round],
    toldZoeToCome: s.toldZoeToCome || reply === 'come',
  };
}

function finishCode(s: StoryState): StoryState {
  let next = s;
  const did: LockdownStep[] = [];
  if (!next.steps.lightsOff) {
    next = addNoise(next, 'teacherLights');
    did.push('lightsOff');
  }
  if (!next.steps.phoneSilenced) {
    next = addNoise(next, 'teacherPhone');
    did.push('phoneSilenced');
  }
  if (!next.steps.awayFromDoor || !next.steps.crouched) {
    next = addNoise(next, 'teacherDrag');
    if (!next.steps.awayFromDoor) did.push('awayFromDoor');
    if (!next.steps.crouched) did.push('crouched');
  }
  if (!next.theoHelp.pulledDown) {
    next = addNoise(next, 'teacherTheo');
  }
  return {
    ...next,
    teacherDid: did,
    steps: { awayFromDoor: true, crouched: true, lightsOff: true, phoneSilenced: true },
    scene: 'texts',
  };
}

function choose(s: StoryState, choice: DoorChoice): StoryState {
  return { ...s, finalChoice: choice, ending: computeEnding(s, choice), scene: 'ending' };
}

export function reduce(s: StoryState, e: StoryEvent): StoryState {
  if (e.type === 'RESTART') return initialState();
  if (e.type === 'EXIT') {
    if (s.scene === 'exited') return s;
    return { ...s, exitedFrom: s.scene, scene: 'exited' };
  }

  switch (s.scene) {
    case 'title':
      if (e.type === 'BEGIN') return { ...s, scene: 'exam' };
      return s;

    case 'exam':
      switch (e.type) {
        case 'FILL_BUBBLE':
          if (e.index < 0 || e.index >= BUBBLE_COUNT || s.bubbles.includes(e.index)) return s;
          return { ...s, bubbles: [...s.bubbles, e.index] };
        case 'GIVE_ERASER':
          if (s.gaveEraser) return s;
          return { ...s, gaveEraser: true, zoeTrust: s.zoeTrust + 1 };
        case 'EXAM_END':
          return { ...s, scene: 'code' };
        case 'SKIP':
          return { ...s, scene: 'code', skipped: [...s.skipped, 'exam'] };
        default:
          return s;
      }

    case 'code':
      switch (e.type) {
        case 'NOISE':
          return addNoise(s, e.source);
        case 'STEP':
          if (s.steps[e.step]) return s;
          return { ...s, steps: { ...s.steps, [e.step]: true } };
        case 'HELP_THEO':
          if (e.how !== 'pulledDown' || s.theoHelp.pulledDown) return s;
          return { ...s, helpedClassmate: true, theoHelp: { ...s.theoHelp, pulledDown: true } };
        case 'CODE_END':
          return finishCode(s);
        case 'SKIP':
          // Skipping is an accessibility tool: no penalties, steps done for you.
          return {
            ...s,
            steps: { awayFromDoor: true, crouched: true, lightsOff: true, phoneSilenced: true },
            scene: 'texts',
            skipped: [...s.skipped, 'code'],
          };
        default:
          return s;
      }

    case 'texts':
      switch (e.type) {
        case 'NOISE':
          return addNoise(s, e.source);
        case 'REPLY':
          return applyReply(s, e.round, e.reply);
        case 'TEXTS_END': {
          // Rounds that timed out count as silence.
          let next = s;
          next.replies.forEach((r, i) => {
            if (r === null) next = applyReply(next, i, 'nothing');
          });
          return { ...next, scene: 'waiting' };
        }
        case 'SKIP': {
          let next = s;
          next.replies.forEach((r, i) => {
            if (r === null) next = applyReply(next, i, 'stay');
          });
          return { ...next, scene: 'waiting', skipped: [...s.skipped, 'texts'] };
        }
        default:
          return s;
      }

    case 'waiting':
      switch (e.type) {
        case 'NOISE':
          return addNoise(s, e.source);
        case 'HELP_THEO':
          if (e.how !== 'breathed' || s.theoHelp.breathed) return s;
          return { ...s, helpedClassmate: true, theoHelp: { ...s.theoHelp, breathed: true } };
        case 'WAIT_END':
          return { ...s, scene: 'door' };
        case 'SKIP':
          return { ...s, scene: 'door', skipped: [...s.skipped, 'waiting'] };
        default:
          return s;
      }

    case 'door':
      switch (e.type) {
        case 'NOISE':
          return addNoise(s, e.source);
        case 'CHOOSE_DOOR':
          return choose(s, e.choice);
        case 'SKIP':
          return { ...choose(s, 'locked'), skipped: [...s.skipped, 'door'] };
        default:
          return s;
      }

    case 'ending':
    case 'exited':
      return s;
  }
}

/** Tiny observable store around the reducer. */
export class Store {
  state: StoryState = initialState();
  private listeners = new Set<(s: StoryState, prev: StoryState, e: StoryEvent) => void>();

  dispatch(e: StoryEvent): StoryState {
    const prev = this.state;
    const next = reduce(prev, e);
    if (next !== prev) {
      this.state = next;
      this.listeners.forEach((l) => l(next, prev, e));
    }
    return next;
  }

  subscribe(fn: (s: StoryState, prev: StoryState, e: StoryEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
