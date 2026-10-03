/** A texture with a framebuffer around it, kept at the size of the canvas. */
export class RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  private width = 0;
  private height = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error('could not create a render target');
    this.texture = texture;
    this.framebuffer = framebuffer;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Reallocates the texture when the size changed. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
