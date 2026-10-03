#version 300 es
// The shared final pass. Softening lowers saturation and contrast a little and
// never blurs: a softened picture stays crisp, the algorithms themselves move
// slower and smaller. The strobe flash is laid over everything.
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_resolution;
uniform float u_soft;   // 0 none … 1 full
uniform float u_flash;  // 0 none … 1 white
out vec4 fragColor;

void main() {
  vec3 col = texture(u_src, gl_FragCoord.xy / u_resolution).rgb;

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.0 - 0.25 * u_soft);
  col = mix(vec3(0.32), col, 1.0 - 0.15 * u_soft);

  col = mix(col, vec3(1.0), u_flash);
  fragColor = vec4(col, 1.0);
}
