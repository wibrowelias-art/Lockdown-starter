// Scene scripts. Each runs as a cancellable async script on sim time.
// Skip/Exit cancel the running script; each scene starts by making sure the
// room is in the state it needs, so any scene can be entered directly.

import type { Script } from './clock';
import type { Game } from './game';
import { AISLE_X, COLS, DOOR, HUDDLE, PLAYER_DESK, ROWS, CHAIR_OFFSET, SAFE_Z } from './world';
import { NOISE_HIGH, type ReplyKind } from '../story/state';
import { endingSequence, epilogue, type Beat } from '../story/endings';
import type { Who } from '../ui/ui';

async function line(g: Game, s: Script, who: Who, text: string, opts: { whisper?: boolean; dur?: number; gap?: number } = {}) {
  const d = g.say(who, text, opts);
  await s.wait(d + (opts.gap ?? 0.35));
}

function minutes(h: number, m: number): number {
  return h * 60 + m;
}

// ---------------------------------------------------------------- scene 1

export async function examScene(g: Game, s: Script): Promise<void> {
  const start = g.clock.time;
  g.prepareExam();
  g.setTime(minutes(10, 42));
  g.ui.timestamp('Tuesday · 10:42 AM · Room 214');
  g.audio.roomTone(true);
  g.audio.fluorescentHum(true);
  g.ui.fade(0, 2.5);
  g.ui.hint(g.touch ? 'Biology final. Drag to look around. Tap a bubble to answer.' : 'Biology final. Drag to look around. Click a bubble to answer.');
  g.updateExamObjectives();
  s.spawn(async (t) => {
    for (;;) {
      await t.wait(1);
      g.audio.clockTick();
      g.setTime(minutes(10, 42) + Math.min(2.5, (g.clock.time - start) / 36));
    }
  });

  const { teacher, theo, zoe } = g.world;
  await s.wait(2.5);
  teacher.headYaw = 0;
  await line(g, s, 'teacher', 'Ten more minutes. Eyes on your own paper.');
  await s.wait(3);
  g.ui.hint(null);
  await s.wait(2);

  // Theo, red sweater, one desk over.
  theo.headYaw = 0.9;
  theo.headPitch = -0.1;
  await line(g, s, 'theo', 'Psst. Noah. Forty-four. Mitochondria or ribosome?', { whisper: true });
  let picked: string | null = null;
  g.ui.choices(
    [
      { label: '"Ribosome. Now hush."', value: 'help', testid: 'theo-help' },
      { label: '"Eyes on your own paper, Theo."', value: 'tease', testid: 'theo-tease' },
    ],
    (v) => (picked = v),
  );
  await s.until(() => picked !== null, 9);
  g.ui.clearChoices();
  if (picked === 'help') await line(g, s, 'theo', "You're a legend. I owe you.", { whisper: true });
  else if (picked === 'tease') await line(g, s, 'theo', 'Wow. Okay, Ms. Okafor Junior.', { whisper: true });
  else await line(g, s, 'theo', "...Mitochondria. Powerhouse of the cell. Can't go wrong.", { whisper: true });
  teacher.headYaw = -0.25;
  await line(g, s, 'teacher', 'Theo.');
  await line(g, s, 'theo', 'Sorry, Ms. Okafor.');
  theo.headYaw = 0;
  theo.headPitch = -0.35;
  teacher.headYaw = 0;
  await s.wait(4);

  // Zoe, sitting in front of you.
  zoe.setPose('turnBack');
  zoe.headYaw = 1.1;
  await line(g, s, 'zoe', 'Noah. Eraser? Mine just smears everything.', { whisper: true });
  g.flags.eraserAsked = true;
  g.updateExamObjectives();
  const gave = await s.until(() => g.store.state.gaveEraser, 14);
  g.flags.eraserAsked = false;
  g.updateExamObjectives();
  if (gave) await line(g, s, 'zoe', "You're the best. I owe you a pudding cup.", { whisper: true });
  else await line(g, s, 'zoe', "Never mind. I'll live with the smudges.", { whisper: true });
  zoe.setPose('sit');
  zoe.headYaw = 0;
  await s.wait(5);

  // Hall pass.
  zoe.setPose('handUp');
  await line(g, s, 'zoe', 'Ms. Okafor? Can I get the hall pass? Two minutes, I swear.');
  zoe.setPose('sit');
  await line(g, s, 'teacher', 'Two minutes. Take the pass.');
  zoe.setPose('stand');
  await g.walk(zoe, [
    [AISLE_X, ROWS[0] + CHAIR_OFFSET],
    [AISLE_X, -3.15],
    [DOOR.x - 0.6, DOOR.z + 0.05],
  ]);
  zoe.faceTowards(g.player.x, g.player.z);
  await line(g, s, 'zoe', 'Finish strong, Noah.', { whisper: true });
  g.audio.doorOpenClose();
  await g.tweens.run(0.6, (k) => g.world.setDoorAngle(k * 1.2));
  await g.walk(zoe, [[DOOR.x + 0.9, DOOR.z]], 1.3);
  zoe.root.visible = false;
  await g.tweens.run(0.8, (k) => g.world.setDoorAngle((1 - k) * 1.2));

  // The rest of the exam, quiet. Ends ~90 s in, or shortly after you finish.
  const end = start + 88;
  await s.until(() => g.clock.time >= end || (g.store.state.bubbles.length >= 8 && g.clock.time >= start + 62), Math.max(0, end - g.clock.time));
  if (g.store.state.bubbles.length >= 8) await line(g, s, 'theo', 'Show-off.', { whisper: true });
  await s.wait(1.5);
  g.dispatch({ type: 'EXAM_END' });
}

// ---------------------------------------------------------------- scene 2

export async function codeScene(g: Game, s: Script): Promise<void> {
  g.prepareCode();
  g.setTime(minutes(10, 44));
  g.ui.timestamp('Tuesday · 10:44 AM');
  g.ui.objectives(null);
  const { teacher, theo } = g.world;
  await s.wait(1);

  g.audio.bang(1);
  g.ui.caption('[a muffled bang from the hallway]');
  g.everyoneLooksAtDoor();
  await s.wait(1.3);
  await line(g, s, 'theo', 'Somebody slammed a locker.', { whisper: true });
  await s.wait(1.6);
  g.audio.bang(1.25);
  g.ui.caption('[another bang. Closer.]');
  g.everyoneLooksAtDoor();
  await s.wait(1.6);
  g.audio.paChime();
  g.ui.caption('[the PA chimes]');
  await s.wait(1.4);
  await line(g, s, 'pa', 'Attention, all teachers. The science fair has been moved to the gym. I repeat: the science fair has been moved to the gym.', { dur: 6.5 });
  await line(g, s, 'theo', 'Science fair? That was last month.', { whisper: true });
  await line(g, s, 'teacher', "It's a code. Everybody down.");

  // Ms. Okafor locks the door and covers the window; the class moves to the back wall.
  s.spawn(async (t) => {
    teacher.setPose('stand');
    await g.walk(teacher, [[DOOR.x - 0.55, -3.75], [DOOR.x - 0.5, DOOR.z]], 1.6);
    teacher.faceTowards(DOOR.x, DOOR.z);
    await t.wait(0.4);
    g.audio.lockClick();
    g.world.door.knob.rotation.x = Math.PI / 2;
    g.ui.caption('[Ms. Okafor locks the door]');
    await t.wait(0.8);
    g.world.door.cover.visible = true;
    g.audio.rustle();
    await t.wait(0.6);
    await g.walk(teacher, [[DOOR.x - 0.75, 1.9], [HUDDLE.teacher[0], HUDDLE.teacher[1]]], 1.3, 'crouch');
    teacher.faceTowards(DOOR.x, DOOR.z);
  });
  g.moveClassToBackWall();
  await line(g, s, 'teacher', 'Away from the door. Back wall. Lights off. Phones silent. Now.');

  // Player control: the lockdown steps are yours to do.
  g.beginLockdownControl();
  theo.tremble = 1;
  theo.headYaw = -0.6;
  g.flags.theoFrozen = true;
  g.ui.hint(g.touch ? 'Crouch button to get low. Joystick to move. Phone button for your phone.' : 'C to get low. WASD / arrows to move. P for your phone. Moving while standing is loud.');
  s.spawn(async (t) => {
    await t.wait(8);
    g.ui.hint(null);
  });

  // Your phone is in your pocket, and it is not on silent.
  s.spawn(async (t) => {
    await t.wait(9);
    const texts = [
      ['Mom', 'the school just sent an alert. are you ok??'],
      ['Mom', 'Noah answer me'],
      ['Dad', 'Call when you can. Love you.'],
      ['Mom', 'please'],
    ];
    let i = 0;
    while (!g.store.state.steps.phoneSilenced) {
      g.phoneBuzz(texts[i % texts.length]);
      i++;
      await t.wait(9);
    }
  });

  s.spawn(async (t) => {
    await t.wait(6);
    if (!g.store.state.theoHelp.pulledDown) {
      g.ui.caption("[Theo hasn't moved. He's staring at the door.]", 5);
      g.updateCodeObjectives();
    }
    await t.wait(14);
    if (!g.store.state.steps.lightsOff) await line(g, t, 'teacher', 'Noah. The lights. The switch by the door.', { whisper: true });
    await t.wait(12);
    if (!g.store.state.steps.crouched) await line(g, t, 'teacher', 'Get low, Noah. Get down.', { whisper: true });
    await t.wait(10);
    if (!g.store.state.steps.awayFromDoor) await line(g, t, 'teacher', 'Back here. Away from the door.', { whisper: true });
  });

  const done = await s.until(() => g.allLockdownStepsDone(), 75);
  g.endLockdownControl();
  const st = g.store.state;
  if (!done) {
    if (!st.steps.lightsOff) {
      g.ui.caption('[Ms. Okafor scrambles to the switch]');
      g.turnLightsOff();
      await line(g, s, 'teacher', "I've got the lights.", { whisper: true });
    }
    if (!st.steps.phoneSilenced) {
      await line(g, s, 'teacher', 'Noah. Your phone. Give it to me.', { whisper: true });
      g.ui.phone.silenced = true;
      g.ui.phone.renderRing();
      g.ui.caption('[she switches it to silent and hands it back]');
    }
    if (!st.steps.awayFromDoor || !st.steps.crouched) {
      await line(g, s, 'teacher', 'Down. Back wall. Now.', { whisper: true });
      await g.pullPlayerToBackWall();
    }
  }
  if (!g.store.state.theoHelp.pulledDown) {
    await line(g, s, 'teacher', 'Theo. Theo, look at me. Down. With me.', { whisper: true });
    g.audio.chairScrape();
    g.ui.caption("[Theo's chair scrapes the floor]");
    await g.sendTheoToBackWall();
  } else {
    await line(g, s, 'teacher', 'Good. Nobody makes a sound.', { whisper: true });
  }
  await s.wait(1.5);
  g.dispatch({ type: 'CODE_END' });
}

// ---------------------------------------------------------------- scene 3

const ROUND1: { kind: ReplyKind; text: string }[] = [
  { kind: 'calm', text: "I'm here. Breathe slow. You're not alone." },
  { kind: 'stay', text: "Stay in the closet. Stay quiet. Don't open it for anyone." },
  { kind: 'come', text: "Come to 214. We'll let you in." },
  { kind: 'nothing', text: '[Put the phone face down]' },
];
const ROUND2: { kind: ReplyKind; text: string }[] = [
  { kind: 'stay', text: "Don't move. Quiet is safer than fast. Stay put." },
  { kind: 'calm', text: "I'm right here. In for four, out for four. With me." },
  { kind: 'come', text: 'Run for it. Then come to 214.' },
  { kind: 'nothing', text: "[Don't answer]" },
];
const ZOE_AFTER: Record<ReplyKind, string[]>[] = [
  {
    calm: ['ok', 'ok. breathing', 'it smells like bleach in here lol'],
    stay: ['ok. not moving', 'the door doesnt lock from in here'],
    come: ['i cant', 'hes out there. i can hear him walking'],
    nothing: ['noah?', 'please'],
  },
  {
    stay: ['ok. staying', 'phone on 6%. going quiet'],
    calm: ['in for four', 'out for four', 'ok'],
    come: ['i cant. my legs wont move', 'im staying'],
    nothing: ['please say something'],
  },
];

async function zoeTexts(g: Game, s: Script, msgs: string[], delay = 0): Promise<void> {
  if (delay) await s.wait(delay);
  for (const m of msgs) {
    g.ui.phone.typing(true);
    await s.wait(1.1 + m.length * 0.03);
    g.ui.phone.addMsg('zoe', m);
    g.audio.phoneTap();
    await s.wait(0.5);
  }
}

async function replyRound(g: Game, s: Script, round: number, opts: { kind: ReplyKind; text: string }[]): Promise<ReplyKind> {
  let pick: ReplyKind | null = null;
  g.ui.phone.setReplies(
    opts.map((o) => ({ label: o.text, value: o.kind, testid: `reply-${o.kind}` })),
    (v) => (pick = v),
  );
  await s.until(() => pick !== null, 25);
  g.ui.phone.clearReplies();
  const chosen: ReplyKind = pick ?? 'nothing';
  g.dispatch({ type: 'REPLY', round, reply: chosen });
  if (chosen === 'nothing') {
    g.ui.caption(round === 0 ? '[you turn the screen against your chest]' : "[you don't answer]");
  } else {
    g.audio.phoneTap();
    g.ui.phone.addMsg('me', opts.find((o) => o.kind === chosen)!.text);
  }
  return chosen;
}

export async function textsScene(g: Game, s: Script): Promise<void> {
  g.prepareLockdown();
  g.setTime(minutes(10, 47));
  g.ui.timestamp('Tuesday · 10:47 AM');
  g.audio.breathing(0.6, 0.27);
  await s.wait(2.5);
  g.ui.phone.flash();
  g.ui.caption('[your phone lights up in your pocket. No sound.]');
  g.ui.setPhoneButton(true, true);
  g.ui.hint(g.touch ? 'Your phone lit up. Tap Phone.' : 'Your phone lit up. Press P or click Phone.');
  await s.until(() => g.ui.phone.isOpen, 5);
  g.ui.hint(null);
  g.openPhone('chat', false);
  await zoeTexts(g, s, ['someone is in the hallway', 'i heard it. it was so loud', 'im in the supply closet by the stairs. the one with the mops', 'noah im scared']);
  const r1 = await replyRound(g, s, 0, ROUND1);
  await zoeTexts(g, s, ZOE_AFTER[0][r1], r1 === 'nothing' ? 4 : 1);
  await s.wait(2.5);
  await zoeTexts(g, s, ['footsteps. close', 'should i run for the stairs?? the exit is RIGHT there']);
  const r2 = await replyRound(g, s, 1, ROUND2);
  await zoeTexts(g, s, ZOE_AFTER[1][r2], r2 === 'nothing' ? 4 : 1);
  await s.wait(2.5);
  g.closePhone();
  g.ui.caption('[you lower the phone. The screen dims.]');
  await s.wait(1.5);
  g.dispatch({ type: 'TEXTS_END' });
}

// ---------------------------------------------------------------- scene 4

export async function waitingScene(g: Game, s: Script): Promise<void> {
  g.prepareLockdown();
  g.setTime(minutes(10, 51));
  g.ui.timestamp('Tuesday · 10:51 AM');
  g.audio.breathing(0.8, 0.3);
  g.allowCrouchedMovement();
  s.spawn(async (t) => {
    for (;;) {
      await t.wait(1);
      g.audio.clockTick();
    }
  });
  const { theo } = g.world;
  g.ui.caption('[silence. Just breathing.]', 4);
  await s.wait(5);
  g.audio.sirens(0.18, 6);
  g.world.setSiren(0.4);
  g.ui.caption('[sirens, far away. Red and blue through the blinds.]', 4.5);
  await s.wait(5);
  g.audio.footsteps({ count: 10, interval: 0.6, panFrom: 0.1, panTo: 0.8, gainFrom: 0.15, gainTo: 0.7, cue: 'footstepsHall' });
  g.ui.caption('[footsteps in the hall]');
  g.everyoneLooksAtDoor();
  await s.wait(4.5);
  await line(g, s, 'theo', "He's checking doors.", { whisper: true });
  await s.wait(1.5);

  const loud = g.store.state.noise >= NOISE_HIGH;
  g.world.rattleHandle(loud ? 2.4 : 1.1);
  g.audio.handleRattle(loud);
  g.audio.heartbeat(true, 96, 0.8);
  g.ui.caption(loud ? '[the door handle rattles, hard. Then a long pause outside.]' : '[the door handle rattles once]', 4.5);
  await s.wait(loud ? 7 : 4);
  g.audio.footsteps({ count: 8, interval: 0.65, panFrom: 0.8, panTo: 0.2, gainFrom: 0.6, gainTo: 0.1, cue: 'footstepsAway' });
  g.ui.caption('[the footsteps move on]');
  await s.wait(3.5);
  g.audio.heartbeat(false);

  // Theo starts to panic.
  theo.tremble = 1.6;
  g.audio.breathing(1.2, 0.6);
  g.ui.caption('[Theo is breathing fast and loud]');
  await line(g, s, 'theo', "I can't... I can't breathe right.", { whisper: true });
  g.startBreathing();
  g.ui.hint(g.touch ? 'Breathe with Theo: hold the button to breathe in, let go to breathe out.' : 'Breathe with Theo: hold Space (or the button) to breathe in, release to breathe out.');
  const ok = await s.until(() => g.breath.cycles >= 3, 24);
  g.stopBreathing();
  g.ui.hint(null);
  g.audio.breathing(0.7, 0.26);
  if (ok) {
    g.dispatch({ type: 'HELP_THEO', how: 'breathed' });
    theo.tremble = 0.3;
    await line(g, s, 'theo', '...Okay. Okay. Thanks.', { whisper: true });
  } else {
    g.dispatch({ type: 'NOISE', source: 'theoPanic' });
    await line(g, s, 'teacher', 'Theo. Look at me. Breathe.', { whisper: true });
    theo.tremble = 0.8;
  }
  g.audio.sirens(0.45, 5);
  g.world.setSiren(1);
  g.ui.caption('[the sirens are closer now]');
  if (g.store.state.zoeTrust >= 1) {
    await s.wait(2);
    g.ui.phone.addMsg('zoe', 'i can hear sirens');
    g.ui.phone.flash();
    g.ui.caption('[your phone lights up: Zoe]');
  }
  await s.wait(4);
  g.dispatch({ type: 'WAIT_END' });
}

// ---------------------------------------------------------------- scene 5

export async function doorScene(g: Game, s: Script): Promise<void> {
  g.prepareLockdown();
  g.setTime(minutes(10, 58));
  g.ui.timestamp('Tuesday · 10:58 AM');
  g.world.setSiren(1);
  g.audio.sirens(0.35, 2);
  g.allowCrouchedMovement();
  await s.wait(2.5);
  g.audio.knock(3, 1);
  g.world.rattleHandle(0.25);
  g.ui.caption('[three knocks on the door]');
  g.everyoneLooksAtDoor();
  await s.wait(1.2);
  await line(g, s, 'door', "Noah? It's me. Let me in.");
  await s.wait(0.6);
  await line(g, s, 'teacher', 'We do not open that.', { whisper: true });
  await s.wait(1);
  g.ui.phone.addMsg('zoe', g.store.state.toldZoeToCome ? "i didnt leave. still in the closet. who's knocking??" : "still in the closet. who's knocking??");
  g.openPhone('chat', true);
  g.ui.phone.flash();
  g.ui.caption('[your phone lights up: Zoe]');
  await s.wait(3.5);
  g.audio.knock(5, 1.25);
  g.ui.caption('[knocking again, faster]');
  await line(g, s, 'door', "Please. Please, it's me.");
  g.closePhone();
  g.audio.heartbeat(true, 100, 0.9);

  let choice: 'open' | 'locked' | null = null;
  g.ui.doorChoice((c) => (choice = c));
  s.spawn(async (t) => {
    const pleas = ['Noah. Please.', "I know you're in there.", 'Please. Just open it.'];
    for (let i = 0; ; i++) {
      await t.wait(7);
      if (choice) return;
      g.audio.knock(3, 1);
      g.ui.caption('[knocking]');
      g.say('door', pleas[i % pleas.length]);
    }
  });
  await s.until(() => choice !== null);
  g.ui.clearDoorChoice();
  g.endLockdownControl();
  if (choice === 'open') {
    g.ui.caption('[you get up and go to the door]');
    g.say('teacher', 'Noah, no!', { whisper: true });
    await g.walkPlayerToDoor();
  } else {
    g.ui.caption("[you don't move. Ms. Okafor keeps her eyes on the door.]");
    await s.wait(2);
  }
  g.dispatch({ type: 'CHOOSE_DOOR', choice: choice! });
}

// ---------------------------------------------------------------- endings

export async function endingScene(g: Game, s: Script): Promise<void> {
  const st = g.store.state;
  if (st.finalChoice !== 'open') g.prepareLockdown();
  g.endLockdownControl();
  g.ui.clearDoorChoice();
  g.setTime(minutes(11, 1));
  g.ui.timestamp('Tuesday · 11:0' + (st.finalChoice === 'open' ? '0' : '1') + ' AM');
  const beats = endingSequence(st);
  let t0 = 0;
  for (const b of beats) {
    await s.wait(Math.max(0, b.at - t0));
    t0 = b.at;
    await playBeat(g, s, b);
  }
  await s.wait(2.5);
  g.showEndingScreen();
}

async function playBeat(g: Game, s: Script, b: Beat): Promise<void> {
  if (b.sound) g.audio.cue(b.sound);
  if (b.caption) g.ui.caption(b.caption, 4.5);
  if (b.say) g.say(b.say.who, b.say.text, { whisper: b.say.whisper });
  if (b.text) {
    if (!g.ui.phone.isOpen) g.openPhone('chat', true);
    g.ui.phone.addMsg('zoe', b.text);
    g.ui.phone.flash();
  }
  if (b.action) await g.stageAction(b.action, s);
}

export { epilogue };
export const SEAT = { x: PLAYER_DESK.x, z: PLAYER_DESK.z + 0.42 };
export const SAFE = { z: SAFE_Z, x: COLS[2] };
