# Room 214 (working title: Lockdown): browser demo, v3

A first-person, choice-driven story. You are Noah, sitting a Biology final in Room 214
when the school goes into lockdown. Zoe, who you teased by text this morning, is out
with the hall pass. Theo freezes. Then someone knocks, with Zoe's voice.

> **Content notice:** school lockdown scenario; may be distressing. The person in the
> hallway is never shown, named or explained: only sound and a shadow of feet under the
> door. No gore, no weapons, no bodies, no injuries on screen; the heaviest outcome is one
> epilogue line. You can never fight or hurt anyone. **Exit** and **Skip scene** are always
> on screen.

v3 is the realistic build (Vite + TypeScript + Three.js r187 + Web Audio): physically based
materials and lights, semi-real people, and on-screen task guidance. The v2 cartoon look is
kept at the tag `v2-cartoon` / commit 8cd6771. Design docs: `docs/DESIGN.md`, `docs/PROMPT.md`,
`docs/v2/` (v2 prompt, video breakdown, reference frames; reference only, not shipped), asset
licences in `docs/ASSETS.md`, realism audit in `docs/REALISM-AUDIT.md`.

## Run it

```bash
npm install
npm run dev                         # http://localhost:5173
npm run build && npm run preview    # production build on http://localhost:4173
```

URL options: `?speed=4` (story time 4x faster), `?preset=low|medium|high|ultra` (force a
quality preset), `?lowq` (= `?preset=low`), `?nolock` (no pointer lock: drag to look, click to
use; used by the automated tests). **F3** shows an FPS / frame-time / draw-call counter.

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

**Options:** mouse sensitivity, invert Y, sound, **Quality** (Auto, Low, Medium, High, Ultra;
Auto runs a 1-second benchmark at High on the title screen and picks a preset; phones and
tablets start on Low), **Video lens** (the fisheye look of the reference video; off by default),
and **Guidance** (Full: task card, outline in the world, key icon, edge arrow; Minimal: task
card only; Off: nothing, only the old text hints).

## Task guidance

Whenever a task is active the player is told what to do and where:

- a task card at the top (icon, action, distance) and the next suggested task marked in the
  poster checklist;
- a soft warm-white outline on the object, pulsing at ~1.5 Hz, faintly visible through
  furniture; in the dark lockdown it is dimmer and never blooms;
- a floating key icon (E, hold E, Space, C...) that turns into "Press E: <action>" within
  1.2 m, with a progress ring for holds; an arrow at the screen edge when the target is
  off-screen;
- after 12 s idle the outline pulses harder and a classmate whispers a hint; after 25 s it
  widens. The ringing phone gets no marker for its first 6 s (find it by sound), then a ping;
- hold-still beats hide every marker and show only the meter: "Hold Space. Don't move.";
- the first time each key is needed, its key cap is shown once.

Shape and brightness carry the meaning, never red/green.

## Look

Same room, layout and camera framing as the reference frames, made as realistic as a
browser allows:

- **Lens:** about 75 degrees, no fisheye (Options: Video lens for the fisheye), subtle head
  bob and breathing sway.
- **Light:** AgX tone mapping, physically based lights: three rect-area ceiling panels with a
  start-up flicker plus two shadow-casting spots, hard window light through individual blind
  slats (real slat shadows and dust shafts), the hall light fanning under the door, EXIT
  colour spill, animated pink/blue siren lights through the blinds, a low environment fill.
  Eye adaptation: when the lights go off, exposure ramps up over ~3 s. Lights switch by
  intensity, so going dark never recompiles shaders.
- **Post (checked against `three/examples/jsm` in r187):** GTAO ambient occlusion, a firefly
  clamp, UnrealBloom on bright sources only (lamps, door window and strip, EXIT, sirens; lit
  surfaces stay under the threshold), Bokeh depth of field only on the phone close-up,
  OutputPass, SMAA, and a grade pass (warm exam, cold navy lockdown, vignette, light grain).
- **Materials:** procedural PBR everywhere (see `docs/ASSETS.md`): waxed vinyl tiles with
  grout and glossy reflection, painted block walls, acoustic ceiling tiles, laminate desks,
  steel tubing, brushed lever, wired-glass door window, real blind slats, chalkboard, curled
  posters, bulletin board, baseboards, outlets, switch, vent, smoke detector, clock, speaker
  grille; biology details (anatomy poster, cell diagram, plant, microscope, textbooks,
  student work); dust motes, haze, scuffs.
- **People:** a clean semi-real build (no downloaded rigs): jointed limbs, knit / fleece /
  denim fabric, skin with pores and sheen (not waxy), hair with strand normals, wet eyes that
  blink. Only Ms. Okafor and Theo have open, readable faces, and they are never seen closer
  than ~1 m (they look down as you come close, and you can't walk into them); the other
  students keep their eyes down and are mostly seen from behind. Breathing, micro head
  motion, trembling, smooth crouch/stand, walk cycles driven by distance (no foot sliding).
- **UI:** Inter, white subtitles with a soft shadow and a small coloured speaker tag, a
  realistic phone, clean glass panels; the checklist keeps the paper-poster look.

Side-by-sides with the reference frames: `docs/screenshots/compare-v3/` (v2:
`docs/screenshots/compare/`).

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
src/game/render.ts     presets, EffectComposer: GTAO, clamp, bloom, DOF, output, SMAA, grade
src/game/materials.ts  procedural PBR texture library (loading screen progress)
src/game/toon.ts       material helpers (name kept from v2)
src/game/world.ts      Room 214 layout, props, door + light strip + feet shadows, lights
src/game/people.ts     semi-real people (joints, fabric, skin, hair, eyes, gait)
src/game/guidance.ts   task guidance: target picking, outlines, icons, pointer, idle help
src/game/input.ts      pointer lock, keys, touch
src/audio/audio.ts     Web Audio synthesis, HRTF panners, muffle, silence, whine, drone
src/ui/                HUD, subtitles, phone, checklist, options, end screens
tests/unit/            Vitest
tests/e2e/             Playwright: one playthrough per ending, exit/skip/options, guidance bot (24 tasks), mobile, compare
```

## Tests

```bash
npm test          # Vitest (state machine)
npm run e2e       # Playwright: desktop, mobile (Pixel 7) and compare (portrait) projects
```

## Not done / known limits

- Dialogue is subtitles plus a quiet synthesised murmur; no recorded or TTS voices.
- Sound, pacing and fear have only been checked by automated runs (which cues fired), not by ear.
- Frame rate was only measured in headless Chromium with software WebGL (SwiftShader, no GPU),
  960x540: high quality about 6-7 fps (exam and lockdown), low quality about 38 fps (exam) and
  18 fps (lockdown). Software GL is far slower than a real GPU, but the 60 fps laptop target has
  not been measured on real hardware or on a phone.
