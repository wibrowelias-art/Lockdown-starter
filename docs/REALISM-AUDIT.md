# Realism audit (v3)

Judged by eye on the High-preset captures in `docs/screenshots/compare-v3/` (portrait,
405x720 @2x, rendered in headless Chromium with software WebGL) next to the reference frames.
"yes" = clearly visible in that frame, "partial" = present but weak, "n/a" = not in that shot.

| # | Question | 1 exam | 2 code/PA | 3 lockdown start | 4 phone | 5 wait (feet) | 5b sirens | 6 knock | 6b choice |
|---|---|---|---|---|---|---|---|---|---|
| 1 | No flat single-colour surface | yes | yes | yes | yes (room behind) | yes | yes | yes | n/a (blurred) |
| 2 | Contact shadows under desks / chairs / backpacks | partial | partial | partial | n/a | partial | partial | partial | n/a |
| 3 | Visible AO in corners | partial | partial | partial | n/a | yes | yes | yes | n/a |
| 4 | Specular highlights on the floor | yes | yes | yes | n/a | yes | yes | yes | n/a |
| 5 | Door strip light spill on the floor | n/a (lights on) | n/a | n/a | n/a | yes | n/a | yes | n/a |
| 6 | Texture detail at 1 m | yes (sheet, desk, tiles) | yes | yes | yes | yes (block wall) | yes | yes (door paint) | n/a |
| 7 | No z-fighting / stretched textures | yes | yes | yes | yes | yes | yes | yes | yes |
| 8 | Eye adaptation when the lights go off | n/a | n/a | n/a | n/a | measured, see below | measured | measured | n/a |
| 9 | Props bevelled | yes | yes | yes | yes | yes | yes | yes | n/a |
| 10 | Grade matches the reference mood | yes (warm) | yes (warm) | partial (*) | yes (navy) | yes (navy) | partial (**) | yes (navy) | yes |

(*) The lockdown capture is taken at "Phones silent", a moment before Ms. Okafor kills the
lights, so it is still the warm daylight look; the reference frame at 037 s is already dark.
(**) The siren light through the blinds reads mostly blue/violet; the pink phase is weaker
than in the reference frame.

**Eye adaptation (8)** cannot be judged from one still. Measured instead: exposure after the
lights go off, headless, every 0.5 s: 1.00, 1.04, 1.11, 1.11, 1.16, 1.20, 1.22, 1.24, 1.26
(target 1.4; on a real GPU with a steady frame rate it reaches ~95 % in about 3 s, the
headless ramp is slower because every frame's step is capped at 0.1 s).

## Fixed during the audit

- Milky haze over the exam: lit paper (~2.8 in HDR) sat above the bloom threshold while the
  ceiling panels (3.0) were barely brighter. Light sources are now far brighter than lit
  surfaces (panels 8, door strip 11, door window and EXIT 9), the threshold is 5, and a
  firefly clamp runs before bloom. Measured: over-threshold pixels in the exam went from
  ~10 900 to 2-4 (the steel bottle's sun glint).
- Ms. Okafor's back filled the "feet under the door" and "knock" frames; the huddle along the
  door wall moved left so the door and its floor strip are in view.
- Necks too long and sleeves puffy on the people; fixed in proportions.

## Not fixable here / known gaps

- Contact shadows (2) are soft and faint: shadow maps (PCF, 2048 on High) plus GTAO, no
  dedicated contact-shadow pass. Under-desk shadows read, but are not crisp.
- People are a semi-real build from primitives (no licensed scanned or sculpted models could
  be downloaded); up close they read as well-lit mannequins rather than real people.
- All judgements come from software-GL captures; colour, banding and frame pacing on a real
  GPU and monitor were not checked.
