# Room 214 (working title: Lockdown): browser demo

A short first-person, choice-driven story. You are Noah, sitting a Biology final in
Room 214 when the school goes into lockdown. Your friend Zoe is out with the hall pass,
your classmate Theo freezes, and someone knocks on the door.

> **Content notice:** school lockdown scenario; may be distressing. The person in the
> hallway is never shown or described. There is no gore, no weapons, and no player
> violence. Consequences come through sound, text messages and a short text epilogue.
> **Exit** (top-right) and **Skip scene** are always on screen.

This is the low-poly test build (Vite + TypeScript + Three.js + Web Audio). A realistic
Unreal version only happens if the demo works. See `docs/DESIGN.md` and `docs/PROMPT.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build on http://localhost:4173
```

URL option: `?speed=4` runs story time 4x faster (used by the automated tests).

## Controls

| | Keyboard / mouse | Touch |
|---|---|---|
| Look | drag the view (or Left/Right arrows) | drag the view |
| Use something | click it, or look at it and press **E** | tap it, or the **Use** button |
| Move | WASD / arrows (Up/Down) | joystick (bottom-left) |
| Crouch / stand | **C** | **Crouch** button |
| Phone | **P** or the **Phone** button | **Phone** button |
| Breathe with Theo | hold **Space** or the button | hold the button |
| Mute | **M** or *Sound* button | *Sound* button |

## The story (all original)

1. **Exam** (~90 s, Tuesday 10:42 AM). You're seated with your hands and answer sheet. Fill in bubbles 41-48.
   Ms. Okafor (yellow sweater): *"Ten more minutes. Eyes on your own paper."* Theo (red sweater, next desk)
   whispers for help on #44. Zoe (in front of you) borrows your eraser, then takes the hall pass.
2. **The code.** Two muffled bangs. Theo: *"Somebody slammed a locker."* The PA announces the science fair has
   moved to the gym. Theo: *"Science fair? That was last month."* Ms. Okafor: *"It's a code. Everybody down."*
   You do the steps yourself: get away from the door, crouch, turn off the lights (switch by the door),
   silence your phone (it keeps buzzing until you do). Theo is frozen in his seat; you can get him down.
3. **Texts with Zoe.** She's hiding in the supply closet: *"noah im scared"*. Two rounds of 4 replies
   (calm her / tell her to stay / tell her to come / say nothing).
4. **Waiting.** Silence, breathing, sirens with red/blue light through the blinds, *"He's checking doors,"*
   the handle rattles. Theo starts to panic; you can breathe with him.
5. **The door.** Knocking: *"Noah? It's me. Let me in."* Ms. Okafor: *"We do not open that."*
   Zoe texts: *"still in the closet. who's knocking??"* Choose **OPEN THE DOOR** or **KEEP IT LOCKED**.

### Hidden values

| Value | Raised by | Lowered by |
|---|---|---|
| `zoeTrust` | eraser +1; replies: calm +2, stay +1, come +1 (round 2 "run for it" +0) | saying nothing -1 per round |
| `noise` (0-100, shown as a meter) | phone buzz +12, chair scrape +9, each step while standing +1.5, Theo panicking +12, Ms. Okafor having to do a step for you +6..8 | nothing; it never causes a game over |
| `helpedClassmate` | getting Theo down (scene 2) **or** breathing with him (scene 4) | |

### Endings (`src/story/state.ts` → `computeEnding`)

| # | Ending | Condition | Outcome |
|---|---|---|---|
| 1 | Everyone Went Home | locked, trust ≥ 2, noise < 45, Theo helped | everyone safe |
| 2 | Left on Read | locked, trust < 2 | everyone safe; Zoe went through it alone |
| 3 | The Long Minute | locked, trust ≥ 2, noise ≥ 45 **or** Theo not helped | footsteps stop at your door; safe but shaken |
| 4 | The Door Held | open, and (Theo helped **or** noise < 45) | the door choice costs Ms. Okafor a broken wrist |
| 5 | The Open Door | open, Theo not helped, noise ≥ 45 | Theo runs out and is hurt off-screen (recovers) |

Every ending finishes with: *"In a real lockdown, follow your school's plan and your teacher's
instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe."*

## Code map

```
src/story/state.ts     pure state machine: scenes, hidden values, endings (unit-tested)
src/story/endings.ts   ending sequences (sound cues, captions, texts) and epilogues
src/game/director.ts   the five scene scripts + ending playback (cancellable, on sim time)
src/game/game.ts       glue: renderer, loop, interaction, scene preparation, test hooks
src/game/world.ts      Room 214: layout, furniture, door, switch, blinds, lights, sirens
src/game/people.ts     low-poly characters with simple poses
src/game/player.ts     first-person controller (seated / standing / crouched, collisions, footsteps)
src/game/input.ts      keyboard, mouse-drag look, touch
src/audio/audio.ts     all sound synthesised with Web Audio (no samples)
src/ui/                overlays: notice, subtitles, objectives, noise meter, phone, choices, endings
tests/unit/            Vitest: state machine, every ending reachable
tests/e2e/             Playwright: one browser playthrough per ending, exit/skip, mobile touch
docs/screenshots/      screenshots captured by the Playwright runs
```

## Tests

```bash
npm test                 # Vitest: state machine
npm run e2e              # Playwright (builds, serves on :4173, runs desktop + mobile projects)
```

The Playwright runs use `?speed=12..14`, click real UI buttons, click 3D objects on the canvas
(after turning the camera to them), and move with the real player controller.

## Not done / known limits

- Dialogue is subtitles plus a quiet synthesised murmur; there are no recorded or TTS voices.
- Sound design and pacing have only been checked by automated runs (which cues fired), not by ear.
- Performance has only been measured in headless Chromium with software WebGL (~13 fps at 960x540),
  not on real phones or GPUs.
