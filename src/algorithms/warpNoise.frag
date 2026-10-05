// Domain-warped noise: fractal noise warped by fractal noise warped by fractal
// noise, coloured through a cosine palette. Soft; flashes brighter on the beat
// by the beat voices and does nothing else with the beat or the bar.
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;
uniform float u_scale;
uniform vec2 u_speed;   // x: flow, y: warp
uniform vec2 u_offset;
uniform vec2 u_offset2;
uniform float u_warp;
uniform float u_rotate;
uniform float u_flashGain;   // G: how much brighter the flash F makes the picture (light = 1 + G·F)

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  const mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = m * p * 2.02 + 17.0;
    a *= 0.5;
  }
  return v;
}

vec3 shade(vec2 uv) {
  float t = u_time;
  float ang = u_rotate * t;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 p = rot * uv * u_scale + u_offset;

  vec2 q = vec2(fbm(p + u_speed.x * t * vec2(0.30, 0.10)),
                fbm(p + vec2(5.2, 1.3) - u_speed.x * t * vec2(0.10, 0.30)));
  vec2 w = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2) + u_speed.y * t * 0.5),
                fbm(p + u_warp * q + vec2(8.3, 2.8) - u_speed.y * t * 0.4));
  float f = fbm(p + u_warp * w + u_offset2);

  // the same colours at every intensity; the beat only brightens them, by the flash F (zero at intensity 0)
  float k = 1.1 * f + 0.45 * length(q) + 0.25 * length(w);
  vec3 col = u_palA + u_palB * cos(6.28318 * (u_palC * k + u_palD));

  col *= 1.0 + u_flashGain * u_flash;
  col *= 1.0 - 0.3 * dot(uv, uv);
  return col;
}
