# plasma8

Fullscreen generative visuals in the browser, driven by a tap-tempo clock. Four WebGL 2 algorithms (plasma, tunnel, domain-warped noise, Julia kaleidoscope) change on the beat; every load draws a fresh random look.

**Warning: the picture flashes on the beat (the Strobe slider, on by default at a low level, at most 3 flashes in any second). Set Strobe to 0 to turn the flash off.**

## Use

- **Tap** anywhere on the page, or press any key, in time with the music. The first tap after a pause of 2 seconds or more is beat 1 of a 4/4 bar; the tempo (40 to 240 BPM) is fitted to all the taps, so the longer you tap the steadier it gets. Before the first tap the clock runs at 120 BPM.
- **Corner menu** (upper-right, fades when nothing moves; taps there are not beats):
  - *Intensity*: soft to hard. It sets the speed (from ×1 at 0 to ×1.75 at 1), how far and how sharply the colour and shape values swing between their edges on the kick, snare and crash, and how often a change between algorithms is a cut rather than a fade. It does not set the flash; Strobe does.
  - *Strobe*: 0 is off. Above 0 the picture brightens on the beat voices (kick, snare, crash), by more as the slider rises.
  - *Metronome*: a dot and the tempo with its standard error.
- Intensity, Strobe and Metronome are remembered in this browser. The tempo is not.
- The algorithm changes every 4, 8 or 16 bars, on beat 1.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `algo=plasma`, `tunnel`, `domain-warped-noise`, `julia-kaleidoscope` | Keep this algorithm and never change |
| `intensity=0..1` | Start at this intensity instead of the remembered one |
| `strobe=0..1` | Start at this strobe instead of the remembered one |
| `bpm=40..240` | Start the free-running clock at this tempo |
| `debug` | Show an overlay, and a panel with a slider for every random value of the running algorithm |

There is no parameter for the random seed; the overlay shows the one in use.

## Other pages

`/beats/`, `/harmonics/` and `/crossfader/` graph the functions the visuals use (the beat flash voices, the beat-locked layers and the crossfader that moves values). They are not linked from the main page.

## Develop

Needs a current Node.js.

```
npm ci
npm run dev        # dev server on 127.0.0.1
npm test           # unit tests
npm run typecheck
npm run build      # typecheck, then a production build into dist/
npm run preview    # serve dist/
```
