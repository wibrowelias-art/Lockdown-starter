# Design decisions

| Topic | Decision |
|---|---|
| Format | First-person interactive story, later realistic 3D |
| Setting | American high school, Room 214, Biology final, Tuesday 10:42 AM |
| Opening | Short playable exam (~90 s): look around, fill the answer sheet, meet Zoe |
| Lockdown | Player does the steps: move from the door, crouch, lights off, silence phone. Noise level rises with mistakes, never an instant game over |
| Zoe | Player picks one of 3-4 text replies; hidden value zoeTrust |
| Door | Knocking and a voice at the door while Zoe's phone says she is still in the closet. Final choice: open the door or keep it locked |
| Endings | 4-5 endings from zoeTrust, noise, helpedClassmate and the final choice. Outcomes shown as sound, texts and a short text epilogue |
| Tone | Tense thriller, with a short end screen on real lockdown guidance |
| Build order | Browser demo first (Vite + TypeScript + Three.js), UE 5.7 + MetaHuman later |

## Story beats (own wording)
1. Calm exam, teacher warns about ten minutes left.
2. A bang from the hallway, then a coded PA announcement that does not match the school calendar.
3. Teacher recognises it as a lockdown code. Lights off, phones silent, away from the door.
4. A classmate wonders if it is a drill. The teacher says drills are not run during finals.
5. Zoe left with the hall pass earlier. She texts that she is hiding in the supply closet and is scared.
6. Silence, footsteps, a door handle rattles. Sirens and red/blue light arrive.
7. Someone knocks, begs to be let in, and sounds like Zoe, but Zoe's phone says she is still hiding.
8. Final choice: open the door or keep it locked.

## Guardrails
- Original characters, script and art; do not copy any existing video or game.
- Attacker never shown; no gore; no weapons; consequences told off-screen.
- Content notice on the start screen; exit button always available.
