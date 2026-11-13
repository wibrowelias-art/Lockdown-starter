import { describe, expect, it } from 'vitest';
import {
  ALL_TASKS,
  BATTERY_START,
  ENDING_IDS,
  type EndingId,
  NOISE_COST,
  NOISE_HIGH,
  type ReplyKind,
  type StoryEvent,
  type StoryState,
  type TaskId,
  computeEnding,
  initialState,
  reduce,
} from '../../src/story/state';
import { ENDINGS, GUIDANCE, TRUTH, endingSequence, epilogue } from '../../src/story/endings';

const run = (events: StoryEvent[], from: StoryState = initialState()) => events.reduce(reduce, from);
const task = (t: TaskId): StoryEvent => ({ type: 'TASK', task: t });
const at = (scene: string): StoryEvent[] => {
  const order = ['exam', 'code', 'lockdown', 'texts', 'waiting', 'door'];
  return [{ type: 'BEGIN' }, ...Array.from({ length: order.indexOf(scene) }, () => ({ type: 'NEXT' }) as StoryEvent)];
};

interface Path {
  barricade?: boolean;
  theoDown?: boolean;
  breathe?: boolean;
  buzzes?: number;
  replies: (ReplyKind | null)[];
  holdStill: boolean[];
  checks?: number;
  door: 'open' | 'locked';
}

function play(p: Path): StoryState {
  const ev: StoryEvent[] = [{ type: 'BEGIN' }];
  for (let i = 0; i < 4; i++) ev.push({ type: 'FILL_BUBBLE', index: i });
  ev.push({ type: 'NEXT' }, task('lookPA'), task('dropDown'), { type: 'NEXT' });
  ev.push(task('wallByDoor'), task('blinds'), task('silencePhone'));
  if (p.barricade) ev.push(task('barricade'));
  if (p.theoDown) ev.push(task('theoDown'));
  for (let i = 0; i < (p.buzzes ?? 0); i++) ev.push({ type: 'NOISE', source: 'phoneBuzz' });
  ev.push({ type: 'NEXT' });
  for (let i = 0; i < (p.checks ?? 3); i++) ev.push({ type: 'PHONE_CHECK' });
  p.replies.forEach((r, round) => r && ev.push({ type: 'REPLY', round, reply: r }));
  ev.push({ type: 'NEXT' });
  p.holdStill.forEach((passed) => ev.push({ type: 'HOLD_STILL', passed }));
  if (p.breathe) ev.push(task('breatheTheo'));
  ev.push({ type: 'NEXT' }, { type: 'CHOOSE_DOOR', choice: p.door });
  return run(ev);
}

const PATHS: Record<EndingId, Path> = {
  all_clear: { theoDown: true, breathe: true, replies: ['calm', 'stay', 'calm'], holdStill: [true, true, true], door: 'locked' },
  left_on_read: { breathe: true, replies: ['nothing', 'nothing', null], holdStill: [true, true, true], door: 'locked' },
  long_minute: { replies: ['calm', 'stay', 'stay'], holdStill: [true, false, false], door: 'locked' },
  door_held: { barricade: true, replies: ['come', 'stay', 'calm'], holdStill: [true, true, true], door: 'open' },
  open_door: { buzzes: 4, replies: ['stay', 'nothing', 'nothing'], holdStill: [false, false, false], door: 'open' },
};

describe('scene flow', () => {
  it('walks title -> six phases -> ending', () => {
    let s = initialState();
    const seen = [s.scene];
    for (const e of [{ type: 'BEGIN' }, ...Array(5).fill({ type: 'NEXT' }), { type: 'CHOOSE_DOOR', choice: 'locked' }] as StoryEvent[]) {
      s = reduce(s, e);
      seen.push(s.scene);
    }
    expect(seen).toEqual(['title', 'exam', 'code', 'lockdown', 'texts', 'waiting', 'door', 'ending']);
  });

  it('ignores events that do not belong to the current scene', () => {
    const s = run([{ type: 'BEGIN' }]);
    expect(reduce(s, { type: 'CHOOSE_DOOR', choice: 'open' })).toBe(s);
    expect(reduce(s, { type: 'NOISE', source: 'phoneBuzz' })).toBe(s);
    expect(reduce(s, { type: 'REPLY', round: 0, reply: 'calm' })).toBe(s);
    expect(reduce(s, { type: 'HOLD_STILL', passed: true })).toBe(s);
  });

  it('has about 23 tasks across six phases', () => {
    expect(ALL_TASKS.length).toBeGreaterThanOrEqual(22);
    expect(ALL_TASKS.length).toBeLessThanOrEqual(25);
  });
});

describe('tasks and hidden values', () => {
  it('4 bubbles complete the bubbles task', () => {
    const s = run([{ type: 'BEGIN' }, ...[0, 1, 2].map((i) => ({ type: 'FILL_BUBBLE', index: i }) as StoryEvent)]);
    expect(s.tasks.bubbles).toBe(false);
    expect(reduce(s, { type: 'FILL_BUBBLE', index: 5 }).tasks.bubbles).toBe(true);
  });

  it('theoCalm counts pulling him down and breathing with him; either sets helpedClassmate', () => {
    const a = run([...at('lockdown'), task('theoDown')]);
    expect(a.theoCalm).toBe(1);
    expect(a.helpedClassmate).toBe(true);
    const b = run([task('breatheTheo')], { ...a, scene: 'waiting' });
    expect(b.theoCalm).toBe(2);
  });

  it('battery drains one percent per phone check; at zero Zoe is lost', () => {
    let s = run(at('texts'));
    expect(s.battery).toBe(BATTERY_START);
    for (let i = 0; i < BATTERY_START + 3; i++) s = reduce(s, { type: 'PHONE_CHECK' });
    expect(s.battery).toBe(0);
    expect(s.phoneChecks).toBe(BATTERY_START);
    expect(s.zoeLost).toBe(true);
  });

  it('clues come from the test question, the school alert and the 10:52 timing', () => {
    let s = run([...at('texts'), task('testQuestion')]);
    s = run([task('schoolAlert')], { ...s, scene: 'waiting' });
    s = run([task('readTiming')], { ...s, scene: 'door' });
    expect(s.clues).toEqual({ testQuestion: true, schoolAlert: true, timing: true });
  });

  it('the last test text is a clue too, and needs battery', () => {
    const s = run([...at('door'), { type: 'TEST_TEXT' }]);
    expect(s.testTextSent).toBe(true);
    expect(s.clues.testQuestion).toBe(true);
    const dead = run([{ type: 'TEST_TEXT' }], { ...run(at('door')), battery: 0 });
    expect(dead.testTextSent).toBe(false);
  });

  it('texting mom is quiet early and noisy late', () => {
    const early0 = run(at('texts'));
    expect(run([task('textMom')], early0).noise).toBe(early0.noise);
    const late0 = run(at('waiting'));
    const late = run([task('textMom')], late0);
    expect(late.momTexted).toBe(true);
    expect(late.noise - late0.noise).toBe(NOISE_COST.momLate);
  });

  it('three reply rounds, each answered once; timeouts count as silence', () => {
    const s = run([...at('texts'), { type: 'REPLY', round: 0, reply: 'calm' }, { type: 'REPLY', round: 0, reply: 'nothing' }, { type: 'NEXT' }]);
    expect(s.replies).toEqual(['calm', 'nothing', 'nothing']);
    expect(s.zoeTrust).toBe(2 - 1 - 1);
    expect(s.tasks.zoeReplies).toBe(true);
  });

  it('hold-still: failures add noise; passing 2 of 3 completes the task', () => {
    const s0 = run(at('waiting'));
    let s = reduce(s0, { type: 'HOLD_STILL', passed: false });
    expect(s.noise - s0.noise).toBe(NOISE_COST.moved);
    s = reduce(reduce(s, { type: 'HOLD_STILL', passed: true }), { type: 'HOLD_STILL', passed: true });
    expect(s.holdStill).toBe(2);
    expect(s.tasks.holdStill).toBe(true);
  });

  it('whispered choice is recorded once; "maybe" makes noise', () => {
    const s0 = run(at('waiting'));
    const s = run([{ type: 'WHISPER', choice: 'maybe' }, { type: 'WHISPER', choice: 'stay' }], s0);
    expect(s.whisper).toBe('maybe');
    expect(s.noise - s0.noise).toBe(NOISE_COST.whisperMove);
  });

  it('noise is capped and never ends the game', () => {
    let s = run(at('lockdown'));
    for (let i = 0; i < 40; i++) s = reduce(s, { type: 'NOISE', source: 'ringtone' });
    expect(s.noise).toBe(100);
    expect(s.scene).toBe('lockdown');
  });

  it('when the lockdown timer runs out, Ms. Okafor covers the essentials loudly', () => {
    const s = run([...at('lockdown'), { type: 'NEXT' }]);
    expect(s.scene).toBe('texts');
    expect(s.teacherDid.sort()).toEqual(['blinds', 'silencePhone', 'wallByDoor']);
    expect(s.noise).toBe(3 * NOISE_COST.teacherCover);
    expect(s.tasks.lockAndLights).toBe(true);
  });
});

describe('endings', () => {
  for (const id of ENDING_IDS) {
    it(`"${ENDINGS[id].title}" (${id}) is reachable by playing`, () => {
      const s = play(PATHS[id]);
      expect(s.scene).toBe('ending');
      expect(s.ending).toBe(id);
      expect(endingSequence(s).length).toBeGreaterThan(3);
      const ep = epilogue(s);
      expect(ep.length).toBeGreaterThanOrEqual(3);
      expect(ep[0]).toBe(TRUTH);
    });
  }

  it('running the battery to zero leads to Left on Read even with high trust', () => {
    const s = play({ ...PATHS.all_clear, checks: BATTERY_START });
    expect(s.zoeLost).toBe(true);
    expect(s.ending).toBe('left_on_read');
  });

  it('the barricade turns the worst door ending into The Door Held', () => {
    expect(play({ ...PATHS.open_door, barricade: true }).ending).toBe('door_held');
    expect(play(PATHS.open_door).noise).toBeGreaterThanOrEqual(NOISE_HIGH);
  });

  it('every combination of inputs maps to an ending, and all five appear', () => {
    const found = new Set<EndingId>();
    for (let zoeTrust = -3; zoeTrust <= 7; zoeTrust++)
      for (let noise = 0; noise <= 100; noise += 5)
        for (const helpedClassmate of [true, false])
          for (const barricade of [true, false])
            for (const zoeLost of [true, false])
              for (const holdStill of [0, 1, 2, 3])
                for (const choice of ['open', 'locked'] as const) {
                  const e = computeEnding({ zoeTrust, noise, helpedClassmate, zoeLost, holdStill, tasks: { barricade } }, choice);
                  expect(ENDING_IDS).toContain(e);
                  found.add(e);
                }
    expect([...found].sort()).toEqual([...ENDING_IDS].sort());
  });

  it('opening the door always costs something; only a locked door gives everyone-safe', () => {
    for (const helpedClassmate of [true, false])
      for (const noise of [0, 100])
        for (const barricade of [true, false]) {
          const e = computeEnding({ zoeTrust: 5, noise, helpedClassmate, zoeLost: false, holdStill: 3, tasks: { barricade } }, 'open');
          expect(['door_held', 'open_door']).toContain(e);
        }
  });

  it('epilogue reflects clues and the mom text', () => {
    const s = play(PATHS.all_clear);
    const all = { ...s, clues: { testQuestion: true, schoolAlert: true, timing: true }, momTexted: true };
    expect(epilogue(all).join(' ')).toContain('You knew.');
    expect(epilogue(all).join(' ')).toContain('I’m okay');
    expect(epilogue(s).join(' ')).toContain('You just guessed.');
  });

  it('the guidance line is the exact required text', () => {
    expect(GUIDANCE).toBe(
      "In a real lockdown, follow your school's plan and your teacher's instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe.",
    );
  });
});

describe('skip and exit', () => {
  it('skip moves through every phase with neutral defaults and ends locked', () => {
    let s = run([{ type: 'BEGIN' }]);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = reduce(s, { type: 'SKIP' });
      seen.push(s.scene);
    }
    expect(seen).toEqual(['code', 'lockdown', 'texts', 'waiting', 'door', 'ending']);
    expect(s.noise).toBe(0);
    expect(s.replies).toEqual(['stay', 'stay', 'stay']);
    expect(s.finalChoice).toBe('locked');
  });

  it('exit works from every scene and restart resets everything', () => {
    for (const sc of ['exam', 'code', 'lockdown', 'texts', 'waiting', 'door']) {
      const before = run(at(sc));
      const out = reduce(before, { type: 'EXIT' });
      expect(out.scene).toBe('exited');
      expect(out.exitedFrom).toBe(sc);
      expect(reduce(out, { type: 'RESTART' })).toEqual(initialState());
    }
  });
});
