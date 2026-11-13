// Scene scripts (v2). Each phase runs as a cancellable async script on sim time.
// Skip/Exit cancel the running script; each phase starts by putting the room in the
// state it needs, so any phase can be entered directly.

import * as THREE from 'three';
import type { Script } from './clock';
import type { Game } from './game';
import { DOOR, HUDDLE, ROOM, SEAT } from './world';
import { NOISE_HIGH, type ReplyKind } from '../story/state';
import { type Beat, endingSequence } from '../story/endings';
import type { Who } from '../ui/ui';

async function line(g: Game, s: Script, who: Who, text: string, opts: { whisper?: boolean; dur?: number; gap?: number } = {}) {
  const d = g.say(who, text, opts);
  await s.wait(d + (opts.gap ?? 0.3));
}

const min = (h: number, m: number) => h * 60 + m;

// ---------------------------------------------------------------- 1 · the final (exam)

export async function examScene(g: Game, s: Script): Promise<void> {
  const start = g.clock.time;
  g.prepareExam();
  g.setTime(min(10, 42));
  g.ui.timestamp('Tuesday · 10:42 AM');
  g.audio.roomTone(true);
  g.audio.fluorescentHum(true);
  g.ui.fade(0, 2);
  g.ui.showTitleCard('TUESDAY · 10:42 AM', 'Room 214 — Biology final', 4);
  g.updateChecklist();
  s.spawn(async (t) => {
    for (;;) {
      await t.wait(1);
      g.audio.clockTick();
      g.setTime(min(10, 42) + Math.min(1.9, (g.clock.time - start) / 70));
    }
  });
  const { teacher, theo } = g.world;
  await s.wait(2.5);
  await line(g, s, 'teacher', 'Ten more minutes. Eyes on your own paper.');
  g.ui.hint(g.touch ? 'Drag to look around. Tap a bubble to answer.' : g.input.noLock ? 'Drag to look. Click a bubble to answer.' : 'Move the mouse to look. Click a bubble to answer.');
  await s.wait(5);
  g.ui.hint(null);
  await line(g, s, 'noah', "Zoe's still not back.", { whisper: true });
  await s.wait(4);

  // Hana's moment
  const hana = g.world.people.get('hana')!;
  hana.headYaw = -0.9;
  await line(g, s, 'hana', 'Psst. Malik. Forty-three. Was it "enzymes"?', { whisper: true });
  await line(g, s, 'malik', "Don't.", { whisper: true });
  teacher.headYaw = 0.4;
  await line(g, s, 'teacher', 'Hana. Eyes down.');
  hana.headYaw = 0;
  teacher.headYaw = 0;
  await s.wait(4);

  // Theo, by the lockers
  theo.headYaw = 0.9;
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
  if (picked === 'help') await line(g, s, 'theo', "You're a legend.", { whisper: true });
  else if (picked === 'tease') await line(g, s, 'theo', 'Wow. Okay, Ms. Okafor Junior.', { whisper: true });
  else await line(g, s, 'theo', '...Mitochondria. Powerhouse. Can’t go wrong.', { whisper: true });
  theo.headYaw = 0;
  await s.wait(5);

  // Ms. Okafor walks the aisle beside you: hold still (teaches stillness, harmlessly)
  teacher.setPose('stand');
  const walking = g.walk(teacher, [
    [1.92, -3.0],
    [1.92, 2.9],
    [1.92, -3.0],
    [-0.6, -3.85],
  ], 0.75);
  await s.wait(5);
  g.ui.caption('[Ms. Okafor is walking the aisle, right beside you]', 3);
  const still = await g.holdStill(s, 6, 'aisle');
  if (still) g.task('holdStillAisle');
  else await line(g, s, 'teacher', 'Eyes down, Noah.', { whisper: true });
  await walking;
  teacher.faceTowards(0, 2);

  // look under the desks for Zoe's bag (if not already)
  if (!g.store.state.tasks.zoeBackpack) g.ui.hint("Zoe's seat is empty. Look under her desk, to your left.");
  await s.until(() => g.store.state.tasks.zoeBackpack, 25);
  g.ui.hint(null);
  if (g.store.state.tasks.zoeBackpack) {
    await line(g, s, 'noah', "Her bag's still here. She took the hall pass like ten minutes ago.", { whisper: true });
    await line(g, s, 'noah', "Last thing I texted her: 'ur gonna need it more.' Nice, Noah.", { whisper: true });
  }
  const end = start + 140;
  await s.until(() => g.clock.time >= end || (g.store.state.tasks.bubbles && g.store.state.tasks.zoeBackpack && g.clock.time >= start + 70), Math.max(0, end - g.clock.time));
  await s.wait(1);
  g.dispatch({ type: 'NEXT' });
}

// ---------------------------------------------------------------- 2 · the code

export async function codeScene(g: Game, s: Script): Promise<void> {
  g.prepareCode();
  g.setTime(min(10, 44));
  g.ui.timestamp('Tuesday · 10:44 AM');
  const { teacher, theo } = g.world;
  await s.wait(1);
  g.audio.bang(1.1);
  g.ui.caption('[a sharp, loud hit somewhere in the building]');
  g.everyoneLooksAtDoor();
  theo.headYaw = 0.9;
  await s.wait(0.8);
  await line(g, s, 'theo', 'What was that?', { whisper: true });
  await line(g, s, 'noah', 'Somebody slammed a locker.', { whisper: true });
  await s.wait(1.2);
  g.audio.bang(1.4);
  g.ui.caption('[another hit. Louder.]');
  g.everyoneLooksAtDoor();
  await s.wait(1);
  await line(g, s, 'theo', "That's not a locker.", { whisper: true });
  await s.wait(0.8);
  g.audio.paChime();
  g.flags.paWindow = true;
  g.ui.caption('[the PA chimes]');
  g.everyoneLooksAt(0.9, -4.5);
  teacher.headPitch = 0.4;
  await s.wait(1.2);
  await line(g, s, 'pa', 'Attention, all teachers. The science fair has been moved to the gym. I repeat. The science fair has been moved to the gym.', { dur: 7 });
  g.flags.paWindow = false;
  teacher.headPitch = 0;
  await line(g, s, 'theo', 'Science fair? That was last month.', { whisper: true });
  await line(g, s, 'teacher', "It's a code.");
  // arms up, "Everybody down!" -> drop down (C)
  teacher.setPose('armsUp');
  g.flags.dropWindow = true;
  g.ui.hint(g.touch ? 'DROP: tap Crouch!' : 'DROP: press C!');
  g.ui.setMovement(true, g.touch);
  g.say('teacher', 'Everybody down!', { dur: 2 });
  g.audio.footstepsMany();
  for (const name of ['ines', 'jo', 'hana', 'malik', 'sam']) {
    const p = g.world.people.get(name)!;
    p.setPose('crouch');
  }
  await s.until(() => g.store.state.tasks.dropDown, 3.5);
  g.flags.dropWindow = false;
  g.ui.hint(null);
  teacher.setPose('stand');
  await line(g, s, 'teacher', 'Away from the door. Away from the door. Now!');
  g.dispatch({ type: 'NEXT' });
}

// ---------------------------------------------------------------- 3 · lockdown (75 s, free order)

export async function lockdownScene(g: Game, s: Script): Promise<void> {
  const w = g.world;
  const { teacher, theo } = w;
  if (w.lightsOn === false) w.setLights(true);
  g.setTime(min(10, 45));
  g.ui.timestamp('Tuesday · 10:45 AM');
  // classmates scramble to the door wall; Theo freezes by the lockers
  for (const [i, name] of ['ines', 'jo', 'hana', 'malik', 'sam'].entries()) g.clock.after(0.2 + i * 0.3, () => void g.sendToWall(name, 1.5));
  theo.setPose('crouch');
  void g.walk(theo, [[3.65, 1.5]], 1.4, 'crouch').then(() => {
    theo.faceTowards(DOOR.x, DOOR.z);
    theo.tremble = 1;
  });
  g.flags.theoFrozen = true;
  teacher.setPose('stand');
  void g.walk(teacher, [[DOOR.x - 0.75, -3.95]], 1.8).then(() => teacher.faceTowards(DOOR.x, DOOR.z));
  g.beginLockdownControl();
  g.ui.hint(g.touch ? 'Get to the wall beside the door! Joystick to move.' : 'Get to the wall beside the door! WASD to move, Shift to hurry (loud).');
  const t0 = g.clock.time;
  await s.wait(1.5);
  await line(g, s, 'teacher', 'Lights off. Phones silent. Not one sound.');

  // the 8-second scramble
  s.spawn(async (t) => {
    await t.until(() => g.store.state.tasks.wallByDoor, 8);
    g.ui.hint(null);
    if (!g.store.state.tasks.wallByDoor) await line(g, t, 'teacher', 'Noah! Over here, by the wall! Now!', { whisper: true });
    else g.ui.hint('Free order now: check the poster list. 75 seconds.');
    await t.wait(5);
    g.ui.hint(null);
  });

  // Ms. Okafor locks the door, then kills the lights (slower if you're in her way)
  s.spawn(async (t) => {
    await t.wait(9);
    const inWay = () => Math.hypot(g.player.x - (DOOR.x - 0.6), g.player.z - (DOOR.z + 0.5)) < 0.75;
    if (inWay()) {
      await line(g, t, 'teacher', 'Noah, move!', { whisper: true });
      g.dispatch({ type: 'NOISE', source: 'teacherHindered' });
      await t.wait(3);
    }
    g.audio.lockClick();
    w.door.knob.rotation.z = Math.PI / 2;
    g.ui.caption('[Ms. Okafor locks the door]');
    await t.wait(2);
    if (inWay()) {
      await line(g, t, 'teacher', 'Noah. The switch. Move.', { whisper: true });
      g.dispatch({ type: 'NOISE', source: 'teacherHindered' });
      await t.wait(3);
    }
    g.turnLightsOff();
    g.task('lockAndLights');
    await t.wait(1);
    await g.sendToWall('teacher', 1.2);
  });

  // your phone is in your pocket, and not on silent
  s.spawn(async (t) => {
    await t.wait(11);
    const texts = [
      ['Mom', 'school sent an alert. are you ok??'],
      ['Mom', 'Noah answer me'],
      ['Mom', 'please'],
    ];
    let i = 0;
    while (!g.store.state.tasks.silencePhone) {
      g.phoneBuzz(texts[i % texts.length]);
      i++;
      await t.wait(10);
    }
  });

  // a phone rings in someone's backpack: find it by sound within 10 s
  s.spawn(async (t) => {
    await t.wait(17);
    g.startRinging('malik');
    const found = await t.until(() => g.store.state.tasks.ringingPhone, 10);
    if (!found) {
      g.stopRinging();
      g.dispatch({ type: 'NOISE', source: 'ringtone' });
      g.dispatch({ type: 'MISS', task: 'ringingPhone' });
      g.ui.caption('[it rang out. Everyone heard it.]', 3);
      await line(g, t, 'malik', 'Sorry. Sorry. That was mine.', { whisper: true });
    }
  });

  const done = await s.until(() => g.lockdownPlayerTasksDone(), Math.max(0, 75 - (g.clock.time - t0)));
  g.endLockdownControl();
  const st = g.store.state;
  if (!done) {
    if (!st.tasks.lockAndLights) {
      g.audio.lockClick();
      g.turnLightsOff();
    }
    if (!st.tasks.wallByDoor) {
      await line(g, s, 'teacher', 'Noah. Here. Now.', { whisper: true });
      await g.pullPlayerToWall();
    }
    if (!st.tasks.silencePhone) {
      await line(g, s, 'teacher', 'Your phone. Silent. Give it.', { whisper: true });
      g.ui.phone.silenced = true;
      g.ui.phone.renderRing();
    }
    if (!st.tasks.blinds) {
      g.ui.caption('[Ms. Okafor yanks the blinds shut]');
      g.audio.rustle();
      w.setBlinds(1);
    }
    if (!st.tasks.theoDown) {
      await line(g, s, 'teacher', 'Theo. Theo, look at me. Come here.', { whisper: true });
      await g.sendToWall('theo', 1.2);
    }
    if (g.flags.ringing) g.stopRinging();
  }
  g.dispatch({ type: 'NEXT' });
}

// ---------------------------------------------------------------- 4 · Zoe (the phone)

const ROUNDS: { kind: ReplyKind; text: string }[][] = [
  [
    { kind: 'calm', text: "I'm here. Sorry about this morning. You're not alone." },
    { kind: 'stay', text: "Stay there. Don't open for ANYONE." },
    { kind: 'come', text: "Come to 214. We'll let you in." },
    { kind: 'nothing', text: '[Put the phone face down]' },
  ],
  [
    { kind: 'stay', text: "Don't move. Quiet is safer than fast." },
    { kind: 'calm', text: "I'm right here. In for four, out for four. With me." },
    { kind: 'come', text: 'Run for it. Then come to 214.' },
    { kind: 'nothing', text: "[Don't answer]" },
  ],
  [
    { kind: 'calm', text: 'Remember the fire drill in your bio presentation? You just kept talking. Bravest person I know.' },
    { kind: 'stay', text: "Stay quiet. I'll text you the second it's safe." },
    { kind: 'come', text: 'If it goes quiet, run to 214.' },
    { kind: 'nothing', text: '[Leave it on read]' },
  ],
];
const ZOE_AFTER: Record<ReplyKind, string[]>[] = [
  { calm: ['its ok. i was mean first lol', 'ok. breathing'], stay: ['ok. not moving'], come: ['i cant', 'hes out there'], nothing: ['noah?'] },
  { stay: ['ok. staying'], calm: ['in for four', 'out for four'], come: ['i cant. my legs wont move', 'im staying'], nothing: ['please say something'] },
  { calm: ['lol. ok. that helped'], stay: ['ok. going quiet'], come: ['no. im staying here'], nothing: ['...'] },
];
const ZOE_BEFORE: string[][] = [
  ['someone is in the hallway', 'im hiding in the supply closet', 'noah im scared'],
  ['hes walking up and down. i can hear his shoes', 'should i run for the stairs??'],
  ['noah say something normal. please'],
];

async function zoeTypes(g: Game, s: Script, msgs: string[], time?: string): Promise<void> {
  for (const [i, m] of msgs.entries()) {
    if (g.ui.phone.isOpen) g.ui.phone.typing(true);
    await s.wait(0.9 + m.length * 0.025);
    g.ui.phone.addMsg('zoe', m, { time: i === 0 ? time : undefined });
    g.audio.phoneTap();
  }
}

/** The phone lights up in your pocket; you choose when to look (each look costs 1%). */
async function waitForLook(g: Game, s: Script, timeout: number): Promise<boolean> {
  if (g.ui.phone.isOpen) return true;
  g.ui.phone.flash();
  g.ui.setPhoneButton(true, true);
  g.ui.caption('[your phone lights up in your pocket. No sound.]', 2.5);
  g.ui.hint(g.touch ? 'Phone: check it (battery!)' : 'Tab: check your phone (each look costs battery)');
  const ok = await s.until(() => g.ui.phone.isOpen || g.store.state.battery <= 0, timeout);
  g.ui.hint(null);
  return ok && g.ui.phone.isOpen;
}

async function round(g: Game, s: Script, r: number): Promise<void> {
  let pick: ReplyKind | 'ask' | null = null;
  const opts: { label: string; value: ReplyKind | 'ask'; testid: string }[] = ROUNDS[r].map((o) => ({ label: o.text, value: o.kind, testid: `reply-${o.kind}` }));
  if (r < 2 && !g.store.state.tasks.testQuestion) opts.splice(3, 0, { label: 'Ask: which closet?', value: 'ask', testid: 'reply-ask' });
  const offer = () => g.ui.phone.setReplies(opts.filter((o) => o.value !== 'ask' || !g.store.state.tasks.testQuestion), (v) => (pick = v));
  offer();
  const deadline = g.clock.time + 22;
  for (;;) {
    await s.until(() => pick !== null, Math.max(0, deadline - g.clock.time));
    if (pick !== 'ask') break;
    pick = null;
    g.ui.phone.addMsg('me', 'which closet exactly?');
    await zoeTypes(g, s, ['the mops one by the east stairs. why']);
    g.task('testQuestion');
    g.ui.caption('[the east stairs. Two halls away from 214.]', 3);
    offer();
  }
  g.ui.phone.clearReplies();
  const chosen: ReplyKind = (pick as ReplyKind | null) ?? 'nothing';
  g.dispatch({ type: 'REPLY', round: r, reply: chosen });
  if (chosen === 'nothing') g.ui.caption(r === 0 ? '[you turn the screen against your chest]' : "[you don't answer]");
  else {
    g.audio.phoneTap();
    g.ui.phone.addMsg('me', ROUNDS[r].find((o) => o.kind === chosen)!.text, { time: r === 0 ? '10:47' : undefined });
  }
  await zoeTypes(g, s, ZOE_AFTER[r][chosen]);
}

export async function textsScene(g: Game, s: Script): Promise<void> {
  g.prepareAfterLockdown();
  g.setTime(min(10, 46));
  g.ui.timestamp('Tuesday · 10:46 AM');
  g.audio.breathing(0.6, 0.27);
  const w = g.world;
  // lights-out lines from the reference
  await line(g, s, 'theo', 'This is a drill... right?', { whisper: true });
  await line(g, s, 'teacher', "We don't run drills during finals.", { whisper: true });
  await line(g, s, 'noah', 'Where did Zoe go?', { whisper: true });
  await line(g, s, 'ines', 'She took the hall pass. Like, ten minutes ago.', { whisper: true });
  await s.wait(1.5);

  // mom keeps texting; you can answer her on the Mom tab (quietly, now)
  g.ui.phone.addMsg('mom', 'school sent an alert. are you ok??', { silent: true, thread: 'mom', time: '10:45' });
  g.ui.phone.addMsg('mom', 'Noah please answer', { silent: true, thread: 'mom' });
  const momReply = () => {
    if (g.store.state.tasks.textMom) return;
    g.ui.phone.addMsg('meMom', "We're in lockdown. I'm okay. Can't talk.");
    g.task('textMom');
  };
  (window as unknown as { __momReply?: () => void }).__momReply = momReply;

  for (let r = 0; r < 3; r++) {
    const looked = await waitForLook(g, s, 14);
    if (!looked) {
      // you never looked: Zoe texts into the dark
      g.dispatch({ type: 'REPLY', round: r, reply: 'nothing' });
      await s.wait(3);
      continue;
    }
    g.ui.phone.showThread('zoe');
    g.ui.phone.setCanClose(false);
    showMomButton(g, momReply);
    await zoeTypes(g, s, ZOE_BEFORE[r], r === 0 ? '10:46' : undefined);
    if (r === 0) {
      await line(g, s, 'noah', "She's in the supply closet. Alone.", { whisper: true });
      await line(g, s, 'theo', "Tell her to stay put. Don't move. Don't even breathe.", { whisper: true });
    }
    if (r === 1) {
      // footsteps pass while the screen is lit: cover the glow
      g.flags.danger = true;
      g.audio.footsteps({ count: 9, interval: 0.6, panFrom: 0.1, panTo: 0.9, gainFrom: 0.3, gainTo: 0.9, cue: 'footstepsHall' });
      g.ui.caption('[footsteps in the hall. Your screen is bright.]', 3);
      g.ui.hint(g.touch ? 'Hold the Hold button to cover the glow' : 'Hold Space to cover the glow with your sleeve');
      s.spawn(async (t) => {
        await t.wait(3.5);
        if (g.flags.danger && g.ui.phone.isOpen && !g.ui.phone.glowCovered) {
          g.dispatch({ type: 'NOISE', source: 'glow' });
          g.ui.caption('[light leaks under the door from your screen]', 2.5);
        }
        await t.wait(2.5);
        g.flags.danger = false;
        g.ui.hint(null);
      });
    }
    await round(g, s, r);
    await s.wait(1.2);
    // lower the phone to keep the glow down
    g.ui.phone.setCanClose(true);
    g.closePhone();
    if (r < 2) {
      g.ui.caption('[you lower the phone]', 2);
      await s.wait(r === 0 ? 7 : 6);
    }
  }
  w.theo.tremble = 0.6;
  await s.wait(2);
  g.dispatch({ type: 'NEXT' });
}

function showMomButton(g: Game, reply: () => void): void {
  // the Mom tab carries one quiet reply
  const mom = g.ui.phone;
  if (g.store.state.tasks.textMom) return;
  const btn = document.createElement('button');
  btn.className = 'ph-reply';
  btn.dataset.testid = 'reply-mom';
  btn.textContent = "Mom: We're in lockdown. I'm okay. Can't talk.";
  btn.addEventListener('click', () => {
    reply();
    btn.remove();
  });
  const chats = mom.root.querySelectorAll('.ph-chat');
  const momChat = chats[1] as HTMLElement | undefined;
  if (momChat && !momChat.querySelector('[data-testid=reply-mom]')) momChat.append(btn);
}

// ---------------------------------------------------------------- 5 · the wait

async function approachAndStop(g: Game, s: Script): Promise<void> {
  const w = g.world;
  g.audio.footsteps({ count: 8, interval: 0.6, panFrom: 0.05, panTo: 0.5, gainFrom: 0.3, gainTo: 1, cue: 'footstepsNear' });
  g.ui.caption('[footsteps, coming closer]', 3);
  await s.wait(4.6);
  // silence first
  g.audio.silence(2);
  g.flags.danger = true;
  void g.tweens.run(1.6, (k) => w.setFeet(DOOR.x - 0.9 + k * 0.9));
  g.ui.caption('[they stop. Right outside.]', 3);
  g.everyoneLooksAtDoor();
}

export async function waitingScene(g: Game, s: Script): Promise<void> {
  g.prepareAfterLockdown();
  g.setTime(min(10, 49));
  g.ui.timestamp('Tuesday · 10:49 AM');
  g.audio.breathing(0.8, 0.3);
  g.allowCrouchedMovement();
  const w = g.world;
  const { theo, teacher } = w;
  s.spawn(async (t) => {
    for (;;) {
      await t.wait(1);
      g.audio.clockTick();
    }
  });
  await line(g, s, 'ines', "Somebody's out there.", { whisper: true });
  await line(g, s, 'theo', "He's checking doors.", { whisper: true });
  await s.wait(3);
  // fake-out: pipes
  g.audio.pipeKnock();
  g.ui.caption('[a clank in the pipes]', 2.5);
  g.everyoneLooksAt(ROOM.minX, 0);
  await s.wait(4);

  // hold still #1: feet in the light strip, the handle presses down slowly
  await approachAndStop(g, s);
  g.audio.drone(0.6);
  s.spawn(async (t) => {
    await t.wait(2);
    await g.tweens.run(2.2, (k) => (w.handlePress = k));
    await t.wait(0.8);
    w.handlePress = 0;
    g.audio.handleRattle(false);
    w.rattleHandle(0.8);
  });
  g.dispatch({ type: 'HOLD_STILL', passed: await g.holdStill(s, 6.5, 'handle') });
  g.flags.danger = false;
  g.audio.footsteps({ count: 7, interval: 0.65, panFrom: 0.5, panTo: 0.95, gainFrom: 0.9, gainTo: 0.1, cue: 'footstepsAway' });
  void g.tweens.run(1.5, (k) => w.setFeet(DOOR.x + k * 1.2)).then(() => w.setFeet(null));
  g.audio.drone(0.2);
  await s.wait(3);

  // Theo panics: breathe with him (hold in time with the ring)
  theo.tremble = 1.6;
  g.audio.breathing(1.2, 0.6);
  g.ui.caption('[Theo is breathing fast and loud]');
  await line(g, s, 'theo', "I can't... I can't breathe right.", { whisper: true });
  g.startBreathing();
  g.ui.hint(g.touch ? 'Breathe with Theo: hold while the dashed ring grows, let go while it shrinks.' : 'Breathe with Theo: hold Space while the dashed ring grows, release while it shrinks.');
  const calm = await s.until(() => g.breath.cycles >= 3, 26);
  g.stopBreathing();
  g.ui.hint(null);
  g.audio.breathing(0.7, 0.26);
  if (calm) {
    g.task('breatheTheo');
    theo.tremble = 0.3;
    await line(g, s, 'theo', '...Okay. Okay. Thanks.', { whisper: true });
  } else {
    g.dispatch({ type: 'NOISE', source: 'theoPanic' });
    await line(g, s, 'teacher', 'Theo. Look at me. Breathe.', { whisper: true });
    theo.tremble = 0.8;
  }

  // the school alert on Ms. Okafor's phone
  g.flags.alertOn = true;
  w.setAlert(true);
  teacher.headPitch = -0.5;
  g.ui.caption("[Ms. Okafor's phone lights up in her hand]", 3);
  g.ui.hint('Read it over her shoulder (look at her phone, E)');
  await s.until(() => g.store.state.tasks.schoolAlert, 12);
  g.ui.hint(null);
  g.flags.alertOn = false;
  w.setAlert(false);
  teacher.headPitch = 0;
  await s.wait(2);

  // fake-out: a far door slam
  g.audio.farSlam();
  g.ui.caption('[a door slams, far away]', 2.5);
  await s.wait(3);

  // hold still #2: footsteps stop outside... and move on
  await approachAndStop(g, s);
  g.dispatch({ type: 'HOLD_STILL', passed: await g.holdStill(s, 5.5, 'pause') });
  g.flags.danger = false;
  g.audio.footsteps({ count: 7, interval: 0.6, panFrom: 0.5, panTo: 0.0, gainFrom: 0.8, gainTo: 0.1, cue: 'footstepsAway' });
  void g.tweens.run(1.5, (k) => w.setFeet(DOOR.x - k * 1.2)).then(() => w.setFeet(null));
  await s.wait(3);

  // Sam's whispered idea
  const sam = w.people.get('sam')!;
  sam.headYaw = 0.8;
  await line(g, s, 'sam', "We could go out the window. It's only the second floor.", { whisper: true });
  let pick: 'stay' | 'maybe' | 'silent' | null = null;
  g.ui.choices(
    [
      { label: '"No. We stay down."', value: 'stay' as const, testid: 'whisper-stay' },
      { label: '"...Maybe."', value: 'maybe' as const, testid: 'whisper-maybe' },
      { label: '[Say nothing]', value: 'silent' as const, testid: 'whisper-silent' },
    ],
    (v) => (pick = v),
    'Sam whispers to you',
  );
  await s.until(() => pick !== null, 10);
  g.ui.clearChoices();
  g.dispatch({ type: 'WHISPER', choice: pick ?? 'silent' });
  if (pick === 'maybe') {
    sam.setPose('crouch');
    await line(g, s, 'teacher', 'Sam. Down.', { whisper: true });
    sam.setPose('floor');
  } else if (pick === 'stay') await line(g, s, 'sam', '...Yeah. Okay.', { whisper: true });
  sam.headYaw = 0;
  await s.wait(2);

  // mom calls if you never answered her
  if (!g.store.state.momTexted) {
    g.audio.phoneBuzz();
    g.ui.phone.flash();
    g.ui.caption('[your phone vibrates against the tile: Mom calling]', 3);
    g.dispatch({ type: 'NOISE', source: 'momCall' });
    await s.wait(3);
  }

  // hold still #3: the handle rattles, hard (longer if the room has been loud)
  await approachAndStop(g, s);
  const loud = g.store.state.noise >= NOISE_HIGH;
  s.spawn(async (t) => {
    await t.wait(2);
    g.audio.handleRattle(true);
    w.rattleHandle(loud ? 2.6 : 1.4);
    if (loud) {
      await t.wait(2.5);
      g.audio.handleRattle(true);
      w.rattleHandle(1.4);
    }
  });
  g.dispatch({ type: 'HOLD_STILL', passed: await g.holdStill(s, loud ? 8 : 6, 'rattle') });
  g.flags.danger = false;
  g.audio.footsteps({ count: 7, interval: 0.6, panFrom: 0.5, panTo: 0.95, gainFrom: 0.8, gainTo: 0.1, cue: 'footstepsAway' });
  void g.tweens.run(1.5, (k) => w.setFeet(DOOR.x + k * 1.2)).then(() => w.setFeet(null));
  g.audio.drone(0);
  await s.wait(3);

  // sirens: pink and blue through the blinds. Stay down.
  g.audio.sirens(0.35, 5);
  w.setSiren(1);
  await line(g, s, 'ines', 'Sirens.', { whisper: true });
  await line(g, s, 'theo', 'The cops are here!');
  theo.setPose('crouch');
  await line(g, s, 'teacher', 'Outside. Not up here. Stay down.', { whisper: true });
  theo.setPose('floor');
  g.flags.stayDownWindow = true;
  g.ui.hint('Stay down.');
  const before = g.player.travelled.stand + g.player.travelled.crouch;
  const stood = await s.until(() => g.player.stance === 'stand' || g.player.travelled.stand + g.player.travelled.crouch - before > 0.4, 8);
  g.ui.hint(null);
  g.flags.stayDownWindow = false;
  if (stood) {
    g.dispatch({ type: 'NOISE', source: 'stoodUp' });
    await line(g, s, 'teacher', 'Down!', { whisper: true });
    g.player.stance = 'crouch';
  } else g.task('stayDown');
  if (g.store.state.zoeTrust >= 1 && !g.store.state.zoeLost) {
    g.ui.phone.addMsg('zoe', 'i can hear sirens', { silent: true });
    g.ui.phone.flash();
    g.ui.caption('[your phone lights up: Zoe]', 2);
  }
  await s.wait(2);
  g.dispatch({ type: 'NEXT' });
}

// ---------------------------------------------------------------- 6 · the knock

export async function doorScene(g: Game, s: Script): Promise<void> {
  g.prepareAfterLockdown();
  g.setTime(min(10, 52));
  g.ui.timestamp('Tuesday · 10:52 AM');
  const w = g.world;
  const { teacher, theo } = w;
  w.setSiren(1);
  g.audio.sirens(0.3, 2);
  g.allowCrouchedMovement();
  await s.wait(2);
  g.audio.knock(3, 1.1);
  w.rattleHandle(0.25);
  g.ui.caption('[knocking at the door]');
  g.everyoneLooksAtDoor();
  await s.wait(1);
  await line(g, s, 'door', 'Noah?');
  await line(g, s, 'door', "Noah, it's me.");
  await line(g, s, 'door', 'Please.');
  await line(g, s, 'door', 'Let me in.');
  await line(g, s, 'noah', "That's Zoe.", { whisper: true });
  teacher.setPose('stand');
  teacher.faceTowards(g.player.x, g.player.z);
  await line(g, s, 'noah', "That's her voice!");
  await line(g, s, 'teacher', 'Sit down. We do not open that.');
  g.audio.knock(5, 1.3);
  await line(g, s, 'door', "Please! He's coming back!");
  await line(g, s, 'noah', "She's right there!");
  teacher.setPose('crouch');

  // 10:52: the text
  if (g.store.state.battery > 0) {
    g.ui.phone.addMsg('zoe', "still in the closet. who's knocking??", { time: '10:52 AM', tag: "DON'T OPEN", silent: true });
    g.ui.phone.flash();
    g.ui.setPhoneButton(true, true);
    g.ui.caption('[your phone lights up: Zoe, 10:52]', 3);
    g.ui.hint(g.touch ? 'Phone: read it' : 'Tab: read it');
    const read = await s.until(() => g.ui.phone.isOpen, 12);
    g.ui.hint(null);
    if (read) {
      g.ui.phone.showThread('zoe');
      g.ui.phone.banner('Zoe', "still in the closet. who's knocking??", '10:52', "DON'T OPEN");
      g.task('readTiming');
      await s.wait(3);
      g.closePhone();
    }
  } else g.ui.caption('[your phone is dead. You will never see what Zoe sent at 10:52.]', 4);
  theo.headYaw = 0.6;
  await line(g, s, 'theo', "If Zoe's in the closet... who's at the door?", { whisper: true });
  await line(g, s, 'noah', 'Or... somebody has her phone.', { whisper: true });
  await line(g, s, 'door', 'Noah... please.');
  g.audio.thud();
  g.audio.knock(2, 1.6);
  g.audio.drone(0.8);
  g.audio.heartbeat(true, 104, 1);
  g.endLockdownControl();

  let choice: 'open' | 'locked' | null = null;
  for (;;) {
    let c: 'open' | 'locked' | 'text' | null = null;
    const canText = !g.store.state.testTextSent && g.store.state.battery > 0;
    g.ui.doorChoice((v) => (c = v), canText);
    const pleas = ['Noah. Please.', "I know you're in there.", 'Why aren’t you opening?'];
    const plead = s.spawn(async (t) => {
      for (let i = 0; ; i++) {
        await t.wait(7);
        if (c) return;
        g.audio.knock(3, 1);
        g.say('door', pleas[i % pleas.length]);
      }
    });
    void plead;
    await s.until(() => c !== null);
    g.ui.clearDoorChoice();
    if (c === 'text') {
      if (g.openPhone('chat', false)) {
        g.ui.phone.showThread('zoe');
        g.ui.phone.addMsg('me', 'what did i text you this morning?');
        g.dispatch({ type: 'TEST_TEXT' });
        g.audio.knock(4, 1.2);
        await line(g, s, 'door', 'Noah, why aren’t you opening? Please!');
        await zoeTypes(g, s, ['"ur gonna need it more." still mad btw', 'noah WHO is at the door']);
        await s.wait(2.5);
        g.ui.phone.setCanClose(true);
        g.closePhone();
      }
      continue;
    }
    choice = c;
    break;
  }
  g.audio.heartbeat(false);
  if (choice === 'open') {
    g.ui.caption(g.store.state.tasks.barricade ? '[you get up and drag the desk from the door]' : '[you get up and go to the door]');
    g.say('teacher', 'Noah, no!', { whisper: true });
    await g.walkPlayerToDoor();
  } else {
    g.ui.caption("[you stay down. Ms. Okafor keeps her eyes on the door.]");
    await s.wait(2);
  }
  g.dispatch({ type: 'CHOOSE_DOOR', choice: choice! });
}

// ---------------------------------------------------------------- endings

export async function endingScene(g: Game, s: Script): Promise<void> {
  const st = g.store.state;
  if (st.finalChoice !== 'open') g.prepareAfterLockdown();
  g.endLockdownControl();
  g.ui.clearDoorChoice();
  g.audio.drone(0.3);
  g.setTime(min(10, 54));
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
    if (g.store.state.battery > 0) {
      if (!g.ui.phone.isOpen) g.openPhone('chat', true, true);
      g.ui.phone.showThread('zoe');
      g.ui.phone.addMsg('zoe', b.text);
      g.ui.phone.flash();
    }
  }
  if (b.action) await g.stageAction(b.action, s);
}

export const SEAT_POS = new THREE.Vector3(SEAT.x, 1.1, SEAT.z);
export const HUDDLE_SPOTS = HUDDLE;
