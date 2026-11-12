# Claude Code prompt: browser demo

GOAL
Build a small playable DEMO of a first-person school-lockdown story game.
Everything must work end to end (exam, lockdown, texting, door choice,
endings). Graphics: simple low-poly, dark and moody. The realistic Unreal
version comes later, only if I like the game.

HARD RULES
- All characters, names, script and art are ORIGINAL. Do not copy any
  existing video, game or creator's work.
- The attacker is never shown or described in detail. Only off-screen
  sound: a muffled bang, distant footsteps, a door handle rattling,
  sirens. No gore, no weapons, no player violence. Consequences are
  told through sound, text messages and a short text epilogue.
- Start screen content notice (school lockdown scenario, may be
  distressing) and a skip/exit button always available.
- You cannot hear or feel it. Report measured/tested things only; I'll
  judge the feel. Keep it cheap: no review agents, no huge test sweeps.

STACK
Vite + TypeScript + Three.js, Web Audio for sound, Vitest + Playwright.
Mobile-friendly touch controls plus keyboard/mouse. Local first; deploy
only when I ask.

SCENE 1: EXAM (about 90 s, playable)
- Room 214, Tuesday 10:42 AM, Biology final. First-person at my desk,
  hands + answer sheet. Look around; fill in a few bubbles. A teacher
  (yellow sweater) says "Ten more minutes. Eyes on your own paper."
- A classmate (red sweater, next to me) and Zoe (asks for the hall pass
  and leaves). Short friendly dialogue so I care about them.

SCENE 2: THE CODE
- A muffled bang from the hall. Classmate: "Somebody slammed a locker."
  Another bang. PA: "Attention, all teachers. The science fair has been
  moved to the gym. I repeat..." Classmate: "Science fair? That was last
  month." Teacher: "It's a code. Everybody down."
- I must do the lockdown steps myself: move away from the door, crouch,
  turn off lights (switch), silence my phone (phone is in my pocket, a
  buzz makes noise). A "noise level" rises with mistakes (phone buzz,
  knocked chair, moving while standing). Never an instant game over.

SCENE 3: TEXTS WITH ZOE
- Zoe texts: someone in the hallway, hiding in the supply closet, "noah
  im scared". Phone UI in first person. I answer by picking 3-4 replies
  (calm her down / tell her to stay / tell her to come here / say
  nothing). Track hidden values: zoeTrust, noise, helpedClassmate.

SCENE 4: WAITING
- Silence, breathing, sirens with red/blue light through the blinds,
  "He's checking doors" from the classmate, the door handle rattles once.

SCENE 5: THE DOOR
- Knocking and a voice: "Noah? It's me. Let me in." Teacher: "We do not
  open that." Zoe texts: "still in the closet. who's knocking??"
- Final choice: OPEN THE DOOR or KEEP IT LOCKED.

ENDINGS
- 4-5 endings driven by zoeTrust, noise, helpedClassmate and the final
  choice. At least one where everyone is safe and one where the door
  choice has a cost. All shown as sound, texts and a short text
  epilogue. End screen: "In a real lockdown, follow your school's plan
  and your teacher's instructions, keep phones silent, and call
  emergency services (911 in the US, 112 in Germany) when it is safe."

CHECKS
- State machine tests for every ending (all reachable).
- Playwright run through each ending, screenshots of each scene.
- Report which endings were reached and any console errors.
