#version 300 es
// The shared final pass. Softening blurs and lowers contrast and saturation;
// the strobe flash is laid over everything.
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_resolution;
uniform float u_soft;   // 0 none … 1 full
uniform float u_flash;  // 0 none … 1 white
out vec4 fragColor;

const int TAPS = 16;

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution;
  vec3 col = texture(u_src, st).rgb;

  if (u_soft > 0.002) {
    // a disc of taps read from a smaller copy, so a wide blur stays smooth
    float radius = u_soft * 0.016 * u_resolution.y;
    float lod = max(0.0, log2(radius * 0.4));
    vec3 sum = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
      float r = sqrt((float(i) + 0.5) / float(TAPS)) * radius;
      float a = float(i) * 2.39996323;
      sum += textureLod(u_src, st + vec2(cos(a), sin(a)) * r / u_resolution, lod).rgb;
    }
    col = sum / float(TAPS);
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, 1.0 - 0.5 * u_soft);
    col = mix(vec3(0.32), col, 1.0 - 0.4 * u_soft);
  }

  col = mix(col, vec3(1.0), u_flash);
  fragColor = vec4(col, 1.0);
}
