// Truchet maze: the plane is a grid of square tiles, each drawn one of two ways
// (two quarter arcs, or one diagonal); the lines of neighbouring tiles meet, so
// they join into long winding paths and closed loops. The grid pans slowly.
// The beat reaches it two ways only: the flash F brightens it, and the flips
// turn tiles. A tile starts turned a quarter turn while its own random number is
// under flip; on every beat clusters of tiles flip, each tile from its drawing to
// that drawing turned a quarter, by one transition that starts on the beat
// (src/mazeFlips.ts). What the flips have turned so far is the R of u_state, the
// tiles turning now its G, and how far a turning tile lies from its cluster's middle its B.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_width;       // half the line's width, in tiles
uniform float u_style;       // 0 two quarter arcs per tile, 1 one diagonal
uniform float u_cells;       // tiles per picture height
uniform vec2 u_pan;          // the pan's direction times its speed, in tiles per second
uniform vec2 u_offset;       // where in the endless grid this run starts
uniform float u_cycles;      // palette cycles per picture height
uniform float u_colourDrift; // palette drift over time
uniform float u_flip;        // the share of the tiles that start turned
uniform sampler2D u_state;   // the flips' grid, wrapping every STATE_SIZE tiles (src/mazeFlips.ts)
uniform float u_turn;        // 0..1, the eased share of the turn the tiles turning now have done since the beat
uniform float u_progress;    // 0..1, the share of the turn's time gone since the beat, in a straight line
uniform float u_transition;  // how the turning tiles change: a T_* number, their place in TRANSITIONS (src/mazeFlips.ts)
uniform float u_flashGain;   // G: how much brighter the flash F makes the picture (light = 1 + G·F)

const float QUARTER = 1.5707963;
const float LINE_GLOW = 1.2;  // how bright the lines are
const float HALO = 0.3;       // how bright the soft light round a line is
const float HALO_FALL = 9.0;  // how fast that light falls off, per tile
const float RIPPLE_SPREAD = 0.6;
const float WIPE_REACH = 1.1;
const float WIPE_ARCS = 0.35;  // past this far from the middle a tile's two arc drawings lie within a line's width of each other
const float WIPE_CROSS = 0.9;  // the share of the eased turn a wipe takes to cross the drawing; the rest sweeps the glow
const float THINNEST = 0.02;  // the least a squashed or shrunk drawing is scaled by, so it never divides by 0
const float CARD_EDGE = 1.0;  // how bright a turning card's edge is when it stands edge-on, against a line
const float CARD_DIM = 0.3;   // how bright a card's drawing is edge-on, turned away from the light

const int T_ROTATE = 0;
const int T_CARD = 1;
const int T_RIPPLE = 2;
const int T_SHRINK = 3;
const int T_DRAW = 4;
const int T_WIPE = 5;
const int T_FADE = 6;

// the share done at x of the time, fastest at the start (src/mazeFlips.ts attack)
float attack(float x) {
  float r = 1.0 - clamp(x, 0.0, 1.0);
  return 1.0 - r * r * r;
}

// distance to the part from a to b (0..1 along it) of the quarter of the circle of radius 0.5 round corner c that lies
// inside the tile; 0 is its end at the middle of the edge (0, c.y), 1 its end at (c.x, 0). Round ends.
float arcPart(vec2 q, vec2 c, float a, float b) {
  if (b <= a) return 1e9;
  vec2 s = -sign(c);
  vec2 w = (q - c) * s;
  float u = atan(w.y, w.x) / QUARTER;
  if (w.x >= 0.0 && w.y >= 0.0 && u >= a && u <= b) return abs(length(w) - 0.5);
  vec2 pa = c + s * 0.5 * vec2(cos(a * QUARTER), sin(a * QUARTER));
  vec2 pb = c + s * 0.5 * vec2(cos(b * QUARTER), sin(b * QUARTER));
  return min(length(q - pa), length(q - pb));
}

float segment(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float k = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(q - a - ab * k);
}

// distance from q (a tile's own frame, its middle at 0, its edges at ±0.5) to the part from a to b of the tile's lines
float tilePart(vec2 q, float a, float b) {
  if (u_style < 0.5) return min(arcPart(q, vec2(0.5), a, b), arcPart(q, vec2(-0.5), a, b));
  if (b <= a) return 1e9;
  return segment(q, mix(vec2(-0.5), vec2(0.5), a), mix(vec2(-0.5), vec2(0.5), b));
}

float tileLines(vec2 q) { return tilePart(q, 0.0, 1.0); }

// distance from q to the edge of the box of half sizes h round 0: below 0 inside
float box(vec2 q, vec2 h) {
  vec2 d = abs(q) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// the light of a line at distance d, in tiles; aa is one pixel
float glow(float d, float aa) {
  float core = 1.0 - smoothstep(u_width - aa, u_width + aa, d);
  float halo = exp(-max(d - u_width, 0.0) * HALO_FALL) * HALO;
  return core * LINE_GLOW + halo * (1.0 - core);
}

// The light of tile c at p. Its drawing turns a quarter if it started turned and a quarter more if the flips so far
// stand it turned; a tile turning now goes to its drawing a quarter further on by the transition of this beat. Both
// drawings look the same after a half turn, so a tile flipped back keeps turning the same way.
float tileGlow(vec2 p, vec2 c, float aa) {
  vec2 q = p - c - 0.5;
  vec4 s = texelFetch(u_state, ivec2(mod(c, 256.0)), 0);
  float a = QUARTER * (step(hash12(c), u_flip - 1e-6) + s.r);
  if (s.g < 0.5) return glow(tileLines(rot2(a) * q), aa);
  float t = u_turn;
  int kind = int(u_transition + 0.5);
  if (kind == T_RIPPLE) {
    // the middle of the cluster turns on the beat, its farthest tile RIPPLE_SPREAD of the time later
    t = attack((u_progress - RIPPLE_SPREAD * s.b) / (1.0 - RIPPLE_SPREAD));
    kind = T_ROTATE;
  }
  if (kind == T_ROTATE) return glow(tileLines(rot2(a + QUARTER * t) * q), aa);
  float b = t < 0.5 ? a : a + QUARTER;
  if (kind == T_CARD) {
    // squashed across, to a line half way, as a card turned on its edge. Its width follows the turn, so it closes
    // fastest on the kick and lands as slowly as a rotation. Squashed alone a diagonal only leans, the same picture
    // as a rotation, so the card shows its own edge while it turns and its drawing dims as it turns away
    float k = max(abs(1.0 - 2.0 * t), THINNEST);
    float face = glow(tileLines(rot2(b) * vec2(q.x / k, q.y)) * k, aa) * mix(CARD_DIM, 1.0, k);
    return max(face, glow(abs(box(q, vec2(0.5 * k, 0.5))), aa) * CARD_EDGE * (1.0 - k));
  }
  if (kind == T_SHRINK) {
    float k = max(abs(1.0 - 2.0 * t), THINNEST);
    return glow(tileLines(rot2(b) * (q / k)) * k, aa);
  }
  vec2 was = rot2(a) * q;
  vec2 will = rot2(a + QUARTER) * q;
  if (kind == T_DRAW) return glow(min(tilePart(was, t, 1.0), tilePart(will, 0.0, t)), aa);
  if (kind == T_WIPE) {
    // the edge sweeps across the tile, one of four ways by the tile's own number: the new drawing behind it, the old ahead,
    // each shown up to a half width past it. It starts where the two drawings first differ, two half widths and a pixel
    // clear, so it moves through the lines from the kick, and crosses them in WIPE_CROSS of the turn; then it goes on to
    // WIPE_REACH, past the round ends and the glow the tile throws over its edges, so the tile lands wholly new.
    vec2 dir = rot2(QUARTER * floor(hash12(c + 0.5) * 4.0)) * vec2(1.0, 0.0);
    float from = (u_style < 0.5 ? WIPE_ARCS : 0.5) + 2.0 * u_width + aa;
    float at = t < WIPE_CROSS ? mix(-from, from, t / WIPE_CROSS) : mix(from, WIPE_REACH, (t - WIPE_CROSS) / (1.0 - WIPE_CROSS));
    float e = dot(q, dir) - at;
    return glow(min(max(tileLines(will), e), max(tileLines(was), -e)), aa);
  }
  // T_FADE
  return mix(glow(tileLines(was), aa), glow(tileLines(will), aa), t);
}

// the light of this tile and its eight neighbours: a neighbour's glow, or a tile half way through its change, reaches
// over the tile's edge
float mazeGlow(vec2 p, float aa) {
  vec2 cell = floor(p);
  float g = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) g = max(g, tileGlow(p, cell + vec2(float(i), float(j)), aa));
  }
  return g;
}

vec3 shade(vec2 uv) {
  float t = u_time;
  vec2 p = uv * u_cells + u_pan * t + u_offset;

  // one pixel, in tiles
  float aa = u_cells * u_view / u_resolution.y;
  float g = mazeGlow(p, aa);

  // the colour runs across the picture and drifts slowly; the same colours at every intensity
  float k = (p.x + 0.6 * p.y) / u_cells * u_cycles + u_colourDrift * t;
  vec3 line = cosPalette(k, u_palA, u_palB, u_palC, u_palD);
  vec3 col = u_palA * 0.04 + line * g;

  col *= 1.0 + u_flashGain * u_flash;
  col *= 1.0 - 0.3 * dot(uv, uv);
  return col;
}
