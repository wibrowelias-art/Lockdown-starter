// Ending content. All told through sound cues, captions, text messages and a
// short epilogue. The person in the hallway is never shown or described.

import { type EndingId, type StoryState, NOISE_HIGH, TRUST_GOOD } from './state';

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
  | 'radio';

export type Speaker = 'teacher' | 'theo' | 'zoe' | 'pa' | 'door' | 'officer';

export type StageAction = 'policeEnter' | 'openDoorCrack' | 'slamDoor' | 'theoRuns' | 'fadeOut';

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

const policeArrive = (t: number): Beat[] => [
  { at: t, sound: 'sirenClose', caption: '[sirens, right outside the windows]' },
  { at: t + 3.5, sound: 'footstepsMany', caption: '[many footsteps in the hall, heavy and fast, all together]' },
  { at: t + 6.5, sound: 'keys', caption: '[keys in the lock]' },
  { at: t + 7.2, say: { who: 'officer', text: "Room 214, police. We're coming in. Keep your hands where we can see them." } },
  { at: t + 10.5, action: 'policeEnter', sound: 'radio', caption: '[the door opens. Flashlights. Radio static.]' },
  { at: t + 11.5, say: { who: 'teacher', text: "It's them. It's okay. Hands up, slowly. Stay together." } },
];

export function endingSequence(s: StoryState): Beat[] {
  const ending = s.ending ?? 'all_clear';
  switch (ending) {
    case 'all_clear':
      return [
        ...policeArrive(0),
        { at: 15, text: 'they found me' },
        { at: 16.5, text: 'im ok. im ok' },
        { at: 18, text: 'you stayed with me the whole time' },
        ...(s.gaveEraser ? [{ at: 19.5, text: 'pudding cup is still on me' }] : []),
        { at: 22, action: 'fadeOut' as const },
      ];

    case 'left_on_read':
      return [
        ...policeArrive(0),
        { at: 15, caption: '[your phone stays dark]' },
        { at: 18, text: 'they got me out' },
        { at: 19.5, text: 'i kept checking my phone' },
        { at: 21, text: 'its fine. i know you were scared too' },
        { at: 24, action: 'fadeOut' },
      ];

    case 'long_minute':
      return [
        { at: 0, sound: 'footstepsNear', caption: '[footsteps in the hall, coming back]' },
        { at: 3.5, caption: '[they stop. Right outside the door.]' },
        { at: 4, sound: 'heartbeat' },
        { at: 7, sound: 'handleRattleHard', caption: '[the handle, harder this time]' },
        { at: 10, caption: '[nobody in the room breathes]' },
        { at: 15, sound: 'footstepsAway', caption: '[footsteps, moving away]' },
        ...policeArrive(18),
        { at: 32, text: 'they found me. im ok' },
        { at: 33.5, text: 'was that your room? the footsteps stopped right there' },
        { at: 36, action: 'fadeOut' },
      ];

    case 'door_held':
      return [
        { at: 0, sound: 'lockClick', caption: '[you turn the lock]' },
        { at: 1, sound: 'doorCreak', action: 'openDoorCrack', caption: '[the door opens an inch. Cold air from the hall.]' },
        { at: 2.2, say: { who: 'teacher', text: 'No! Shut it!' } },
        {
          at: 2.5,
          sound: 'doorSlam',
          action: 'slamDoor',
          caption: s.helpedClassmate
            ? '[Ms. Okafor and Theo throw their weight against the door]'
            : '[Ms. Okafor throws her weight against the door]',
        },
        { at: 3.3, sound: 'thudOnDoor', caption: '[something heavy hits the other side]' },
        { at: 3.9, caption: '[Ms. Okafor cries out]' },
        { at: 4.6, sound: 'lockClick', caption: '[the lock clicks shut]' },
        { at: 6, sound: 'runAway', caption: '[footsteps, running away down the hall]' },
        { at: 9, sound: 'heartbeat' },
        { at: 12, sound: 'sirenClose', caption: '[sirens, close now]' },
        { at: 14, text: 'noah?? i heard a door slam by 214' },
        { at: 15.5, text: 'please tell me that wasnt you' },
        { at: 18, sound: 'keys', caption: '[keys in the lock]' },
        { at: 18.6, say: { who: 'officer', text: "Room 214, police. We're coming in." } },
        { at: 21, action: 'policeEnter', sound: 'radio' },
        { at: 24, action: 'fadeOut' },
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
        { at: 18, sound: 'sirenClose', caption: '[sirens, close now]' },
        { at: 20, text: 'what was that' },
        { at: 21.5, text: 'noah is everyone ok' },
        { at: 24, sound: 'keys', caption: '[keys in the lock]' },
        { at: 24.6, say: { who: 'officer', text: "Room 214, police. We're coming in." } },
        { at: 27, action: 'policeEnter', sound: 'radio' },
        { at: 29, action: 'fadeOut' },
      ];
  }
}

export function epilogue(s: StoryState): string[] {
  const ending = s.ending ?? 'all_clear';
  const loud = s.noise >= NOISE_HIGH;
  const trusted = s.zoeTrust >= TRUST_GOOD;
  switch (ending) {
    case 'all_clear':
      return [
        'Officers cleared the second floor at 11:26 AM.',
        'Room 214 walked out in a single line, hands open, past lockers still hanging open.',
        'Theo held on to your sleeve all the way to the parking lot. Neither of you ever mentioned it.',
        "Zoe found you by the buses. She didn't say anything. She just stood close enough that your shoulders touched.",
        'Everyone in Room 214 went home that night.',
      ];
    case 'left_on_read':
      return [
        'Room 214 was cleared at 11:26 AM. Nobody in it was hurt.',
        'Zoe was found in the supply closet eleven minutes later. She had been alone in the dark for almost an hour.',
        'She sent you nine messages that morning. You read them all on the bus home.',
        ...(s.helpedClassmate ? [] : ["Theo didn't talk on the bus. You didn't either."]),
        "She says it's fine. She says it like she means it. She sits at a different table now.",
      ];
    case 'long_minute':
      return [
        'The footsteps stood outside Room 214 for almost a minute. Everyone inside heard them stop.',
        ...(loud ? ["Something in the room had been heard. It didn't matter in the end. It almost did."] : []),
        ...(s.helpedClassmate
          ? []
          : ["Theo shook for an hour afterwards. On the bus he sat alone. You meant to sit with him, and you didn't."]),
        'Officers cleared the second floor at 11:26 AM. Zoe was found safe in the closet.',
        'Everyone in Room 214 went home that night. Not everyone slept.',
      ];
    case 'door_held':
      return [
        "It wasn't Zoe at the door.",
        `Ms. Okafor got it shut again${s.helpedClassmate ? ", Theo's shoulder next to hers" : ''}. Her wrist broke in two places holding it.`,
        'Officers cleared Room 214 at 11:26 AM. No one else in the room was hurt.',
        trusted
          ? "Zoe was found safe in the closet. When she saw you, she didn't let go for a long time."
          : 'Zoe was found safe in the closet. She asked who opened the door. You told her the truth.',
        'Ms. Okafor came back after Thanksgiving with a purple cast. She never said it was your fault. She never had to.',
      ];
    case 'open_door':
      return [
        "It wasn't Zoe at the door.",
        'Theo ran when it opened. He was hurt in the east stairwell. He spent nine days in the hospital, and he is going to be okay.',
        'Officers cleared the second floor at 11:26 AM. Zoe was found safe in the closet.',
        'You think about the lock every day. Ms. Okafor says the only person to blame is the one who was in that hallway. Some days you believe her.',
      ];
  }
}
