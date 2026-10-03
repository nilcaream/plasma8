// Plasma: interfering sine waves (two plane waves and two moving ripples)
// through a cosine palette. Soft to middle: the colours slide on every beat
// and take a step at every bar start.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform vec2 u_dir1;
uniform vec2 u_dir2;
uniform vec3 u_freq;    // plane wave 1, plane wave 2, ripples
uniform vec4 u_speed;   // one per wave
uniform vec2 u_orbit;   // how far the ripple centres wander
uniform float u_scale;
uniform float u_swirl;  // twist that grows with the distance from the centre
uniform float u_mode;   // 0 plain sum, 1 folded (sharper ridges), 2 product (cells)
uniform float u_cycles; // palette cycles across the range of the field
uniform float u_barShift;

vec3 shade(vec2 uv) {
  float beat = beatPulse();
  float bar = barPulse();
  float I = u_intensity;
  float t = u_time;
  // softened: smaller moves, wider colour bands, gentler swings
  float M = 1.0 - 0.5 * u_soft;

  vec2 p = uv * u_scale * (1.0 - M * (0.07 * I * beat + 0.05 * I * bar));
  p = rot2(M * u_swirl * length(p) + 0.03 * t) * p;

  vec2 orbit = M * u_orbit;
  vec2 c1 = orbit * vec2(sin(t * 0.21), cos(t * 0.17));
  vec2 c2 = -orbit * vec2(cos(t * 0.13 + 1.7), sin(t * 0.19 + 0.4));
  float w1 = sin(dot(p, u_dir1) * u_freq.x + t * u_speed.x);
  float w2 = sin(dot(p, u_dir2) * u_freq.y - t * u_speed.y);
  float w3 = sin(length(p - c1) * u_freq.z - t * u_speed.z);
  float w4 = sin(length(p - c2) * u_freq.z * 0.8 + t * u_speed.w);

  float v;
  if (u_mode < 0.5) {
    v = (w1 + w2 + w3 + w4) * 0.25;
  } else if (u_mode < 1.5) {
    v = 1.0 - 2.0 * abs((w1 + w2 + w3 + w4) * 0.25);
  } else {
    v = (w1 * w2 + w3 * w4) * 0.5 + 0.25 * (w1 + w3);
  }

  // soft settings keep the colour bands wide; hard ones pack them tighter
  float cycles = u_cycles * mix(0.55, 1.15, I) * (1.0 - 0.25 * u_soft);
  float k = v * cycles + 0.04 * t + u_barShift * barStep() + M * I * 0.08 * beat;
  vec3 col = cosPalette(k, u_palA, u_palB * mix(0.6, 1.0, I) * (1.0 - 0.25 * u_soft), u_palC, u_palD);

  col *= 1.0 + M * (0.22 * I * beat + 0.15 * I * bar);
  col *= 1.0 - 0.35 * dot(uv, uv);
  return col;
}
