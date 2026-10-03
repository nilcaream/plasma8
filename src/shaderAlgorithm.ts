import type { Algorithm, FrameInputs } from './algorithm';
import { FULLSCREEN_VERTEX, createProgram } from './gl';

/** An algorithm's own random parameters: a name that is a uniform in its shader, and its value. */
export type ShaderParams = Record<string, number | readonly number[]>;

/**
 * Every algorithm shader is `vec3 shade(vec2 uv)` that reads these uniforms and
 * its own. uv is centred, with y from -0.5 to 0.5.
 */
const HEADER = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_beatPhase;
uniform float u_barPhase;
uniform float u_beatPulse;
uniform float u_barPulse;
uniform float u_barCount;
uniform float u_travel;
uniform float u_intensity;
uniform float u_soft;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// the shared beat envelope, 1 on the beat: a swell when soft, a sharp hit when hard; the same over the bar
float beatPulse() { return u_beatPulse; }
float barPulse() { return u_barPulse; }

// a count that steps up by one at every bar start, eased over the first eighth of the bar, up to half of it when softened
float barStep() { return u_barCount + smoothstep(0.0, mix(0.125, 0.5, u_soft), u_barPhase); }

mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318 * (c * t + d)); }
`;

/** Adds a little noise so slow soft gradients do not band. */
const FOOTER = `
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec3 col = shade(uv);
  col += (hash12(gl_FragCoord.xy + fract(u_time) * 64.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const COMMON_UNIFORMS = ['u_resolution', 'u_time', 'u_beatPhase', 'u_barPhase', 'u_beatPulse', 'u_barPulse', 'u_barCount', 'u_travel', 'u_intensity', 'u_soft'] as const;

/**
 * Programs by shader body: every change makes a new instance with new
 * parameters, and only the first instance of an algorithm pays for compiling.
 */
const programs = new WeakMap<WebGL2RenderingContext, Map<string, WebGLProgram>>();

function programFor(gl: WebGL2RenderingContext, shaderBody: string): WebGLProgram {
  let cache = programs.get(gl);
  if (!cache) programs.set(gl, (cache = new Map()));
  let program = cache.get(shaderBody);
  if (!program) cache.set(shaderBody, (program = createProgram(gl, FULLSCREEN_VERTEX, HEADER + shaderBody + FOOTER)));
  return program;
}

/** An algorithm that is one full-screen fragment shader plus a set of random parameters. */
export class ShaderAlgorithm implements Algorithm {
  private readonly program: WebGLProgram;
  private readonly common = new Map<string, WebGLUniformLocation>();
  private readonly params: { location: WebGLUniformLocation; value: number | readonly number[] }[] = [];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly name: string,
    shaderBody: string,
    params: ShaderParams,
  ) {
    this.program = programFor(gl, shaderBody);
    for (const u of COMMON_UNIFORMS) {
      const location = gl.getUniformLocation(this.program, u);
      if (location) this.common.set(u, location);
    }
    for (const [uniform, value] of Object.entries(params)) {
      const location = gl.getUniformLocation(this.program, uniform);
      if (!location) throw new Error(`${name}: shader has no uniform ${uniform}`);
      this.params.push({ location, value });
    }
  }

  draw(target: WebGLFramebuffer | null, inputs: FrameInputs): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, inputs.width, inputs.height);
    gl.useProgram(this.program);
    const c = this.common;
    gl.uniform2f(c.get('u_resolution') ?? null, inputs.width, inputs.height);
    gl.uniform1f(c.get('u_time') ?? null, inputs.time);
    gl.uniform1f(c.get('u_beatPhase') ?? null, inputs.beatPhase);
    gl.uniform1f(c.get('u_barPhase') ?? null, inputs.barPhase);
    gl.uniform1f(c.get('u_beatPulse') ?? null, inputs.beatPulse);
    gl.uniform1f(c.get('u_barPulse') ?? null, inputs.barPulse);
    gl.uniform1f(c.get('u_barCount') ?? null, inputs.barCount);
    gl.uniform1f(c.get('u_travel') ?? null, inputs.travel);
    gl.uniform1f(c.get('u_intensity') ?? null, inputs.intensity);
    gl.uniform1f(c.get('u_soft') ?? null, inputs.soft);
    for (const { location, value } of this.params) setUniform(gl, location, value);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The program is shared with later instances of the same algorithm, so there is nothing to free. */
  dispose(): void {}
}

function setUniform(gl: WebGL2RenderingContext, location: WebGLUniformLocation, value: number | readonly number[]): void {
  if (typeof value === 'number') return gl.uniform1f(location, value);
  switch (value.length) {
    case 2:
      return gl.uniform2f(location, value[0]!, value[1]!);
    case 3:
      return gl.uniform3f(location, value[0]!, value[1]!, value[2]!);
    case 4:
      return gl.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
    default:
      throw new Error(`uniform of ${value.length} components is not supported`);
  }
}
