#version 300 es
// The shared final pass: the strobe flash laid over everything. Nothing else
// touches the picture here; the intensity never changes its colours.
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_resolution;
uniform float u_flash;  // 0 none … 1 white
out vec4 fragColor;

void main() {
  vec3 col = texture(u_src, gl_FragCoord.xy / u_resolution).rgb;
  fragColor = vec4(mix(col, vec3(1.0), u_flash), 1.0);
}
