// Plasma: interfering sine waves (two plane waves and two moving ripples)
// through a cosine palette. Soft to middle: the colours slide on every beat
// and take a step at every bar start (a quarter step at intensity 0).
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
uniform float u_beatBreath;  // shrink of the picture on every beat, x intensity
uniform float u_barBreath;   // shrink at the start of a bar, x intensity
uniform float u_swirlSpin;   // how fast the whole field turns
uniform float u_orbitSpeed;  // how fast the ripple centres wander (1 = the wander rates in the code)
uniform float u_colourDrift; // palette drift over time
uniform float u_beatColour;  // palette shift on the beat
uniform float u_beatLight;   // brighter on every beat
uniform float u_barLight;    // brighter at the start of a bar

vec3 shade(vec2 uv) {
  float beat = beatPulse();
  float bar = barPulse();
  float I = u_intensity;
  float t = u_time;

  // the intensity sets how far the picture breathes in on the beat, never its colours
  vec2 p = uv * u_scale * (1.0 - u_beatBreath * I * beat - u_barBreath * I * bar);
  p = rot2(u_swirl * length(p) + u_swirlSpin * t) * p;

  vec2 c1 = u_orbit * vec2(sin(t * 0.21 * u_orbitSpeed), cos(t * 0.17 * u_orbitSpeed));
  vec2 c2 = -u_orbit * vec2(cos(t * 0.13 * u_orbitSpeed + 1.7), sin(t * 0.19 * u_orbitSpeed + 0.4));
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

  // the same colours at every intensity; the beat envelope sets how they pulse
  float k = v * u_cycles * 0.85 + u_colourDrift * t + u_barShift * barStep() + u_beatColour * beat;
  vec3 col = cosPalette(k, u_palA, u_palB, u_palC, u_palD);

  col *= 1.0 + u_beatLight * beat + u_barLight * bar;
  col *= 1.0 - 0.35 * dot(uv, uv);
  return col;
}
