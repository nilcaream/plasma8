// Raymarched tunnel: the camera dives down a tube (round or a polygon in
// cross-section) whose walls carry glowing rings and ribs. The camera goes at
// one steady speed and never turns or rolls; the tube moves instead. Its far
// end swings: on every beat (or every second one) it picks a new spot on screen
// and glides there, and the tube bends towards it from a little way ahead of
// the camera. The lines brighten on the beat and every bar start sends a wave
// of light away down the tube, both as strongly as the intensity says.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_sides;     // 0 round, else the polygon's sides
uniform float u_speed;     // forward, units per second
uniform vec2 u_farEnd;     // where the far end sits on screen, in uv (src/swing.ts)
uniform float u_beatSize;  // how much the beat changes the brightness: 0.1 at intensity 0, 1 at 1 (src/envelope.ts)
uniform float u_ringGap;
uniform float u_ribs;
uniform float u_twist;     // ribs spiral along the tube
uniform float u_hueDrift;  // palette drift along the tube

const float RADIUS = 1.0;
const float FAR = 40.0;
const float LENS = 1.1;       // a point at uv looks along (uv, LENS)
const float BEND_FROM = 6.0;  // about how far ahead of the camera the bend takes over

// the tube's centre s units ahead of the camera: on the camera's axis close by,
// heading for the far end's spot on screen further on
vec2 centre(float s) {
  s = max(s, 0.0);
  return u_farEnd / LENS * (s * s / (s + BEND_FROM));
}

// distance to the wall from inside the tube, in the camera's frame
float tube(vec3 p) {
  vec2 q = p.xy - centre(p.z);
  float r = length(q);
  if (u_sides > 2.5) {
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
  float bars = barStep();
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
  vec2 q = p.xy - centre(p.z);
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

  float hue = z * u_hueDrift + 0.12 * bars;
  vec3 wall = cosPalette(hue, u_palA, u_palB, u_palC, u_palD);
  vec3 lineCol = cosPalette(hue + 0.35, u_palA, u_palB, u_palC, u_palD);

  // dark walls, lines that brighten on the beat around their resting glow, by as much as the intensity says
  float beat = mix(0.5, beatPulse(), u_beatSize);
  vec3 col = wall * 0.15;
  col += lineCol * glowLines * (0.68 + 1.17 * beat);

  // the bar-start wave: it starts a few rings ahead (never on the camera), fades in
  // over the first frames, rushes away and is gone by the next bar; the intensity sets
  // how bright it is, and at 0 it is all but gone
  float wave = smoothstep(0.0, 0.04, u_barPhase) * (1.0 - u_barPhase) * (1.0 - u_barPhase) * u_beatSize * u_beatSize;
  float waveAt = 3.0 + u_barPhase * 25.0;
  col += lineCol * 1.3 * exp(-abs(d - waveAt) * 1.2) * wave;

  col = mix(u_palA * 0.05, col, exp(-d * 0.104));
  col *= 1.0 + 0.135 * wave;
  return col;
}
