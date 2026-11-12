# Room 214 (working title: Lockdown): browser demo, v2

A first-person, choice-driven story. You are Noah, sitting a Biology final in Room 214
when the school goes into lockdown. Zoe, who you teased by text this morning, is out
with the hall pass. Theo freezes. Then someone knocks, with Zoe's voice.

> **Content notice:** school lockdown scenario; may be distressing. The person in the
> hallway is never shown, named or explained: only sound and a shadow of feet under the
> door. No gore, no weapons, no bodies, no injuries on screen; the heaviest outcome is one
> epilogue line. You can never fight or hurt anyone. **Exit** and **Skip scene** are always
> on screen.

Low-poly toon build (Vite + TypeScript + Three.js + Web Audio). A realistic Unreal version
only happens if the demo works. Design docs: `docs/DESIGN.md`, `docs/PROMPT.md`, and for v2
`docs/v2/` (prompt, video breakdown, reference frames; reference only, not shipped).

## Run it

```bash
npm install
npm run dev                         # http://localhost:5173
npm run build && npm run preview    # production build on http://localhost:4173
```

URL options: `?speed=4` (story time 4x faster), `?lowq` (low quality), `?nolock` (no pointer
lock: drag to look, click to use; used by the automated tests).

## Controls

| | Keyboard / mouse (pointer lock) | Touch |
|---|---|---|
| Look | move the mouse (click the view once to capture it) | drag the view |
| Pause / options | **Esc** releases the mouse and pauses; *Options* button | *Options* button |
| Use | click, or **E** (hold E for heavy things) | tap the thing, or **Use** (hold) |
| Move | **WASD** / arrows | joystick (bottom-left) |
| Hurry | **Shift** (fast, and loud) | - |
| Crouch / stand | **C** or **Ctrl** | **Crouch** |
| Hold still / breathe / cover the screen | hold **Space** | hold **Hold** |
| Phone | **Tab** (or P) | **Phone** |
| Mute | **M** | Options |

**Options:** mouse sensitivity, invert Y, sound, and **Low quality** (turns off the ink
outlines and bloom; on by default on touch devices).

## Look

Toon shading (3-step ramp) with ink outlines: inverted hulls on people and props, plus a
depth+normal edge pass for the room. A fisheye lens pass (barrel distortion 0.3, about 100
degrees wide), soft vignette, light film grain, and bloom only on the door window and strip,
the EXIT sign, the PA rings and the siren light. Exam scenes are warm (beige walls, cream
ceiling panels, blue-gray tiles, green board). The lockdown is navy with a pure-white door
window and strip, and pink/blue sirens through the blinds. Panic scales with noise: the
vignette tightens, the lens narrows a little, sound gets muffled, a thin whine fades in.

Side-by-sides with the reference frames: `docs/screenshots/compare/`.

## Phases and tasks (24)

| Phase | Tasks |
|---|---|
| 1 The final (10:42) | fill 4 bubbles; hold still while Ms. Okafor walks the aisle; look under the desks at Zoe's backpack |
| 2 The code | look at the PA when it chimes; drop down (C) on "Everybody down!" |
| 3 Lockdown (75 s, free order; checklist styled like the poster: 1 LOCK / 2 LIGHTS / 3 OUT OF SIGHT) | get to the wall beside the door (8 s scramble; Shift is faster but loud); pull Theo with you; close the blinds; cover the door window with the spare sheet; slide the spare desk against the door (hold E: slow is quiet, Shift is a scrape); find the ringing phone in a backpack by sound within 10 s; silence your phone; Ms. Okafor locks and kills the lights (slower and louder if you're in her way) |
| 4 Zoe (the phone) | answer Zoe in 3 timed rounds; ask "which closet?" (a clue); text Mom (optional; late = noisy, never = she calls); cover the screen glow when footsteps pass (hold Space). Each phone check costs 1% battery (you start at 9%); at 0% you lose Zoe |
| 5 The wait | hold still through 3 handle/feet-shadow beats (Space, mouse still); breathe with Theo in time with a ring; read the alert on Ms. Okafor's phone (a clue); answer Sam's whisper; stay down when the sirens come |
| 6 The knock (10:52) | read the 10:52 text (a clue); choose OPEN THE DOOR / KEEP IT LOCKED, or SEND ONE LAST TEXT first (costs time while the voice pleads) |

Fear is sound and uncertainty: 3D (HRTF) footsteps, rattles, knocks and the ringtone; two
seconds of total silence before the handle moves; fake-outs (pipes, a far door, footsteps
that stop and move on); a low drone only at key beats. Responders arrive and you walk out
with your hands raised (hold Space).

## State and endings (`src/story/state.ts`)

Tracked: `noise` (0-100, never ends the game), `zoeTrust`, `helpedClassmate`, `theoCalm`
(0-2), `tasks`, `clues` (testQuestion, schoolAlert, timing), `battery`, `zoeLost`,
`momTexted`, `holdStill` (beats passed), the whisper choice and the final choice.

| # | Ending | Condition |
|---|---|---|
| 1 | Everyone Went Home | locked, trust >= 2, battery left, noise < 45, Theo helped, held still >= 2 of 3 |
| 2 | Left on Read | locked, and trust < 2 or the phone died |
| 3 | The Long Minute | locked, trust ok, but loud, or Theo not helped, or held still < 2 |
| 4 | The Door Held | opened, and the desk barricade was up, or Theo was helped, or it was quiet |
| 5 | The Open Door | opened, no barricade, Theo not helped, loud |

The epilogue always reveals the truth (Zoe never left the supply closet; the voice was not
hers). Clues found change how sure Noah was; the mom text changes the last line. Every
ending finishes with: *"In a real lockdown, follow your school's plan and your teacher's
instructions, keep phones silent, and call emergency services (911 in the US, 112 in
Germany) when it is safe."*

## Code map

```
src/story/state.ts     state machine: phases, tasks, clues, battery, endings (unit-tested)
src/story/endings.ts   ending sequences and epilogues
src/game/director.ts   the six phase scripts + endings (cancellable, on sim time)
src/game/game.ts       glue: loop, tasks, interaction, pause, phone, hold-still, test hooks
src/game/render.ts     EffectComposer: edge pass, bloom, output, fisheye/vignette/grain
src/game/toon.ts       toon materials, inverted-hull outlines
src/game/world.ts      Room 214 layout, props, door + light strip + feet shadows, lights
src/game/people.ts     cartoon characters (mouth flaps, trembling, poses)
src/game/input.ts      pointer lock, keys, touch
src/audio/audio.ts     Web Audio synthesis, HRTF panners, muffle, silence, whine, drone
src/ui/                HUD, subtitles, phone, checklist, options, end screens
tests/unit/            Vitest
tests/e2e/             Playwright: one playthrough per ending, exit/skip/options, mobile, compare
```

## Tests

```bash
npm test          # Vitest (state machine)
npm run e2e       # Playwright: desktop, mobile (Pixel 7) and compare (portrait) projects
```

## Not done / known limits

- Dialogue is subtitles plus a quiet synthesised murmur; no recorded or TTS voices.
- Sound, pacing and fear have only been checked by automated runs (which cues fired), not by ear.
- Frame rate was only measured in headless Chromium with software WebGL (SwiftShader), which is
  far slower than a real GPU; it has not been measured on a laptop GPU or a phone.
