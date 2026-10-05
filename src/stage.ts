import type { Algorithm, FrameInputs } from './algorithm';
import { FULLSCREEN_VERTEX, createProgram } from './gl';
import transitionSource from './passes/transition.frag?raw';
import { RenderTarget } from './renderTarget';
import type { Rng } from './rng';

export const TRANSITION_STYLES = ['crossfade', 'iris', 'dissolve', 'wipe'] as const;

/** How one fade looks, drawn afresh for every fade. */
export interface TransitionLook {
  style: number;
  dir: [number, number];
  offset: [number, number];
}

export function drawTransitionLook(rng: Rng): TransitionLook {
  const angle = rng.range(0, 2 * Math.PI);
  return {
    style: Math.floor(rng.next() * TRANSITION_STYLES.length),
    dir: [Math.cos(angle), Math.sin(angle)],
    offset: [rng.range(0, 50), rng.range(0, 50)],
  };
}

export interface StageFrame {
  inputs: FrameInputs;
  /** What the incoming algorithm is given during a fade, when it keeps its own time; `inputs` otherwise. */
  incomingInputs?: FrameInputs;
  /** 0..1 of the fade; above 0 only while a fade runs. */
  fade: number;
}

type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;

function locate<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Uniforms<K> {
  const out = {} as Uniforms<K>;
  for (const n of names) out[n] = gl.getUniformLocation(program, n);
  return out;
}

/**
 * Draws a frame: the running algorithm straight onto the canvas, or, during a
 * fade, the outgoing and the incoming one into two textures, blended onto the
 * canvas by the transition pass.
 */
export class Stage {
  private readonly a: RenderTarget;
  private readonly b: RenderTarget;
  private readonly transition: WebGLProgram;
  private readonly tu: Uniforms<'u_from' | 'u_to' | 'u_resolution' | 'u_progress' | 'u_style' | 'u_dir' | 'u_offset'>;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.a = new RenderTarget(gl);
    this.b = new RenderTarget(gl);
    this.transition = createProgram(gl, FULLSCREEN_VERTEX, transitionSource);
    this.tu = locate(gl, this.transition, ['u_from', 'u_to', 'u_resolution', 'u_progress', 'u_style', 'u_dir', 'u_offset']);
  }

  render(current: Algorithm, incoming: Algorithm | undefined, look: TransitionLook | undefined, f: StageFrame): void {
    if (!incoming || !look || f.fade <= 0) {
      current.draw(null, f.inputs);
      return;
    }
    const gl = this.gl;
    const { width, height } = f.inputs;
    for (const t of [this.a, this.b]) t.resize(width, height);
    current.draw(this.a.framebuffer, f.inputs);
    incoming.draw(this.b.framebuffer, f.incomingInputs ?? f.inputs);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.transition);
    this.bindTexture(0, this.a.texture, this.tu.u_from);
    this.bindTexture(1, this.b.texture, this.tu.u_to);
    gl.uniform2f(this.tu.u_resolution, width, height);
    gl.uniform1f(this.tu.u_progress, f.fade);
    gl.uniform1f(this.tu.u_style, look.style);
    gl.uniform2f(this.tu.u_dir, look.dir[0], look.dir[1]);
    gl.uniform2f(this.tu.u_offset, look.offset[0], look.offset[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTexture(unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(location, unit);
  }
}
