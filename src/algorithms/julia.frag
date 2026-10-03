// Julia kaleidoscope: the plane is folded into mirrored wedges around the
// centre, then each point runs the Julia iteration z = z^2 + c, with c near the
// edge of the Mandelbrot set's main cardioid, where the sets are most detailed.
// Middle to hard: the picture zooms in on the beat, and every bar start turns
// the kaleidoscope by a step and moves c along the edge.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_segments;   // wedges in the kaleidoscope
uniform float u_theta;      // where on the cardioid's edge c sits
uniform float u_edge;       // 1 is on the edge; a little more or less changes the set
uniform float u_wander;     // how far c drifts along the edge over time
uniform float u_barTheta;   // how far c steps along the edge at every bar
uniform float u_zoom;
uniform vec2 u_center;      // what the folded plane is centred on
uniform float u_spin;       // turns per second of the whole picture
uniform float u_barTurn;    // turn of the kaleidoscope at every bar, in wedges
uniform float u_bands;      // palette cycles along the escape count

const float MAX_ITER = 96.0;

vec2 cardioid(float a) {
  // the edge of the main cardioid: e^ia / 2 - e^2ia / 4
  return 0.5 * vec2(cos(a), sin(a)) - 0.25 * vec2(cos(2.0 * a), sin(2.0 * a));
}

vec3 shade(vec2 uv) {
  float beat = beatPulse();
  float bar = barPulse();
  float I = u_intensity;
  float t = u_time;
  float bars = barStep();

  // kaleidoscope fold
  float wedge = 6.28318 / u_segments;
  vec2 p = rot2(u_spin * t + u_barTurn * wedge * bars) * uv;
  float a = atan(p.y, p.x);
  float r = length(p);
  a = mod(a, wedge);
  a = abs(a - 0.5 * wedge);
  p = r * vec2(cos(a), sin(a));

  float zoom = u_zoom * (1.0 - 0.12 * I * beat - 0.06 * I * bar);
  vec2 z = p * zoom + u_center;
  float theta = u_theta + u_wander * sin(t * 0.11) + u_barTheta * bars;
  vec2 c = cardioid(theta) * u_edge;

  float n = 0.0;
  float trap = 1e9;
  for (float i = 0.0; i < MAX_ITER; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(z.x * z.y));
    if (dot(z, z) > 256.0) break;
    n += 1.0;
  }

  float inside = step(MAX_ITER - 0.5, n);
  float smoothN = n - log2(log2(max(dot(z, z), 1.0001))) + 4.0;
  // points that escape at once are far from the set; the ones that linger hug it
  float k = clamp(smoothN / 28.0, 0.0, 1.0);

  // hard: near-black background with bright filaments; soft: lifted and gentler
  vec3 col = cosPalette(k * u_bands + 0.05 * t + 0.1 * I * beat, u_palA, u_palB, u_palC, u_palD);
  float glow = pow(k, mix(0.9, 1.8, I));
  col *= mix(0.3 + 0.7 * glow, 1.3 * glow, I);
  vec3 core = cosPalette(0.6 + 0.3 * trap + 0.1 * bars, u_palA, u_palB, u_palC, u_palD) * mix(0.55, 0.85, I);
  col = mix(col, core, inside);
  col += 0.4 * I * exp(-trap * 30.0) * (0.4 + beat);

  col *= 1.0 + 0.3 * I * beat + 0.2 * I * bar;
  return col;
}
