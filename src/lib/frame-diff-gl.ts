// STC-319: the WebGL2/GLSL half of the study. Two frames in, a change mask
// out — visualized live, and reduced to one scalar per frame (the fraction
// of pixels that changed past a threshold) so a "changed-over-time" plot can
// sit under the video and be compared against the take's own event ticks.
//
// Deliberately dumb about WHICH change matters — that temporal classifier
// (event-triggered vs ambient/continuous) is exactly what the study's rules
// list has to define from watching real footage, and can't be hardcoded here
// before that happens. This module only answers "how much of the frame
// changed", at full resolution for the eye and at a small, cheap resolution
// for the plot.

const VERTEX_SRC = `#version 300 es
// Full-screen triangle from gl_VertexID — no vertex buffer needed.
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = p * 0.5 + 0.5;
}
`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform sampler2D uCurr;
uniform float uThreshold;
// 0 = eye view: dim current frame, paint changed pixels
// 1 = score view: R = pass/fail (0 or 1), G = raw magnitude — for CPU readback
uniform int uMode;
in vec2 vUv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 prevC = texture(uPrev, vUv).rgb;
  vec3 currC = texture(uCurr, vUv).rgb;
  float d = abs(luma(prevC) - luma(currC));
  float changed = step(uThreshold, d);

  if (uMode == 1) {
    outColor = vec4(changed, d, 0.0, 1.0);
  } else {
    vec3 dimmed = currC * 0.35;
    vec3 highlight = vec3(1.0, 0.15, 0.1);
    outColor = vec4(mix(dimmed, highlight, changed), 1.0);
  }
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('gl.createShader returned null');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('gl.createProgram returned null');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

function makeTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('gl.createTexture returned null');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Resolution of the offscreen readback used for the changed-fraction scalar. Small on purpose — this is a sum, not a picture. */
const SCORE_W = 64;
const SCORE_H = 36;

export class FrameDiffRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly prevTex: WebGLTexture;
  private readonly currTex: WebGLTexture;
  private readonly scoreTex: WebGLTexture;
  private readonly scoreFbo: WebGLFramebuffer;
  private readonly uPrev: WebGLUniformLocation;
  private readonly uCurr: WebGLUniformLocation;
  private readonly uThreshold: WebGLUniformLocation;
  private readonly uMode: WebGLUniformLocation;
  private readonly scorePixels = new Uint8Array(SCORE_W * SCORE_H * 4);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    this.program = link(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.prevTex = makeTexture(gl);
    this.currTex = makeTexture(gl);

    this.scoreTex = makeTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, this.scoreTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SCORE_W, SCORE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('gl.createFramebuffer returned null');
    this.scoreFbo = fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scoreTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const loc = (name: string) => {
      const l = gl.getUniformLocation(this.program, name);
      if (!l) throw new Error(`uniform ${name} not found — did the shader change without this changing too?`);
      return l;
    };
    this.uPrev = loc('uPrev');
    this.uCurr = loc('uCurr');
    this.uThreshold = loc('uThreshold');
    this.uMode = loc('uMode');
  }

  /** Uploads a decoded frame pair once; draw() and changedFraction() both read the same textures. */
  private upload(prev: ImageBitmap, curr: ImageBitmap): void {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.prevTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, prev);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.currTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, curr);
  }

  /** Draws the eye-view mask (dimmed frame + highlighted changed pixels) to the visible canvas. */
  draw(prev: ImageBitmap, curr: ImageBitmap, threshold: number): void {
    const gl = this.gl;
    if (this.canvas.width !== prev.width || this.canvas.height !== prev.height) {
      this.canvas.width = prev.width;
      this.canvas.height = prev.height;
    }
    this.upload(prev, curr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform1i(this.uPrev, 0);
    gl.uniform1i(this.uCurr, 1);
    gl.uniform1f(this.uThreshold, threshold);
    gl.uniform1i(this.uMode, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Renders the diff to a small offscreen buffer and reads it back: the
   * fraction (0..1) of pixels whose luma changed past `threshold`. This is
   * the raw material for the study's "changed over time" plot — it says
   * nothing yet about which changes are the ones a viewer should follow.
   */
  changedFraction(prev: ImageBitmap, curr: ImageBitmap, threshold: number): number {
    const gl = this.gl;
    this.upload(prev, curr);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scoreFbo);
    gl.viewport(0, 0, SCORE_W, SCORE_H);
    gl.useProgram(this.program);
    gl.uniform1i(this.uPrev, 0);
    gl.uniform1i(this.uCurr, 1);
    gl.uniform1f(this.uThreshold, threshold);
    gl.uniform1i(this.uMode, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, SCORE_W, SCORE_H, gl.RGBA, gl.UNSIGNED_BYTE, this.scorePixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let changed = 0;
    const total = SCORE_W * SCORE_H;
    for (let i = 0; i < total; i++) {
      if (this.scorePixels[i * 4] > 127) changed++;
    }
    return changed / total;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.prevTex);
    gl.deleteTexture(this.currTex);
    gl.deleteTexture(this.scoreTex);
    gl.deleteFramebuffer(this.scoreFbo);
    gl.deleteProgram(this.program);
  }
}
