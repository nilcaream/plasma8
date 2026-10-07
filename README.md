# plasma8

Fullscreen generative visuals in the browser, driven by a tap-tempo clock. Four WebGL 2 algorithms (plasma, tunnel, domain-warped noise, Julia kaleidoscope) change on the beat; every load draws a fresh random look.

**Warning: the picture flashes on the beat (the Strobe slider, on by default at a low level, at most 3 flashes in any second). Set Strobe to 0 to turn the flash off.**

## Use

- **Tap** anywhere on the page, or press any key, in time with the music. A tap more than 1 second after the previous one is not a tempo tap: it only starts the bar over (that tap is beat 1 of a 4/4 bar) and the tempo stays. The tempo (60 to 180 BPM) is set on the 4th tap of a run and fitted to the last 12 taps, so it follows you when you speed up or slow down; a tapped tempo above 180 is taken as half beats and halved (200 becomes 100). Before the first tap the clock runs at 120 BPM.
- **The band across the top of the page** (88 px, 168 px on a screen under 600 px wide) holds every control, and a tap there is not a beat. A press anywhere in it shows the whole panel, which fades 5 s after the last touch on it:
  - *Intensity*: soft to hard. It sets the speed (from ×1 at 0 to ×1.75 at 1), how far and how sharply the colour and shape values swing between their edges on the kick, snare and crash, and how often a change between algorithms is a cut rather than a fade. It does not set the flash; Strobe does.
  - *Strobe*: 0 is off. Above 0 the picture brightens on the beat voices (kick, snare, crash), by more as the slider rises.
  - *Metronome* (upper-left): a dot on every beat, bigger on beat 1. It also shows with the tapping widget when taps come in.
- **Tapping widget** (top centre; it shows as part of the panel, and 3.5 s after the last tap outside the band it fades): four dots fill on the first taps of a run; then a strip shows each tap left (early) or right (late) of the beat mark, the taps the tempo is fitted to bright and older ones fading, with the tempo and its standard error under it (`132.31 +/- 0.41`, green below ±0.5).
- **Tempo wheel** (upper-right, left of Intensity and Strobe): the tempo as a whole number. Drag it up or down (24 px per BPM), turn the mouse wheel over it (one notch is one BPM, up is faster) or use the arrow keys to set the tempo exactly, 60 to 180; the beat stays where it is.
- A press in the band also prints one block to the browser console: what is on the screen (algorithm, seed, transition, tempo and place in the bar, intensity, strobe, the moving values, the flash and its voices) and the flash peaks of the last 5 s with their times. When something looks wrong, press the band and copy that block.
- Intensity and Strobe are remembered in this browser. The tempo is not.
- The algorithm changes every 4, 8 or 16 bars, on beat 1.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `algo=plasma`, `tunnel`, `domain-warped-noise`, `julia-kaleidoscope` | Keep this algorithm and never change |
| `intensity=0..1` | Start at this intensity instead of the remembered one |
| `strobe=0..1` | Start at this strobe instead of the remembered one |
| `bpm=60..180` | Start the free-running clock at this tempo (above 180 it is halved: 200 starts at 100) |
| `debug` | Show an overlay, a panel with a slider for every random value of the running algorithm and an Algorithm dropdown to hold one, and the outline of the band where taps are ignored |

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
