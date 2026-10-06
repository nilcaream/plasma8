# plasma8

Fullscreen generative visuals in the browser, driven by a tap-tempo clock. Four WebGL 2 algorithms (plasma, tunnel, domain-warped noise, Julia kaleidoscope) change on the beat; every load draws a fresh random look.

**Warning: the picture flashes on the beat (the Strobe slider, on by default at a low level, at most 3 flashes in any second). Set Strobe to 0 to turn the flash off.**

## Use

- **Tap** anywhere on the page, or press any key, in time with the music. A tap more than 1 second after the previous one is not a tempo tap: it only starts the bar over (that tap is beat 1 of a 4/4 bar) and the tempo stays. The tempo (60 to 180 BPM) is set on the 4th tap of a run and fitted to the last 12 taps, so it follows you when you speed up or slow down; a tapped tempo above 180 is taken as half beats and halved (200 becomes 100). Before the first tap the clock runs at 120 BPM.
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
| `bpm=60..180` | Start the free-running clock at this tempo (above 180 it is halved: 200 starts at 100) |
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
