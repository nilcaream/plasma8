// Julia kaleidoscope: the plane is folded into mirrored wedges around the
// centre, then each point runs the Julia iteration z = z^2 + c, with c near the
// edge of the Mandelbrot set's main cardioid, where the sets are most detailed.
// Middle to hard; flashes brighter on the beat by the beat voices and does
// nothing else with the beat or the bar.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_segments;   // wedges in the kaleidoscope
uniform float u_theta;      // where on the cardioid's edge c sits
uniform float u_edge;       // 1 is on the edge; a little more or less changes the set
uniform float u_wander;     // how far c drifts along the edge over time
uniform float u_zoom;
uniform vec2 u_center;      // what the folded plane is centred on
uniform float u_spin;       // turns per second of the whole picture
uniform float u_bands;      // palette cycles along the escape count
// fixed in code (src/algorithms/julia.ts):
uniform float u_flashGain;   // G: how much brighter the flash F makes the picture (light = 1 + G·F)
uniform float u_glow;        // the orbit-trap glow
uniform float u_wanderSpeed; // how fast c drifts along the edge

const float MAX_ITER = 96.0;

vec2 cardioid(float a) {
  // the edge of the main cardioid: e^ia / 2 - e^2ia / 4
  return 0.5 * vec2(cos(a), sin(a)) - 0.25 * vec2(cos(2.0 * a), sin(2.0 * a));
}

vec3 shade(vec2 uv) {
  float t = u_time;

  // kaleidoscope fold
  float wedge = 6.28318 / u_segments;
  vec2 p = rot2(u_spin * t) * uv;
  float a = atan(p.y, p.x);
  float r = length(p);
  a = mod(a, wedge);
  a = abs(a - 0.5 * wedge);
  p = r * vec2(cos(a), sin(a));

  vec2 z = p * u_zoom + u_center;
  float theta = u_theta + u_wander * sin(t * u_wanderSpeed);
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

  // dark background with bright filaments, the same colours at every intensity; the beat only brightens them, by the flash F (zero at strobe 0)
  vec3 col = cosPalette(k * u_bands + 0.05 * t, u_palA, u_palB, u_palC, u_palD);
  float glow = pow(k, 1.5);
  col *= mix(0.3 + 0.7 * glow, 1.3 * glow, 0.65);
  vec3 core = cosPalette(0.6 + 0.3 * trap, u_palA, u_palB, u_palC, u_palD) * 0.75;
  col = mix(col, core, inside);
  col += u_glow * exp(-trap * 30.0) * 0.9;

  col *= 1.0 + u_flashGain * u_flash;
  return col;
}
