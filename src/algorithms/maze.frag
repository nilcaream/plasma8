// Truchet maze: the plane is a grid of square tiles, each drawn one of two ways
// (two quarter arcs, or one diagonal); the lines of neighbouring tiles meet, so
// they join into long winding paths and closed loops. The grid pans slowly.
// The beat reaches it two ways only: the flash F brightens it, and the moving
// value flip turns tiles. A tile stands turned a quarter turn while its own
// random number is under flip; on every hit of flip's voice the walk takes a
// step, and the tiles it crosses turn together, landing on the hit. A share of
// the tiles, set by the intensity, joins groups of neighbours that share one
// number, so a group turns as one.
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
uniform float u_groupFrom;   // the share of the tiles in groups where flip rested (src/algorithms/maze.ts mazeTurns)
uniform float u_groupTo;     // the share in groups when the next hit lands
uniform float u_groupShape;  // which neighbours make a group, in the order of GROUP_SHAPES (src/algorithms/maze.ts)
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

// The group a tile belongs to, named by a point no other group of the shape has. Every shape covers the plane with no gaps.
vec2 groupOf(vec2 cell) {
  vec2 block = floor(cell / 2.0);
  vec2 inBlock = cell - 2.0 * block;
  // 2x2
  if (u_groupShape < 1.5) return block;
  // domino: each 2x2 block splits into two, side by side or one over the other
  if (u_groupShape < 2.5) return 2.0 * block + (hash12(block + 0.31) < 0.5 ? vec2(inBlock.x, 0.0) : vec2(0.0, inBlock.y));
  // L and single: one corner of each 2x2 block stands alone, the other three make an L
  if (u_groupShape < 3.5) {
    float k = floor(hash12(block + 0.47) * 4.0);
    vec2 corner = vec2(mod(k, 2.0), floor(k / 2.0));
    return 2.0 * block + (inBlock == corner ? corner : 1.0 - corner);
  }
  // plus: five tiles round a middle; the middles are the tiles where x + 2y is a multiple of 5
  if (u_groupShape < 4.5) {
    float k = mod(cell.x + 2.0 * cell.y, 5.0);
    if (k < 0.5) return cell;
    if (k < 1.5) return cell - vec2(1.0, 0.0);
    if (k < 2.5) return cell - vec2(0.0, 1.0);
    if (k < 3.5) return cell + vec2(0.0, 1.0);
    return cell + vec2(1.0, 0.0);
  }
  // 3x3
  return floor(cell / 3.0);
}

// A tile's number: its group's while the group has joined (its own number is under the share in groups), else its own.
// "single" makes no groups.
float tileNumber(vec2 cell, float share) {
  if (u_groupShape < 0.5) return hash12(cell);
  vec2 g = groupOf(cell);
  return hash12(g + vec2(0.37, 0.61)) < share ? hash12(g + vec2(0.71, 0.13)) : hash12(cell);
}

// A tile is turned while its number is under flip; a tile turned at the rest and not at the next landing, or the other way
// round, turns now, by the stroke. Both drawings look the same after a half turn, so a tile turning back keeps turning the
// same way.
float tileTurn(vec2 cell) {
  float was = float(tileNumber(cell, u_groupFrom) < u_flipFrom);
  float will = float(tileNumber(cell, u_groupTo) < u_flipTo);
  return QUARTER * (was + abs(will - was) * u_turn);
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
