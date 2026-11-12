import { describe, expect, it } from 'vitest';
import {
  ENDING_IDS,
  type EndingId,
  type LockdownStep,
  NOISE_COST,
  NOISE_HIGH,
  type ReplyKind,
  type StoryEvent,
  type StoryState,
  computeEnding,
  initialState,
  reduce,
} from '../../src/story/state';
import { ENDINGS, GUIDANCE, endingSequence, epilogue } from '../../src/story/endings';

const run = (events: StoryEvent[], from: StoryState = initialState()) => events.reduce(reduce, from);

const ALL_STEPS: StoryEvent[] = (['awayFromDoor', 'crouched', 'lightsOff', 'phoneSilenced'] as LockdownStep[]).map(
  (step) => ({ type: 'STEP', step }),
);

interface Path {
  eraser?: boolean;
  pullTheo?: boolean;
  breathe?: boolean;
  steps?: boolean;
  buzzes?: number;
  replies: [ReplyKind | null, ReplyKind | null];
  door: 'open' | 'locked';
}

function play(p: Path): StoryState {
  const ev: StoryEvent[] = [{ type: 'BEGIN' }, { type: 'FILL_BUBBLE', index: 0 }];
  if (p.eraser) ev.push({ type: 'GIVE_ERASER' });
  ev.push({ type: 'EXAM_END' });
  for (let i = 0; i < (p.buzzes ?? 0); i++) ev.push({ type: 'NOISE', source: 'phoneBuzz' });
  if (p.steps !== false) ev.push(...ALL_STEPS);
  if (p.pullTheo) ev.push({ type: 'HELP_THEO', how: 'pulledDown' });
  ev.push({ type: 'CODE_END' });
  p.replies.forEach((r, round) => r && ev.push({ type: 'REPLY', round, reply: r }));
  ev.push({ type: 'TEXTS_END' });
  if (p.breathe) ev.push({ type: 'HELP_THEO', how: 'breathed' });
  else ev.push({ type: 'NOISE', source: 'theoPanic' });
  ev.push({ type: 'WAIT_END' }, { type: 'CHOOSE_DOOR', choice: p.door });
  return run(ev);
}

// One concrete playthrough per ending, mirroring what the e2e tests do in the browser.
const PATHS: Record<EndingId, Path> = {
  all_clear: { eraser: true, pullTheo: true, breathe: true, replies: ['calm', 'calm'], door: 'locked' },
  left_on_read: { breathe: true, replies: ['nothing', null], door: 'locked' },
  long_minute: { eraser: true, replies: ['calm', 'stay'], door: 'locked' },
  door_held: { pullTheo: true, replies: ['come', 'stay'], door: 'open' },
  open_door: { buzzes: 4, steps: false, replies: ['stay', 'nothing'], door: 'open' },
};

describe('scene flow', () => {
  it('walks title -> exam -> code -> texts -> waiting -> door -> ending', () => {
    let s = initialState();
    const seen = [s.scene];
    for (const e of [
      { type: 'BEGIN' },
      { type: 'EXAM_END' },
      { type: 'CODE_END' },
      { type: 'TEXTS_END' },
      { type: 'WAIT_END' },
      { type: 'CHOOSE_DOOR', choice: 'locked' },
    ] as StoryEvent[]) {
      s = reduce(s, e);
      seen.push(s.scene);
    }
    expect(seen).toEqual(['title', 'exam', 'code', 'texts', 'waiting', 'door', 'ending']);
    expect(s.ending).not.toBeNull();
  });

  it('ignores events that do not belong to the current scene', () => {
    const s = run([{ type: 'BEGIN' }]);
    expect(reduce(s, { type: 'CHOOSE_DOOR', choice: 'open' })).toBe(s);
    expect(reduce(s, { type: 'NOISE', source: 'phoneBuzz' })).toBe(s);
    expect(reduce(s, { type: 'REPLY', round: 0, reply: 'calm' })).toBe(s);
  });
});

describe('hidden values', () => {
  it('eraser builds trust once', () => {
    const s = run([{ type: 'BEGIN' }, { type: 'GIVE_ERASER' }, { type: 'GIVE_ERASER' }]);
    expect(s.zoeTrust).toBe(1);
  });

  it('each reply round can only be answered once, and timeouts count as silence', () => {
    const atTexts = run([{ type: 'BEGIN' }, { type: 'EXAM_END' }, ...ALL_STEPS, { type: 'CODE_END' }]);
    const s = run(
      [
        { type: 'REPLY', round: 0, reply: 'calm' },
        { type: 'REPLY', round: 0, reply: 'nothing' },
        { type: 'TEXTS_END' },
      ],
      atTexts,
    );
    expect(s.replies).toEqual(['calm', 'nothing']);
    expect(s.zoeTrust).toBe(2 - 1);
  });

  it('noise rises with mistakes, is capped, and never ends the game', () => {
    let s = run([{ type: 'BEGIN' }, { type: 'EXAM_END' }]);
    for (let i = 0; i < 40; i++) s = reduce(s, { type: 'NOISE', source: 'phoneBuzz' });
    expect(s.noise).toBe(100);
    expect(s.scene).toBe('code');
    s = reduce(s, { type: 'NOISE', source: 'chairKnock' });
    expect(s.scene).toBe('code');
  });

  it('noise is not counted during the exam', () => {
    const s = run([{ type: 'BEGIN' }, { type: 'NOISE', source: 'phoneBuzz' }]);
    expect(s.noise).toBe(0);
  });

  it('when time runs out the teacher finishes the steps, with a noise cost', () => {
    const s = run([{ type: 'BEGIN' }, { type: 'EXAM_END' }, { type: 'CODE_END' }]);
    expect(s.scene).toBe('texts');
    expect(Object.values(s.steps).every(Boolean)).toBe(true);
    expect(s.teacherDid.sort()).toEqual(['awayFromDoor', 'crouched', 'lightsOff', 'phoneSilenced']);
    expect(s.noise).toBe(
      NOISE_COST.teacherLights + NOISE_COST.teacherPhone + NOISE_COST.teacherDrag + NOISE_COST.teacherTheo,
    );
  });

  it('helping Theo in either scene sets helpedClassmate', () => {
    const a = run([{ type: 'BEGIN' }, { type: 'EXAM_END' }, { type: 'HELP_THEO', how: 'pulledDown' }]);
    expect(a.helpedClassmate).toBe(true);
    const b = run([
      { type: 'BEGIN' },
      { type: 'EXAM_END' },
      { type: 'CODE_END' },
      { type: 'TEXTS_END' },
      { type: 'HELP_THEO', how: 'breathed' },
    ]);
    expect(b.helpedClassmate).toBe(true);
  });
});

describe('endings', () => {
  for (const id of ENDING_IDS) {
    it(`"${ENDINGS[id].title}" (${id}) is reachable by playing`, () => {
      const s = play(PATHS[id]);
      expect(s.scene).toBe('ending');
      expect(s.ending).toBe(id);
      expect(endingSequence(s).length).toBeGreaterThan(3);
      expect(epilogue(s).length).toBeGreaterThanOrEqual(3);
    });
  }

  it('the open-door ending path is really loud', () => {
    expect(play(PATHS.open_door).noise).toBeGreaterThanOrEqual(NOISE_HIGH);
  });

  it('every combination of hidden values maps to an ending, and all five appear', () => {
    const found = new Set<EndingId>();
    for (let trust = -2; trust <= 5; trust++)
      for (let noise = 0; noise <= 100; noise += 5)
        for (const helped of [true, false])
          for (const choice of ['open', 'locked'] as const) {
            const e = computeEnding({ zoeTrust: trust, noise, helpedClassmate: helped }, choice);
            expect(ENDING_IDS).toContain(e);
            found.add(e);
          }
    expect([...found].sort()).toEqual([...ENDING_IDS].sort());
  });

  it('opening the door always costs something; only a locked door gives everyone-safe', () => {
    for (const helped of [true, false])
      for (const noise of [0, 100]) {
        const e = computeEnding({ zoeTrust: 5, noise, helpedClassmate: helped }, 'open');
        expect(['door_held', 'open_door']).toContain(e);
      }
    expect(computeEnding({ zoeTrust: 5, noise: 0, helpedClassmate: true }, 'locked')).toBe('all_clear');
  });

  it('the guidance line is the exact required text', () => {
    expect(GUIDANCE).toBe(
      "In a real lockdown, follow your school's plan and your teacher's instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe.",
    );
  });
});

describe('skip and exit', () => {
  it('skip moves through every scene with neutral defaults and ends locked', () => {
    let s = run([{ type: 'BEGIN' }]);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      s = reduce(s, { type: 'SKIP' });
      seen.push(s.scene);
    }
    expect(seen).toEqual(['code', 'texts', 'waiting', 'door', 'ending']);
    expect(s.noise).toBe(0);
    expect(s.replies).toEqual(['stay', 'stay']);
    expect(s.finalChoice).toBe('locked');
    expect(s.skipped).toEqual(['exam', 'code', 'texts', 'waiting', 'door']);
  });

  it('exit works from every scene and restart resets everything', () => {
    const scenesToTry: StoryEvent[][] = [
      [],
      [{ type: 'BEGIN' }],
      [{ type: 'BEGIN' }, { type: 'EXAM_END' }],
      [{ type: 'BEGIN' }, { type: 'EXAM_END' }, { type: 'CODE_END' }],
      [{ type: 'BEGIN' }, { type: 'EXAM_END' }, { type: 'CODE_END' }, { type: 'TEXTS_END' }],
      [{ type: 'BEGIN' }, { type: 'EXAM_END' }, { type: 'CODE_END' }, { type: 'TEXTS_END' }, { type: 'WAIT_END' }],
    ];
    for (const evs of scenesToTry) {
      const before = run(evs);
      const out = reduce(before, { type: 'EXIT' });
      expect(out.scene).toBe('exited');
      expect(out.exitedFrom).toBe(before.scene);
      expect(reduce(out, { type: 'RESTART' })).toEqual(initialState());
    }
  });
});
