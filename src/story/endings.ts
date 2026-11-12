// Ending content. Told through sound cues, captions, text messages, a walk out
// with your hands raised, and a short epilogue. The person in the hallway is never
// shown, named or explained. Nothing violent is ever on screen.

import { type EndingId, type StoryState, NOISE_HIGH, TRUST_GOOD, cluesFound } from './state';

export const GUIDANCE =
  "In a real lockdown, follow your school's plan and your teacher's instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe.";

export type SoundCue =
  | 'sirenClose'
  | 'footstepsMany'
  | 'footstepsNear'
  | 'footstepsAway'
  | 'keys'
  | 'lockClick'
  | 'doorCreak'
  | 'doorSlam'
  | 'thudOnDoor'
  | 'runAway'
  | 'runningOut'
  | 'bangFar'
  | 'heartbeat'
  | 'handleRattleHard'
  | 'radio'
  | 'drone';

export type Speaker = 'teacher' | 'theo' | 'zoe' | 'pa' | 'door' | 'officer' | 'noah';

export type StageAction = 'policeEnter' | 'openDoorCrack' | 'slamDoor' | 'theoRuns' | 'feetShadows' | 'walkOut' | 'fadeOut';

export interface Beat {
  at: number;
  sound?: SoundCue;
  caption?: string;
  say?: { who: Speaker; text: string; whisper?: boolean };
  text?: string;
  action?: StageAction;
}

export interface EndingInfo {
  id: EndingId;
  number: number;
  title: string;
}

export const ENDINGS: Record<EndingId, EndingInfo> = {
  all_clear: { id: 'all_clear', number: 1, title: 'Everyone Went Home' },
  left_on_read: { id: 'left_on_read', number: 2, title: 'Left on Read' },
  long_minute: { id: 'long_minute', number: 3, title: 'The Long Minute' },
  door_held: { id: 'door_held', number: 4, title: 'The Door Held' },
  open_door: { id: 'open_door', number: 5, title: 'The Open Door' },
};

/** Responders arrive; you walk out with your hands raised (an interactive beat). */
const policeArrive = (t: number): Beat[] => [
  { at: t, sound: 'sirenClose', caption: '[sirens, right outside the windows]' },
  { at: t + 3.5, sound: 'footstepsMany', caption: '[many footsteps in the hall, heavy and fast, all together]' },
  { at: t + 6.5, sound: 'keys', caption: '[keys in the lock]' },
  { at: t + 7.2, say: { who: 'officer', text: "Room 214, police. We're coming in. Keep your hands where we can see them." } },
  { at: t + 10.5, action: 'policeEnter', sound: 'radio', caption: '[the door opens. Flashlights. Radio static.]' },
  { at: t + 11.5, say: { who: 'teacher', text: "It's them. It's okay. Hands up, slowly. Stay together." } },
  { at: t + 13, action: 'walkOut' },
];

export function endingSequence(s: StoryState): Beat[] {
  const ending = s.ending ?? 'all_clear';
  const zoeLine = (t: number, msgs: string[]): Beat[] => (s.zoeLost ? [{ at: t, caption: '[your phone is dead. No way to know.]' }] : msgs.map((m, i) => ({ at: t + i * 1.5, text: m })));
  switch (ending) {
    case 'all_clear':
      return [
        ...policeArrive(0),
        ...zoeLine(15, ['they found me', 'im ok. im ok', 'you stayed with me the whole time']),
        { at: 20, action: 'fadeOut' },
      ];
    case 'left_on_read':
      return [
        ...policeArrive(0),
        { at: 15, caption: s.zoeLost ? '[your phone is dead in your hand]' : '[your phone stays dark]' },
        ...(s.zoeLost ? [] : [{ at: 17, text: 'they got me out' }, { at: 18.5, text: 'i kept checking my phone' }]),
        { at: 21, action: 'fadeOut' },
      ];
    case 'long_minute':
      return [
        { at: 0, sound: 'footstepsNear', caption: '[footsteps in the hall, coming back]' },
        { at: 3.5, action: 'feetShadows', caption: '[they stop. Right outside the door.]' },
        { at: 4, sound: 'heartbeat' },
        { at: 7, sound: 'handleRattleHard', caption: '[the handle presses down. Slowly.]' },
        { at: 10, caption: '[nobody in the room breathes]' },
        { at: 15, sound: 'footstepsAway', caption: '[footsteps, moving away]' },
        ...policeArrive(18),
        ...zoeLine(33, ['they found me. im ok', 'was that your room? the footsteps stopped right there']),
        { at: 37, action: 'fadeOut' },
      ];
    case 'door_held':
      return [
        { at: 0, sound: 'lockClick', caption: s.tasks.barricade ? '[you drag the desk away and turn the lock]' : '[you turn the lock]' },
        { at: 1, sound: 'doorCreak', action: 'openDoorCrack', caption: '[the door opens an inch. Cold air from the hall.]' },
        { at: 2.2, say: { who: 'teacher', text: 'No! Shut it!' } },
        {
          at: 2.5,
          sound: 'doorSlam',
          action: 'slamDoor',
          caption: s.helpedClassmate ? '[Ms. Okafor and Theo throw their weight against the door]' : '[Ms. Okafor throws her weight against the door]',
        },
        { at: 3.3, sound: 'thudOnDoor', caption: '[something heavy hits the other side]' },
        { at: 3.9, caption: '[Ms. Okafor cries out]' },
        { at: 4.6, sound: 'lockClick', caption: '[the lock clicks shut]' },
        { at: 6, sound: 'runAway', caption: '[footsteps, running away down the hall]' },
        { at: 9, sound: 'heartbeat' },
        ...zoeLine(12, ['noah?? i heard a door slam by 214', 'please tell me that wasnt you']),
        ...policeArrive(16),
        { at: 31, action: 'fadeOut' },
      ];
    case 'open_door':
      return [
        { at: 0, sound: 'lockClick', caption: '[you turn the lock]' },
        { at: 1, sound: 'doorCreak', action: 'openDoorCrack', caption: '[the door swings open. The hall is dark.]' },
        { at: 2.2, sound: 'runningOut', action: 'theoRuns', caption: '[someone pushes past you. Theo.]' },
        { at: 3.0, say: { who: 'teacher', text: 'Theo, no!' } },
        { at: 5.0, sound: 'doorSlam', action: 'slamDoor', caption: '[Ms. Okafor slams the door and locks it]' },
        { at: 7, caption: "[Theo's footsteps, fading down the hall]" },
        { at: 10.5, sound: 'bangFar', caption: '[a muffled bang, far down the hall]' },
        { at: 11.5, sound: 'heartbeat' },
        { at: 15, caption: '[silence]' },
        ...zoeLine(17, ['what was that', 'noah is everyone ok']),
        ...policeArrive(21),
        { at: 36, action: 'fadeOut' },
      ];
  }
}

/** The authored truth, revealed in every epilogue. */
export const TRUTH = 'Zoe never left the supply closet by the east stairs. The voice at the door was not hers.';

export function epilogue(s: StoryState): string[] {
  const ending = s.ending ?? 'all_clear';
  const loud = s.noise >= NOISE_HIGH;
  const trusted = s.zoeTrust >= TRUST_GOOD && !s.zoeLost;
  const clues = cluesFound(s);
  const certainty =
    clues >= 3
      ? 'You had worked it out: the closet she named, the alert on Ms. Okafor’s phone, the 10:52 text. You knew.'
      : clues >= 1
        ? 'You had a piece of it. The rest was a guess.'
        : 'You never found out how anyone could have known. You just guessed.';
  const mom = s.momTexted
    ? 'Your mom was at the fence by the buses. She had read "I’m okay" forty times.'
    : 'Your mom was at the fence by the buses. She had called eleven times.';
  const kept = s.finalChoice === 'locked';
  switch (ending) {
    case 'all_clear':
      return [
        TRUTH,
        kept ? certainty : '',
        'Officers cleared the second floor at 11:26 AM. Room 214 walked out in a single line, hands open.',
        'Theo held on to your sleeve all the way to the parking lot. Neither of you ever mentioned it.',
        "Zoe found you by the buses. She didn't say anything about the text. She just stood close enough that your shoulders touched.",
        mom,
      ].filter(Boolean);
    case 'left_on_read':
      return [
        TRUTH,
        certainty,
        'Room 214 was cleared at 11:26 AM. Nobody in it was hurt.',
        s.zoeLost
          ? 'Your phone died at 10:5-something. Zoe kept texting into nothing for half an hour.'
          : 'Zoe was found in the supply closet eleven minutes later. She had been alone in the dark for almost an hour.',
        'The last real thing you ever said to her that morning was "ur gonna need it more." She says it’s fine. She sits at a different table now.',
        mom,
      ];
    case 'long_minute':
      return [
        TRUTH,
        certainty,
        'The footsteps stood outside Room 214 for almost a minute. Everyone inside heard them stop.',
        ...(loud ? ["Something in the room had been heard. It didn't matter in the end. It almost did."] : []),
        ...(s.helpedClassmate ? [] : ['Theo shook for an hour afterwards. On the bus he sat alone. You meant to sit with him, and you didn’t.']),
        'Everyone in Room 214 went home that night. Not everyone slept.',
      ];
    case 'door_held':
      return [
        TRUTH,
        `Ms. Okafor got the door shut again${s.helpedClassmate ? ", Theo's shoulder next to hers" : ''}${s.tasks.barricade ? ', in the seconds the desk had bought' : ''}. Her wrist broke in two places holding it.`,
        'Officers cleared Room 214 at 11:26 AM. No one else in the room was hurt.',
        trusted
          ? "Zoe was found safe in the closet. When she saw you, she didn't let go for a long time."
          : 'Zoe was found safe in the closet. She asked who opened the door. You told her the truth.',
        'Ms. Okafor came back after Thanksgiving with a purple cast. She never said it was your fault. She never had to.',
      ];
    case 'open_door':
      return [
        TRUTH,
        'Theo ran when it opened. He was hurt in the east stairwell. He spent nine days in the hospital, and he is going to be okay.',
        'Officers cleared the second floor at 11:26 AM.',
        'You think about the lock every day. Ms. Okafor says the only person to blame is the one who was in that hallway. Some days you believe her.',
      ];
  }
}
