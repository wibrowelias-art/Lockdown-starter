// Pure story state machine (v2). No DOM, no Three.js: everything that decides an
// ending lives here so it can be unit-tested in isolation.

export type SceneId = 'title' | 'exam' | 'code' | 'lockdown' | 'texts' | 'waiting' | 'door' | 'ending' | 'exited';

/** The six playable phases, in order. */
export const PHASES: SceneId[] = ['exam', 'code', 'lockdown', 'texts', 'waiting', 'door'];
export const PLAY_ORDER: SceneId[] = [...PHASES, 'ending'];

export type TaskId =
  // 1 exam
  | 'bubbles'
  | 'holdStillAisle'
  | 'zoeBackpack'
  // 2 code
  | 'lookPA'
  | 'dropDown'
  // 3 lockdown (free order, 75 s)
  | 'wallByDoor'
  | 'theoDown'
  | 'blinds'
  | 'coverWindow'
  | 'barricade'
  | 'ringingPhone'
  | 'silencePhone'
  | 'lockAndLights'
  // 4 phone
  | 'zoeReplies'
  | 'testQuestion'
  | 'textMom'
  | 'coverGlow'
  // 5 waiting
  | 'holdStill'
  | 'breatheTheo'
  | 'schoolAlert'
  | 'whisper'
  | 'stayDown'
  // 6 the knock
  | 'readTiming'
  | 'decide';

export const TASKS_BY_PHASE: Record<string, TaskId[]> = {
  exam: ['bubbles', 'holdStillAisle', 'zoeBackpack'],
  code: ['lookPA', 'dropDown'],
  lockdown: ['wallByDoor', 'theoDown', 'blinds', 'coverWindow', 'barricade', 'ringingPhone', 'silencePhone', 'lockAndLights'],
  texts: ['zoeReplies', 'testQuestion', 'textMom', 'coverGlow'],
  waiting: ['holdStill', 'breatheTheo', 'schoolAlert', 'whisper', 'stayDown'],
  door: ['readTiming', 'decide'],
};
export const ALL_TASKS: TaskId[] = Object.values(TASKS_BY_PHASE).flat();

/** Lockdown steps the player can leave undone; Ms. Okafor covers some of them, loudly. */
export const LOCKDOWN_PLAYER_TASKS: TaskId[] = ['wallByDoor', 'theoDown', 'blinds', 'coverWindow', 'barricade', 'ringingPhone', 'silencePhone'];

export type NoiseSource =
  | 'phoneBuzz'
  | 'ringtone'
  | 'chairKnock'
  | 'footstep'
  | 'hurryStep'
  | 'deskScrape'
  | 'theoPanic'
  | 'teacherHindered'
  | 'teacherCover'
  | 'glow'
  | 'momLate'
  | 'momCall'
  | 'moved'
  | 'stoodUp'
  | 'whisperMove';

export const NOISE_COST: Record<NoiseSource, number> = {
  phoneBuzz: 12,
  ringtone: 14,
  chairKnock: 9,
  footstep: 1.5,
  hurryStep: 4,
  deskScrape: 10,
  theoPanic: 12,
  teacherHindered: 8,
  teacherCover: 5,
  glow: 6,
  momLate: 4,
  momCall: 10,
  moved: 10,
  stoodUp: 8,
  whisperMove: 4,
};

export const NOISE_LABEL: Record<NoiseSource, string> = {
  phoneBuzz: 'your phone buzzed',
  ringtone: 'a phone rang',
  chairKnock: 'a chair scraped',
  footstep: 'footsteps',
  hurryStep: 'running steps',
  deskScrape: 'the desk scraped',
  theoPanic: "Theo's breathing",
  teacherHindered: 'Ms. Okafor had to get past you',
  teacherCover: 'Ms. Okafor had to cover for you',
  glow: 'your screen glowed',
  momLate: 'typing to Mom',
  momCall: "Mom's call buzzed",
  moved: 'you moved',
  stoodUp: 'you stood up',
  whisperMove: 'Sam shifted toward the window',
};

/** At or above this, whoever is in the hall has heard Room 214. */
export const NOISE_HIGH = 45;
export const NOISE_MAX = 100;
/** At or above this, Zoe felt you were with her. */
export const TRUST_GOOD = 2;
export const BATTERY_START = 9;
export const HOLD_STILL_EVENTS = 3;
export const HOLD_STILL_NEEDED = 2;

export type ReplyKind = 'calm' | 'stay' | 'come' | 'nothing';
export const REPLY_ROUNDS = 3;
/** Trust change per reply, per round. */
export const REPLY_TRUST: Record<ReplyKind, number[]> = {
  calm: [2, 2, 2],
  stay: [1, 1, 1],
  come: [1, 0, 0],
  nothing: [-1, -1, -1],
};

export type DoorChoice = 'open' | 'locked';
export type WhisperChoice = 'stay' | 'maybe' | 'silent';
export type EndingId = 'all_clear' | 'left_on_read' | 'long_minute' | 'door_held' | 'open_door';
export const ENDING_IDS: EndingId[] = ['all_clear', 'left_on_read', 'long_minute', 'door_held', 'open_door'];
export type ClueId = 'testQuestion' | 'schoolAlert' | 'timing';
export const CLUE_IDS: ClueId[] = ['testQuestion', 'schoolAlert', 'timing'];

export interface NoiseEntry {
  source: NoiseSource;
  amount: number;
  scene: SceneId;
}

export interface StoryState {
  scene: SceneId;
  exitedFrom: SceneId | null;
  zoeTrust: number;
  noise: number;
  helpedClassmate: boolean;
  /** 0..2: pulled down (+1), breathed with (+1) */
  theoCalm: number;
  tasks: Record<TaskId, boolean>;
  /** Tasks that were attempted and missed (e.g. the ringing phone rang out). */
  missed: TaskId[];
  /** Lockdown steps Ms. Okafor did because time ran out. */
  teacherDid: TaskId[];
  clues: Record<ClueId, boolean>;
  battery: number;
  phoneChecks: number;
  zoeLost: boolean;
  momTexted: boolean;
  bubbles: number[];
  holdStill: number;
  holdStillFails: number;
  replies: (ReplyKind | null)[];
  toldZoeToCome: boolean;
  whisper: WhisperChoice | null;
  testTextSent: boolean;
  finalChoice: DoorChoice | null;
  ending: EndingId | null;
  noiseLog: NoiseEntry[];
  skipped: SceneId[];
}

export type StoryEvent =
  | { type: 'BEGIN' }
  | { type: 'FILL_BUBBLE'; index: number }
  | { type: 'TASK'; task: TaskId }
  | { type: 'MISS'; task: TaskId }
  | { type: 'NOISE'; source: NoiseSource }
  | { type: 'PHONE_CHECK' }
  | { type: 'REPLY'; round: number; reply: ReplyKind }
  | { type: 'HOLD_STILL'; passed: boolean }
  | { type: 'WHISPER'; choice: WhisperChoice }
  | { type: 'TEST_TEXT' }
  | { type: 'NEXT' }
  | { type: 'CHOOSE_DOOR'; choice: DoorChoice }
  | { type: 'SKIP' }
  | { type: 'EXIT' }
  | { type: 'RESTART' };

export const BUBBLES_NEEDED = 4;
export const BUBBLE_COUNT = 8;

export function initialState(): StoryState {
  return {
    scene: 'title',
    exitedFrom: null,
    zoeTrust: 0,
    noise: 0,
    helpedClassmate: false,
    theoCalm: 0,
    tasks: Object.fromEntries(ALL_TASKS.map((t) => [t, false])) as Record<TaskId, boolean>,
    missed: [],
    teacherDid: [],
    clues: { testQuestion: false, schoolAlert: false, timing: false },
    battery: BATTERY_START,
    phoneChecks: 0,
    zoeLost: false,
    momTexted: false,
    bubbles: [],
    holdStill: 0,
    holdStillFails: 0,
    replies: Array.from({ length: REPLY_ROUNDS }, () => null),
    toldZoeToCome: false,
    whisper: null,
    testTextSent: false,
    finalChoice: null,
    ending: null,
    noiseLog: [],
    skipped: [],
  };
}

export function cluesFound(s: Pick<StoryState, 'clues'>): number {
  return CLUE_IDS.filter((c) => s.clues[c]).length;
}

export function tasksDone(s: Pick<StoryState, 'tasks'>): number {
  return ALL_TASKS.filter((t) => s.tasks[t]).length;
}

type EndingInput = Pick<StoryState, 'zoeTrust' | 'noise' | 'helpedClassmate' | 'zoeLost' | 'holdStill'> & {
  tasks: Pick<Record<TaskId, boolean>, 'barricade'>;
};

/**
 * Endings. Opening the door always costs something; the desk barricade (a task)
 * buys the seconds that keep it from being the worst outcome. Keeping it locked is
 * always the safe choice; how it feels depends on Zoe (trust, battery) and how
 * quiet and steady the room was (noise, Theo, hold-still).
 */
export function computeEnding(s: EndingInput, choice: DoorChoice): EndingId {
  const loud = s.noise >= NOISE_HIGH;
  if (choice === 'open') {
    if (s.tasks.barricade) return 'door_held';
    if (!s.helpedClassmate && loud) return 'open_door';
    return 'door_held';
  }
  if (s.zoeTrust < TRUST_GOOD || s.zoeLost) return 'left_on_read';
  if (loud || !s.helpedClassmate || s.holdStill < HOLD_STILL_NEEDED) return 'long_minute';
  return 'all_clear';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function addNoise(s: StoryState, source: NoiseSource): StoryState {
  const before = s.noise;
  const noise = Math.min(NOISE_MAX, round1(before + NOISE_COST[source]));
  return { ...s, noise, noiseLog: [...s.noiseLog, { source, amount: round1(noise - before), scene: s.scene }] };
}

function doTask(s: StoryState, task: TaskId): StoryState {
  if (s.tasks[task]) return s;
  let next: StoryState = { ...s, tasks: { ...s.tasks, [task]: true } };
  switch (task) {
    case 'theoDown':
    case 'breatheTheo':
      next = { ...next, theoCalm: Math.min(2, next.theoCalm + 1), helpedClassmate: true };
      break;
    case 'textMom':
      next = { ...next, momTexted: true };
      if (s.scene === 'waiting' || s.scene === 'door') next = addNoise(next, 'momLate');
      break;
    case 'testQuestion':
    case 'schoolAlert':
      next = { ...next, clues: { ...next.clues, [task]: true } };
      break;
    case 'readTiming':
      next = { ...next, clues: { ...next.clues, timing: true } };
      break;
  }
  return next;
}

function applyReply(s: StoryState, round: number, reply: ReplyKind): StoryState {
  if (round < 0 || round >= REPLY_ROUNDS || s.replies[round] !== null) return s;
  const replies = s.replies.slice();
  replies[round] = reply;
  let next: StoryState = {
    ...s,
    replies,
    zoeTrust: s.zoeTrust + REPLY_TRUST[reply][round],
    toldZoeToCome: s.toldZoeToCome || reply === 'come',
  };
  if (replies.every((r) => r !== null)) next = { ...next, tasks: { ...next.tasks, zoeReplies: true } };
  return next;
}

function finishLockdown(s: StoryState): StoryState {
  let next = s;
  const did: TaskId[] = [];
  // Ms. Okafor covers the essentials you missed; each costs noise.
  for (const t of ['wallByDoor', 'silencePhone', 'blinds'] as TaskId[]) {
    if (!next.tasks[t]) {
      next = addNoise(next, 'teacherCover');
      did.push(t);
    }
  }
  return {
    ...next,
    teacherDid: did,
    tasks: { ...next.tasks, wallByDoor: true, silencePhone: true, blinds: true, lockAndLights: true },
    scene: 'texts',
  };
}

function choose(s: StoryState, choice: DoorChoice): StoryState {
  const withTask = { ...s, tasks: { ...s.tasks, decide: true } };
  return { ...withTask, finalChoice: choice, ending: computeEnding(withTask, choice), scene: 'ending' };
}

function nextScene(s: StoryState, skipping: boolean): StoryState {
  const skipped = skipping ? [...s.skipped, s.scene] : s.skipped;
  switch (s.scene) {
    case 'exam':
      return { ...s, scene: 'code', skipped };
    case 'code':
      return { ...s, scene: 'lockdown', skipped };
    case 'lockdown':
      if (skipping)
        // Skip is an accessibility tool: steps done for you, no penalty.
        return {
          ...s,
          tasks: { ...s.tasks, wallByDoor: true, silencePhone: true, blinds: true, lockAndLights: true },
          scene: 'texts',
          skipped,
        };
      return { ...finishLockdown(s), skipped };
    case 'texts': {
      let next = s;
      next.replies.forEach((r, i) => {
        if (r === null) next = applyReply(next, i, skipping ? 'stay' : 'nothing');
      });
      return { ...next, scene: 'waiting', skipped };
    }
    case 'waiting':
      return { ...s, scene: 'door', skipped };
    case 'door':
      return { ...choose(s, 'locked'), skipped };
    default:
      return s;
  }
}

const NOISY: SceneId[] = ['code', 'lockdown', 'texts', 'waiting', 'door'];

export function reduce(s: StoryState, e: StoryEvent): StoryState {
  if (e.type === 'RESTART') return initialState();
  if (e.type === 'EXIT') {
    if (s.scene === 'exited') return s;
    return { ...s, exitedFrom: s.scene, scene: 'exited' };
  }
  if (s.scene === 'title') return e.type === 'BEGIN' ? { ...s, scene: 'exam' } : s;
  if (s.scene === 'ending' || s.scene === 'exited') return s;

  switch (e.type) {
    case 'FILL_BUBBLE': {
      if (s.scene !== 'exam' || e.index < 0 || e.index >= BUBBLE_COUNT || s.bubbles.includes(e.index)) return s;
      const bubbles = [...s.bubbles, e.index];
      const next = { ...s, bubbles };
      return bubbles.length >= BUBBLES_NEEDED ? doTask(next, 'bubbles') : next;
    }
    case 'TASK':
      return doTask(s, e.task);
    case 'MISS':
      if (s.tasks[e.task] || s.missed.includes(e.task)) return s;
      return { ...s, missed: [...s.missed, e.task] };
    case 'NOISE':
      return NOISY.includes(s.scene) ? addNoise(s, e.source) : s;
    case 'PHONE_CHECK': {
      if (s.battery <= 0) return s;
      const battery = s.battery - 1;
      return { ...s, battery, phoneChecks: s.phoneChecks + 1, zoeLost: s.zoeLost || battery <= 0 };
    }
    case 'REPLY':
      return s.scene === 'texts' ? applyReply(s, e.round, e.reply) : s;
    case 'HOLD_STILL': {
      if (s.scene !== 'waiting') return s;
      const next = e.passed ? { ...s, holdStill: s.holdStill + 1 } : addNoise({ ...s, holdStillFails: s.holdStillFails + 1 }, 'moved');
      return next.holdStill + next.holdStillFails >= HOLD_STILL_EVENTS && next.holdStill >= HOLD_STILL_NEEDED
        ? doTask(next, 'holdStill')
        : next;
    }
    case 'WHISPER': {
      if (s.scene !== 'waiting' || s.whisper) return s;
      const next = doTask({ ...s, whisper: e.choice }, 'whisper');
      return e.choice === 'maybe' ? addNoise(next, 'whisperMove') : next;
    }
    case 'TEST_TEXT':
      if (s.scene !== 'door' || s.testTextSent || s.battery <= 0) return s;
      return { ...s, testTextSent: true, clues: { ...s.clues, testQuestion: true } };
    case 'NEXT':
      return nextScene(s, false);
    case 'SKIP':
      return nextScene(s, true);
    case 'CHOOSE_DOOR':
      return s.scene === 'door' ? choose(s, e.choice) : s;
    default:
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
