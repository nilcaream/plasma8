// Raymarched tunnel: the camera flies down a winding tube (round or a polygon
// in cross-section) whose walls carry glowing rings and ribs. The dive goes at
// one steady speed. On every beat (or every second one) the far end swings to
// a new spot on screen and glides there, and the lines flare; every bar start
// sends a wave of light rushing away down the tube and rolls the view by a step.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_sides;     // 0 round, else the polygon's sides
uniform vec2 u_bend;       // how far the path swings, x and y
uniform vec2 u_bendFreq;
uniform float u_speed;     // forward, units per second
uniform vec2 u_aim;        // where the far end sits on screen, in uv (src/swing.ts)
uniform float u_ringGap;
uniform float u_ribs;
uniform float u_twist;     // ribs spiral along the tube
uniform float u_roll;      // camera roll per second
uniform float u_barRoll;   // camera roll at every bar start
uniform float u_hueDrift;  // palette drift along the tube

const float RADIUS = 1.0;
const float FAR = 40.0;

vec2 path(float z) {
  // softened, the tube winds less
  vec2 bend = u_bend * (1.0 - 0.5 * u_soft);
  return vec2(bend.x * sin(z * u_bendFreq.x), bend.y * cos(z * u_bendFreq.y));
}

// distance to the wall from inside the tube
float tube(vec3 p) {
  vec2 q = p.xy - path(p.z);
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
  float beat = beatPulse();
  float bar = barPulse();
  float I = u_intensity;
  float t = u_time;
  float bars = barStep();
  // softened: calmer lines and a dimmer wave
  float H = I * (1.0 - 0.5 * u_soft);

  float camZ = t * u_speed;

  vec3 ro = vec3(path(camZ), camZ);
  vec3 ta = vec3(path(camZ + 1.5), camZ + 1.5);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec2 v = rot2(u_roll * t + u_barRoll * bars) * (uv - u_aim);
  vec3 rd = normalize(v.x * rt + v.y * up + 1.1 * fw);

  float d = 0.05;
  for (int i = 0; i < 80; i++) {
    float h = tube(ro + rd * d);
    if (h < 0.002 || d > FAR) break;
    d += h * 0.7;
  }
  d = min(d, FAR);
  vec3 p = ro + rd * d;
  vec2 q = p.xy - path(p.z);
  float ang = atan(q.y, q.x) / 6.28318;

  float w = mix(0.14, 0.05, I);
  float rings = lines(p.z / u_ringGap, w, fwidth(p.z / u_ringGap));
  // the angle (-0.5..0.5) jumps where it wraps; fract(ang) wraps at 0 instead, so the smaller step is the true one
  float ribX = ang * u_ribs + p.z * u_twist;
  float ribAA = min(fwidth(ribX), fwidth(fract(ang) * u_ribs + p.z * u_twist));
  float ribs = lines(ribX, w * 0.8, ribAA);
  float glowLines = max(rings, 0.7 * ribs);

  float hue = p.z * u_hueDrift + 0.12 * bars;
  vec3 wall = cosPalette(hue, u_palA, u_palB, u_palC, u_palD);
  vec3 lineCol = cosPalette(hue + 0.35, u_palA, u_palB, u_palC, u_palD);

  // hard: dark walls, lines flaring on the beat; soft: lighter walls, calm lines
  vec3 col = wall * mix(0.45, 0.12, I);
  col += lineCol * glowLines * (mix(0.5, 0.7, H) + 1.3 * H * beat);

  // the bar-start wave rushing away down the tube
  float waveAt = u_barPhase * 28.0;
  col += lineCol * mix(0.4, 1.4, H) * exp(-abs(d - waveAt) * 1.2) * (1.0 - u_barPhase);

  vec3 fog = mix(u_palA * 0.5, vec3(0.0), I);
  col = mix(fog, col, exp(-d * mix(0.05, 0.11, I)));
  col *= 1.0 + 0.15 * H * bar;
  return col;
}
