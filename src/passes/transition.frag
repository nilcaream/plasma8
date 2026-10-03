#version 300 es
// Blends the outgoing picture into the incoming one during a fade. Every style
// is an order in which pixels switch (a field from 0 to 1), swept by the
// progress with a soft edge, so the incoming picture covers all of it at 1.
precision highp float;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform vec2 u_resolution;
uniform float u_progress;  // 0..1, eased here
uniform float u_style;     // 0 crossfade, 1 iris, 2 dissolve, 3 wipe
uniform vec2 u_dir;        // wipe direction, unit length
uniform vec2 u_offset;     // dissolve noise offset
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = smoothstep(0.0, 1.0, u_progress);

  float m = t;
  if (u_style > 0.5) {
    float f;
    float edge = 0.12;
    if (u_style < 1.5) {
      f = clamp(length(uv) / 0.95, 0.0, 1.0);
    } else if (u_style < 2.5) {
      f = 0.65 * vnoise(uv * 5.0 + u_offset) + 0.35 * vnoise(uv * 13.0 - u_offset);
      edge = 0.06;
    } else {
      f = clamp(dot(uv, u_dir) * 0.85 + 0.5, 0.0, 1.0);
    }
    m = smoothstep(f - edge, f + edge, t * (1.0 + 2.0 * edge) - edge);
  }

  fragColor = mix(texture(u_from, st), texture(u_to, st), m);
}
