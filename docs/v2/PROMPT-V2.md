# Room 214 v2: prompt for Claude Code

Read `docs/v2/VIDEO-BREAKDOWN.md` and look at every image in `docs/v2/frames/` first. They are the reference for the look, the room, the people and every line. Then upgrade the existing Room 214 demo to v2. Keep the story state machine and tests as the base and extend them.

## GOAL

Fix the playtest feedback: (1) mouse look needs dragging, (2) the graphics look bad, (3) the story feels thin, (4) there is too little to do, (5) it should be scarier and busier. Target 12 to 15 minutes, about 23 small tasks in 6 phases, 5 endings.

## HARD RULES (non-negotiable)

- Original content only. No real school or incident names.
- The attacker is never shown, named or explained: no face, silhouette or weapon. The threat is only sound, a shadow of feet under the door, and consequences.
- No gore, blood, bodies or injuries on screen. The heaviest ending stays off-screen, told in one epilogue line.
- The player can never fight or hurt anyone. "Action" means moving, hiding, helping, deciding.
- Keep the content notice, keep Skip and Exit visible at all times, and keep the end-screen guidance: "In a real lockdown, follow your school's plan and your teacher's instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe."
- You cannot hear or feel the game. Report only what you measured or saw. Keep it cheap: normal effort, no review-agent swarms.

## 1. CONTROLS

- Pointer Lock. "Click to play" calls requestPointerLock; the mouse looks freely with no dragging; Esc releases and pauses. Options panel: mouse sensitivity, invert Y, sound, low-quality toggle.
- WASD move, Shift hurry (loud), C or Ctrl crouch, E interact, hold Space = hold still / breathe, Tab = phone.
- Touch screens keep the joystick and drag-to-look. Keep the test hooks working (tests may bypass pointer lock).

## 2. LOOK (match the frames)

- Toon style: MeshToonMaterial with a 3-step gradient map, black outlines (inverted hull on people and props, a depth+normal edge pass for the room), a wide fisheye post pass (barrel distortion about 0.3 plus a field of view near 100 degrees), soft vignette, light film grain, bloom only on the door window and strip, the EXIT sign and the siren light. Use EffectComposer. The low-quality toggle turns off outlines and bloom for phones.
- Palette: exam scenes bright and warm (beige walls, cream ceiling panels, blue-gray floor tiles, green board). Lockdown scenes in a readable navy blue, door window and strip pure white, pink and blue siren light alternating through the blinds.
- Room 214 exactly as in the breakdown: board text, PA speaker with ripple rings, blue door with tall narrow window and lever, EXIT sign, round clock, LOCKDOWN poster "1 LOCK 2 LIGHTS 3 OUT OF SIGHT", blinds on the left, bulletin board on the right, bookshelf and lockers by Noah's desk, answer sheet "Name: Noah R.", maroon pencil case, yellow pencil, silver bottle, Zoe's purple backpack with white tag and yellow dot under her empty desk.
- People: round cartoon heads, big white eyes, tube bodies, teacher in a mustard sweater with a red-brown bun and round glasses, classmate in a red sweater with black curly hair. Background students are seen from behind. Idle breathing, trembling when scared, mouth flaps on speech, crouch poses.
- UI: speaker-colored outlined subtitles (orange PA, yellow teacher, cyan Theo, white Noah, pink Zoe), a heavy rounded open-license font, cream message banners, dark phone chat with a red battery icon, and a "LOCK / LIGHTS / OUT OF SIGHT" checklist styled like the poster.

## 3. STORY AND SCENES

- Follow the video line for line (see the timeline). Add the lines v1 missed: "This is a drill... right?" / "We don't run drills during finals.", "Not up here.", "Or... somebody has her phone.", the feet shadows in the light strip, the exact board text.
- Noah's stake: his last text to Zoe was a tease ("ur gonna need it more"). What he does with her now is about repairing that.
- Cast: Noah, Zoe (never seen, only texts and a voice), Theo, Ms. Okafor, plus four named background students with one whispered moment each.
- Mystery: who is knocking, and who has Zoe's phone. Three clues (the test question, the school alert on Ms. Okafor's phone, the 10:52 timing) let a careful player be sure; a careless player guesses.
- Authored truth, revealed in the epilogue: Zoe stayed in the supply closet, and the voice at the door was not hers. Keeping the door locked matches real guidance; the game makes it hard to feel, not wrong.
- Keep the five endings (Everyone Went Home, Left on Read, The Long Minute, The Door Held, The Open Door), now also shaped by tasks done, clues found, phone battery and the mom text.

## 4. TASKS (about 23, six phases, checklist HUD)

1. Exam: fill 4 bubbles; hold Space while Ms. Okafor walks the aisle (teaches stillness harmlessly); look under your desk at Zoe's backpack.
2. Code: look at the PA when it chimes; drop down on "Everybody down!".
3. Lockdown (75 s timer, free order): scramble to the wall beside the door (Shift is faster but loud); pull Theo down when he freezes; close the blinds; cover the door window with a spare sheet; slide a desk against the door (hold E, slow = quiet, fast = scrape); find a ringing phone in a backpack by sound within 10 s; silence your own phone; Ms. Okafor locks the door and kills the lights (slower and louder if you hindered her).
4. Phone: read Zoe's texts and answer 3 timed rounds (zoeTrust); ask a test question ("which closet?") for a clue; optional text to mom ("We're in lockdown. I'm okay."), noisy if late; battery drains 1 percent per phone check, at 0 percent you lose Zoe; cover the screen glow with your sleeve (hold Space).
5. Waiting: hold still through 3 handle-rattle and feet-shadow events (hold Space, keep the mouse still); breathe with Theo (hold a button in time with a ring); read the school alert over Ms. Okafor's shoulder ("Do not open doors"); a whispered choice with a classmate; stay down as the sirens arrive.
6. The knock: hear the voice, read the 10:52 text, then choose OPEN THE DOOR, KEEP IT LOCKED, or send one last test text first (costs time while the voice pleads).

## 5. FEAR (sound and uncertainty, never violence)

- Silence first: cut all sound for 2 seconds before the handle moves; muffle the audio as noise rises.
- 3D sound with HRTF panners for steps, the rattle, knocks, ringtones, so the player hears what they cannot see.
- Fake-outs: a pipe knock, a far door slam, footsteps that stop outside and then move on.
- The light strip: feet shadows cross it and the handle presses down slowly.
- Panic effects scale with noise: vignette tightens, lens narrows a little, heartbeat and a thin whine fade in.
- Almost no music: a soft low drone only at key beats.

## 6. ACTION BEATS

The 8-second scramble after "Everybody down!", dragging Theo, the quiet barricade, the ringing-phone hunt, the hold-still gauntlet, and a final walk out with hands raised when responders arrive.

## 7. STATE

Extend `src/story/state.ts`: tasks done, clues (testQuestion, schoolAlert, timing), battery, momTexted, theoCalm, on top of noise, zoeTrust, helpedClassmate. Noise never ends the game by itself. Update `src/story/endings.ts` for the new inputs.

## 8. CHECKS

- Unit tests for every ending and every new value. Playwright run per ending with screenshots.
- For each phase, save a side-by-side of your screenshot and the matching reference frame in `docs/screenshots/compare/` and fix big differences in framing, colors and lighting.
- Measure frame rate (target 60 fps on a mid laptop; label headless software-GL numbers as such). Build and all tests must pass.
- Update the README (controls, tasks, quality toggle). Commit and push to the current branch.
- Final report: what you tested, what you could not hear or feel, and the story choices I should check.
