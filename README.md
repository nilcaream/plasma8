# plasma8

Fullscreen generative visuals in the browser, driven by the tempo of the music, tapped by you or heard through the microphone. Five WebGL 2 algorithms (plasma, tunnel, domain-warped noise, Julia kaleidoscope, a maze of tiles that turn on the beat) change on the beat; every load draws a fresh random look.

**Live: [plasma8.nilcaream.com](https://plasma8.nilcaream.com)**

**Warning: the picture flashes on the beat (the Strobe slider, on by default at a low level, at most 3 flashes in any second). Set Strobe to 0 to turn the flash off.**

## Use

- **The tempo comes from Tap or from Detect** (the *Tempo* buttons in the band; Tap is the default). A press that starts the bar over (below) also starts the next visual at once, on that beat.
- **Tap**: press anywhere on the page, or press any key (not Tab, Escape or a modifier), in time with the music. A tap more than 1 second after the previous one is not a tempo tap: it only starts the bar over (that tap is beat 1 of a 4/4 bar) and the tempo stays. The tempo (60 to 180 BPM) is set on the 4th tap of a run and fitted to the last 12 taps, so it follows you when you speed up or slow down; a tapped tempo above 180 is taken as half beats and halved (200 becomes 100). Before the first tap the clock runs at 120 BPM.
- **Detect**: the microphone listens to the music and the page takes its tempo and its beats (it reads 80 to 158 BPM). A press is only a hint where bar 1 is: the detected beat nearest to it becomes beat 1 of bar 1, and follow-up presses within a second are ignored. The browser asks for the microphone the first time.
  - *Continuous* off (the default): hold a press for half a second to start listening. The microphone closes by itself as soon as the tempo is sure, and the clock keeps the tempo and the beat running. Hold again to listen again.
  - *Continuous* on: the microphone listens all the time, and follows the music when its tempo changes. It opens when you turn Continuous on or switch to Detect; after a reload it opens on the first press or key, because a browser wants a gesture for it.
  - *Sync* (-100 to +100 ms, 0 by default): the visuals' beat falls this many milliseconds earlier (+) or later (-) than the detected one. It makes up for the time it takes to hear, record and process the sound and to show the picture; tune it by ear.
  - Continuous and Sync are dimmed while the source is Tap.
  - A **red dot** at the bottom left is on whenever the microphone listens, also when the panel has faded. If the microphone cannot be opened, a note beside it says why.
  - The **detect display** (the middle of the band) shows the tempo with two decimals, dim and marked "listening" until it is sure, then bright. Under it, ten dots light one by one as the beat fits of the last seconds agree, and an amber bar is filled to how confident the detector is that it hears a beat (the tick at the half is the confidence the tempo needs to be sure). The dots and the bar empty when no beat has been heard for 2 seconds. When all ten dots are lit, the tempo is sure.
- **The band across the top of the page** (92 px, plus the notch on a phone) holds every control, and a press there is not a beat. A touch or a move of the mouse anywhere on the page shows the whole panel, which fades 5 s after the last touch (the mouse pointer fades with it); it stays while the mouse is over the band and while the microphone is still finding the tempo, and Escape puts it away. In it, from the left:
  - *Metronome*: a dot on every beat, bigger on beat 1. It also shows with the tapping widget when taps come in.
  - *Tempo*: Tap or Detect. *Continuous* and *Sync*: see Detect above.
  - *Min bars* and *Max bars*: how long a visual runs, 1, 2, 4, 8 or 16 bars (2 to 4 by default). Every change draws the length of the next visual from this range, each length in it equally likely, and the change lands on beat 1. Moving one end past the other moves the other along. The visual on the screen keeps the length it drew.
  - The **tapping widget** (it shows as part of the panel, and 3.5 s after the last tap outside the band it fades): four dots fill on the first taps of a run; then a strip shows each tap left (early) or right (late) of the beat mark, the taps the tempo is fitted to bright and older ones fading, with the tempo and its standard error under it (`132.31 +/- 0.41`, green below ±0.5). While the source is Detect it shows the detect display instead, and only with the panel.
  - *What plays*: Plasma, Tunnel, Noise, Julia and Maze, all lit by default. Press one to switch it off or on; the last one lit stays on. With one lit, that algorithm plays alone, in a new variant of itself at every change; with several, each change picks one of the lit ones at random. If the one on the screen is switched off, another lit one takes its place at once.
  - *Intensity*: soft to hard. It sets the speed (from ×1 at 0 to ×1.75 at 1), how far and how sharply the colour and shape values swing between their edges on the kick, snare and crash, how often a change between algorithms is a cut rather than a fade, and which algorithm is likely next (the harder ones at a high setting). It does not set the flash; Strobe does.
  - *Strobe*: 0 is off. Above 0 the picture brightens on the beat voices (kick, snare, crash), by more as the slider rises.
- A press in the band also prints one block to the browser console: what is on the screen (algorithm, seed, transition, tempo and place in the bar, intensity, strobe, the moving values, the flash and its voices) and the flash peaks of the last 5 s with their times. When something looks wrong, press the band and copy that block.
- Everything in the band is remembered in this browser: Intensity, Strobe, the tempo source, Continuous, Sync, Min bars, Max bars and What plays. The tempo is not.

## URL parameters

| Parameter | Effect |
| --- | --- |
| `algo=plasma`, `tunnel`, `domain-warped-noise`, `julia-kaleidoscope`, `maze` | Light this algorithm alone in "What plays", a new variant of it at every change, until the panel lights another |
| `intensity=0..1` | Start at this intensity instead of the remembered one |
| `strobe=0..1` | Start at this strobe instead of the remembered one |
| `bpm=60..180` | Start the free-running Tap clock at this tempo (above 180 it is halved: 200 starts at 100) |
| `debug` | Show an overlay, a panel with a slider for every random value of the running algorithm, with Draw again, Copy and a Moves key that stops every moving value |
| `transition=rotate`, `card`, `ripple`, `shrink`, `draw`, `wipe`, `fade`, or a comma list | With `debug` only: the maze's flips change their tiles only this way (or these ways) |

There is no parameter for the random seed; the overlay shows the one in use.

## Other pages

[`/beats/`](https://plasma8.nilcaream.com/beats/), [`/harmonics/`](https://plasma8.nilcaream.com/harmonics/), [`/crossfader/`](https://plasma8.nilcaream.com/crossfader/) and [`/random-walk/`](https://plasma8.nilcaream.com/random-walk/) graph the functions the visuals use or may use (the beat flash voices, the beat-locked layers, the crossfader that moves values between two edges, and a random walk that steps up or down at each hit). [`/tempo/`](https://plasma8.nilcaream.com/tempo/) is the tempo detection page: arm the microphone and it graphs how the tempo is read (the onsets of the last 8 seconds, the tempo candidates between 80 and 158 BPM, the reading over time) and runs the beat clock Detect uses, with a strobe box that flashes on its beat (at most 3 flashes in any second). They are not linked from the main page.

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
