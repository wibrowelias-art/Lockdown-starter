# Assets and licences (v3)

Room 214 ships **no downloaded art**. The network this was built on blocks the usual CC0
sites (ambientCG, Poly Haven, Kenney, Quaternius), so every texture and model is generated
in code at load time. Nothing is taken from other games, real brands or logos.

| What | Source | Licence |
| --- | --- | --- |
| All PBR textures: waxed vinyl floor tiles, painted block wall, acoustic ceiling tiles, desk laminate, brushed steel, painted metal (door, lockers), knit / twill / nylon fabric, hair strands and curls, skin pores, iris, wired glass, smudges, dust sprite, light shafts | Procedural, own code: `src/game/materials.ts` (albedo + normal-from-height + roughness on a canvas) | Part of this repo |
| Posters, chalkboard writing, bulletin board papers, anatomy poster, cell diagram, student work, answer sheet, clock face, EXIT sign, speaker grille, phone UI | Drawn on canvas / HTML+CSS, own code: `src/game/textures.ts`, `src/ui/` | Part of this repo |
| Room, furniture, props, people (semi-real build, no rigs downloaded) | Built from three.js primitives in own code: `src/game/world.ts`, `src/game/people.ts` | Part of this repo |
| Environment lighting (reflections) | `RoomEnvironment` from three.js examples (`three/addons/environments/RoomEnvironment.js`) | MIT (three.js) |
| Post-processing passes (GTAO, UnrealBloom, Bokeh, SMAA, Output), `RoundedBoxGeometry`, `RectAreaLightUniformsLib` | three.js examples (`three/addons/...`), checked present in the installed r187 | MIT (three.js) |
| UI font: Inter | `@fontsource/inter` (npm), by Rasmus Andersson | SIL Open Font License 1.1 |
| Chalk / handwriting font: Caveat | `@fontsource/caveat` (npm), by Impallari Type | SIL Open Font License 1.1 |
| Sound | Synthesised at runtime with Web Audio, own code: `src/audio/` | Part of this repo |

The v2 cartoon font (Fredoka, OFL) is no longer used; the cartoon build is tagged
`v2-cartoon` (commit 8cd6771) if the tag push succeeded, otherwise recover it from that commit.

## Budget

- Download size: the whole build (`dist/`) is well under the 40 MB budget, see the README
  for the measured number. Textures are 512 to 1024 px canvases (1024 for floor and walls
  on Medium and up, 512 on Low and phones), generated in ~1 s behind a loading bar.
- KTX2 / meshopt: not used, because nothing is downloaded. Procedural textures are created
  directly on the GPU-ready canvas; there are no mesh files to compress.
