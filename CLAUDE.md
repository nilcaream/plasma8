# plasma8

Fullscreen generative WebGL 2 visuals in the browser, driven by a tempo the user taps (Tap) or the microphone hears (Detect). Plain TypeScript and Vite, no framework. The repository is public. `README.md` is the user-facing spec (controls, URL parameters, the warning about flashing): read it for what the page does, and keep it true when behaviour changes.

## Commands

- `npm ci`, then `npm run dev` (dev server on 127.0.0.1), `npm test` (`vitest run`, files `src/**/*.test.ts`), `npm run typecheck` (`tsc --noEmit`), `npm run build` (typecheck, then `vite build` into `dist/`), `npm run preview`.
- One test file: `npx vitest run src/clock.test.ts`.
- Run `npm run build` (or `typecheck`) before every commit: vitest strips types, so a type error passes `npm test` and fails the build. `tsconfig.json` is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`.
- Env-gated benches are skipped unless their variable is set (`describe.skipIf`). They write tables, not assertions:
  - `BPM_BENCH=<out.md>` or `BPM_CLOCK=<out.md>` or `BPM_WAVS=<dir>` with `npx vitest run src/tempoBench.test.ts` (detector table about 35 s; beat clock table; WAVs for a fake microphone).
  - `BPM_REAL=<dir>` (an `index.json` listing 16-bit WAVs; optional `BPM_REAL_INDEX`, `BPM_REAL_OUT`) with `src/tempoReal.test.ts`. Recordings of music are copyrighted: never commit audio.
- Every push to `main` runs `.github/workflows/pages.yml`: `npm ci`, `npm run build`, `npm test`, then publishes `dist/` to GitHub Pages. A red build or test publishes nothing, so `main` always builds and passes. The site is at a domain root: Vite `base` stays `/` and the manifest and icons are linked by absolute path.

## Layout

- Six pages, listed in `vite.config.ts` (`rolldownOptions.input`): `index.html` (the app, `src/main.ts`) and five pages linked from nowhere: `beats/`, `harmonics/`, `crossfader/`, `random-walk/` (graphs of the functions the visuals use, drawn from the same code) and `tempo/` (microphone tempo detection). A new page needs its folder, an entry there and the manifest and icon links every page has in `<head>`.
- Algorithms: `src/algorithms/{plasma,tunnel,warpNoise,julia,maze}.ts` each export an `AlgorithmDef` (its `knobs`, what may move) next to a `.frag` fragment shader, imported with `?raw`. `index.ts` is the registry; `shaderAlgorithm.ts` runs a shader; `stage.ts` with `passes/transition.frag` morphs one into the next; `sequence.ts` schedules changes on beat 1 every few bars; `pick.ts` weighs the next one by intensity.
- Tap tempo: `clock.ts` (pure, takes timestamps), `input.ts`, `tapWidget.ts`. Detect: `onsets.ts`, `tempoDetect.ts`, `tempoFft.ts` (analysis), `beatClock.ts` (free-running beat), `micTempo.ts` (microphone and feed, shared by `/tempo/` and the app), `detectClock.ts`, `sure.ts`, `press.ts`. `tempoSynth.ts` and `tempoBench.ts` render synthetic tracks.
- Beat to picture: `beatVoices.ts` (flash), `flashLimit.ts`, `moving.ts` with `randomWalk.ts` (values that move), `motion.ts` (speed clocks), `envelope.ts`, `knobs.ts`. `crossfader.ts` and `harmonics.ts` only feed their pages and shared helpers.
- UI: `main.ts` wires everything; `band.ts`, `drawer.ts`, `ui.ts`, `knobPanel.ts` (the `?debug` panel), `settings.ts` (remembered in the browser, never the tempo), `query.ts` (URL parameters), `view.ts`, `src/style.css`.

## Rules the code depends on

- Randomness: every load draws a fresh seed (`freshSeed`, printed to the console). No URL parameter sets it and none may: debug parameters pin a choice, never the random draw. Nothing in the app may depend on a fixed seed.
- The beat reaches the picture through three beat voices only (kick every beat, snare on 2 and 4, crash on beat 1), and only as brightness: `light × (1 + flashGain·F)`. Add no other beat- or bar-locked term to a shader.
- The Strobe slider alone sets the flash; Intensity never does, and never changes palette, contrast or blur. Intensity sets the speed (×1 at 0 to ×1.75 at 1, in a straight line) and the step length of the moving values.
- The flash obeys the 3-flashes-in-any-second limit (WCAG 2.3.1): `MIN_FLASH_GAP_S` 1/3 in `beatVoices.ts`, enforced by `FlashLimiter`. A tapped tempo above 180 is halved at the input (200 becomes 100), so 180 BPM is the fastest beat an algorithm sees. Do not weaken the limit; its tests hold at every tempo and tap phase.
- Moving values: an algorithm lists them in "can move" lists (`moving.ts`); an instance picks N entries and each walks its knob's whole min..max in fixed steps on one voice's hits. Never list a value that multiplies the running time (speeds, spin) unless the algorithm sums it over time as the tunnel does for twist and hue drift (`divePhases`): moving it otherwise jumps the picture. Whole-number values (sides, ribs, segments) are drawn once and never move. An algorithm that draws a step as a whole change may read the stroke a value is in (`movingStroke`: where it rested, where the next hit lands it, the eased share done): the maze turns the tiles a step of `flip` crosses by it, so each lands whole on the hit, in a fixed half beat at every intensity (the intensity sets how many tiles turn in groups instead).
- A knob list in `src/algorithms/*.ts` is also the draw order, the `?debug` panel order and the Copy order: the moving lists first, then the values that never move, then the beat voices `A.*`. Reordering or inserting a knob changes what every seed draws.
- Shader scale follows the viewport height (`uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y`), not the width or `devicePixelRatio` (capped at 1.5 for the buffer). On a compact screen taller than wide `viewScale` (`view.ts`) shows the whole picture.
- Two tempo ranges, both exported as `MIN_BPM`/`MAX_BPM`: Tap 60..180 in `clock.ts`, Detect 80..158 in `tempoDetect.ts`. The Detect search (`SEARCH_LO` 79.5 to `SEARCH_HI` 158.9) must stay under one octave, so a tempo and its double are never both candidates and every half or double folds to one reading. Widening it breaks octave safety: a test asserts `SEARCH_HI < 2 × SEARCH_LO`, and a header comment in `tempoDetect.ts` explains the 3:2 and 4:3 relatives that remain.
- Layout: the panel is one row at a viewport of `ONE_ROW_WIDTH` 1776 CSS px or wider; below that `html.compact` puts the extra panels behind a drawer key. Every panel keeps the same height (`--part-h`, 72 px) in both layouts. A press in the top band is never a tempo tap: `Band.covers` is a height test, so a panel outside that band needs a rectangle hit-test.
- Chosen numbers in code (ranges, gains, thresholds) were tuned by ear or measured on recordings. Do not change one to tidy; if you must, say in the commit what you measured.

## Code and tests

- Comments are full sentences in plain English that say what a thing means or why, often with the measured number; a header comment on each module says what it is. No comment restates the code.
- Pure logic takes its inputs (times, rng, storage) as arguments, so tests run on made-up timestamps and need no browser, WebGL or microphone. Keep new logic that way and leave the DOM and GL in `main.ts`, `ui.ts` and the algorithms' `draw`.
- A test sits next to its module as `<module>.test.ts`. Its name is a full sentence that states the behaviour: `it('halves what is above 180, once', …)`.
- Watch a new test fail before you keep it: break the code once, run the test, restore. A test that never failed proves nothing.
- Styling lives in `src/style.css` as variables on `:root` (`--gap`, `--part-h`, `--accent`, `--panel`); use them rather than literals. One amber (`--accent`) lights everything that is on.
- The app sets `window.__plasma8` each frame as a hook for end-to-end rigs; keep it working.
- Icons are made from `assets/icon-source.png` by `python3 -I scripts/make-icons.py` (Pillow) into `public/`; the app ships no service worker.

## Commits

- Conventional Commits: `type(scope): summary`, lower case, no final period. Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`. Scopes in use: `tempo`, `page`, `plasma`, `tunnel`, `noise`, `julia`, `crossfader`, `knobs`, `debug`, `ui`, `clock`, `beat-voices`, `strobe`, `pwa`, `icons`, `deploy`, `readme`; leave the scope out when a change spans several (`refactor: …`).
- The summary says what now happens, with the numbers, not which file changed: `fix(tempo): a new tempo needs half the evidence of the tempo the beat clock holds`. Give a body when the reason or a measurement is not obvious from the subject.
- No trailers. One behaviour per commit, with its tests; the build and the tests pass at every commit.
