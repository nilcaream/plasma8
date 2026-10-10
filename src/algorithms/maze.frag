// Truchet maze: the plane is a grid of square tiles, each drawn one of two ways
// (two quarter arcs, or one diagonal); the lines of neighbouring tiles meet, so
// they join into long winding paths and closed loops. The grid pans slowly.
// The beat reaches it two ways only: the flash F brightens it, and the moving
// value flip turns tiles. A tile stands turned a quarter turn while its own
// random number is under flip; on every hit of flip's voice the walk takes a
// step, and the tiles it crosses turn together, landing on the hit.
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
uniform float u_flipFrom;    // flip where it rested since its voice's last hit (src/algorithms/maze.ts tileTurns)
uniform float u_flipTo;      // flip where the next hit lands it
uniform float u_turn;        // 0..1, the eased share of the stroke from u_flipFrom to u_flipTo
uniform float u_flashGain;   // G: how much brighter the flash F makes the picture (light = 1 + G·F)

const float QUARTER = 1.5707963;
const float LINE_GLOW = 1.2;  // how bright the lines are
const float HALO = 0.3;       // how bright the soft light round a line is
const float HALO_FALL = 9.0;  // how fast that light falls off, per tile

// distance to the quarter of the circle of radius 0.5 round corner c that lies inside the tile, with round ends at the
// middles of the two edges it joins
float quarterArc(vec2 q, vec2 c) {
  vec2 v = q - c;
  if (v.x * c.x <= 0.0 && v.y * c.y <= 0.0) return abs(length(v) - 0.5);
  return min(length(q - vec2(0.0, c.y)), length(q - vec2(c.x, 0.0)));
}

float segment(vec2 q, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float k = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(q - a - ab * k);
}

// distance from q (a tile's own frame, its middle at 0, its edges at ±0.5) to the tile's line or lines
float tileLines(vec2 q) {
  if (u_style < 0.5) return min(quarterArc(q, vec2(0.5)), quarterArc(q, vec2(-0.5)));
  return segment(q, vec2(-0.5), vec2(0.5));
}

// A tile is turned while its number is under flip; the tiles between the rest and the next landing turn now, by the stroke.
// Both drawings look the same after a half turn, so a tile turning back keeps turning the same way.
float tileTurn(vec2 cell) {
  float h = hash12(cell);
  float turned = step(h, u_flipFrom - 1e-6);
  float turning = step(min(u_flipFrom, u_flipTo), h) * (1.0 - step(max(u_flipFrom, u_flipTo), h));
  return QUARTER * (turned + turning * u_turn);
}

// distance to the nearest line of this tile and its eight neighbours: a neighbour's glow, or a tile half way through
// its turn, reaches over the tile's edge
float mazeLines(vec2 p) {
  vec2 cell = floor(p);
  float d = 1e9;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      d = min(d, tileLines(rot2(tileTurn(c)) * (p - c - 0.5)));
    }
  }
  return d;
}

vec3 shade(vec2 uv) {
  float t = u_time;
  vec2 p = uv * u_cells + u_pan * t + u_offset;

  float d = mazeLines(p);
  // one pixel, in tiles
  float aa = u_cells * u_view / u_resolution.y;
  float core = 1.0 - smoothstep(u_width - aa, u_width + aa, d);
  float halo = exp(-max(d - u_width, 0.0) * HALO_FALL) * HALO;

  // the colour runs across the picture and drifts slowly; the same colours at every intensity
  float k = (p.x + 0.6 * p.y) / u_cells * u_cycles + u_colourDrift * t;
  vec3 line = cosPalette(k, u_palA, u_palB, u_palC, u_palD);
  vec3 col = u_palA * 0.04 + line * (core * LINE_GLOW + halo * (1.0 - core));

  col *= 1.0 + u_flashGain * u_flash;
  col *= 1.0 - 0.3 * dot(uv, uv);
  return col;
}
