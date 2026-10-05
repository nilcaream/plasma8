// Raymarched tunnel: the camera dives down a tube (round or a polygon in
// cross-section) whose walls carry glowing rings and ribs. The camera goes at
// one steady speed and never turns or rolls, and the tube runs straight at it.
// The beat only brightens the picture, by the beat voices' flash F.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_sides;     // 2 is the round tube, 3 and up a polygon of that many sides
uniform float u_speed;     // forward, units per second
uniform float u_ringGap;
uniform float u_ribs;
uniform float u_twist;     // ribs spiral along the tube
uniform float u_hueDrift;  // palette drift along the tube
uniform float u_flashGain; // G: how much brighter the flash F makes the picture (light = 1 + G·F)

const float RADIUS = 1.0;
const float FAR = 40.0;
const float LENS = 1.1;       // a point at uv looks along (uv, LENS)
const float LINE_GLOW = 1.265; // how bright the lines rest (the old beat swung it between 0.68 and 1.85)

// distance to the wall from inside the tube, in the camera's frame
float tube(vec3 p) {
  vec2 q = p.xy;
  float r = length(q);
  // 2 sides: the circle; a polygon from 3 sides up
  if (u_sides >= 3.0) {
    float seg = 6.28318 / u_sides;
    float a = atan(q.y, q.x);
    r *= cos(mod(a + 0.5 * seg, seg) - 0.5 * seg);
  }
  return RADIUS - r;
}

// 1 on the lines at whole numbers of x, w wide; smoothed over aa (about a pixel)
float lines(float x, float w, float aa) {
  float f = 0.5 - abs(fract(x) - 0.5);
  return 1.0 - smoothstep(w, w + aa + 0.001, f);
}

vec3 shade(vec2 uv) {
  // the dive's speed is the motion time's: the intensity sets it, no beat changes it
  float camZ = u_time * u_speed;
  vec3 rd = normalize(vec3(uv, LENS));

  float d = 0.05;
  for (int i = 0; i < 80; i++) {
    float h = tube(rd * d);
    if (h < 0.002 || d > FAR) break;
    d += h * 0.7;
  }
  d = min(d, FAR);
  vec3 p = rd * d;
  vec2 q = p.xy;
  float z = p.z + camZ;
  float ang = atan(q.y, q.x) / 6.28318;

  float w = 0.06;
  float rings = lines(z / u_ringGap, w, fwidth(z / u_ringGap));
  // the angle (-0.5..0.5) jumps where it wraps; fract(ang) wraps at 0 instead, so the smaller step is the true one
  float ribX = ang * u_ribs + z * u_twist;
  float ribAA = min(fwidth(ribX), fwidth(fract(ang) * u_ribs + z * u_twist));
  float ribs = lines(ribX, w * 0.8, ribAA);
  // the lines fade out close to the camera: a ring passing right by it would fill the screen's edges
  float glowLines = max(rings, 0.7 * ribs) * smoothstep(1.2, 3.5, d);

  float hue = z * u_hueDrift;
  vec3 wall = cosPalette(hue, u_palA, u_palB, u_palC, u_palD);
  vec3 lineCol = cosPalette(hue + 0.35, u_palA, u_palB, u_palC, u_palD);

  // dark walls and lines resting at one glow; the beat only brightens the whole picture, by the flash F
  vec3 col = wall * 0.15;
  col += lineCol * glowLines * LINE_GLOW;

  col = mix(u_palA * 0.05, col, exp(-d * 0.104));
  col *= 1.0 + u_flashGain * u_flash;
  return col;
}
