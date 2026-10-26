// STC-320: the WGSL/WebGPU half of the study — study one's GLSL kernel
// (src/lib/frame-diff-gl.ts) ported to the language the recorder's
// compositor is locked to.
//
// The rule itself is NOT restated here. It lives in `frame-diff-rule.ts`,
// and both this file and the GLSL original are ports of that. The WGSL below
// carries the same three luma weights and the same `>=` threshold test, and
// the equivalence harness holds it to them.
//
// ---------------------------------------------------------------------
// What changed in the port, and why. These notes are the deliverable — the
// first entry in the recorder's WGSL vocabulary.
// ---------------------------------------------------------------------
//
// 1. THE GRID IS A REDUCTION NOW, NOT A RASTER. This is the real port, and
//    everything else is bookkeeping. Study one gets its scalar by rendering
//    the diff into a 64x36 framebuffer and reading it back: with NEAREST
//    filtering, each of those 2304 texels is a POINT SAMPLE of one source
//    pixel. It is an estimator, and on a 640x360 frame it reads 1 pixel in
//    100. A compute shader has no such constraint — one workgroup per grid
//    cell, every pixel of that cell's tile visited exactly once, an atomic
//    counter per cell. The numbers therefore DIFFER from study one's by
//    design, and the writeup measures by how much rather than asserting they
//    match.
//
// 2. `textureLoad`, NOT `textureSample`. A sampler brings filtering and
//    wrap-mode decisions with it, and the whole point of the reduction is
//    that every pixel is counted once at full resolution. `textureLoad`
//    takes integer texel coordinates and has no filtering to disagree
//    about — which also removes study one's `UNPACK_FLIP_Y_WEBGL` from the
//    picture entirely (see 4).
//
// 3. ACQUISITION IS ASYNC. `canvas.getContext('webgl2')` returns a context
//    or null, synchronously, so study one does its whole setup in a
//    constructor. `requestAdapter`/`requestDevice` are promises, so this
//    class cannot have a meaningful constructor and is built through a
//    static async `create()`. Callers that want to swap the two
//    implementations must therefore await construction — the one API shape
//    change the port forces on the page.
//
// 4. Y IS THE OTHER WAY UP, ONCE, AT THE EDGE. WebGPU's normalised device
//    coordinates and its texture space disagree in Y the same way WebGL's
//    do, but `copyExternalImageToTexture` writes top-down and `textureLoad`
//    reads top-down, so the compute path never sees a flip at all. Only the
//    eye-view fragment pass — which IS a raster, and stays one — needs the
//    UV flip, and it does it in the vertex stage so there is exactly one
//    place to get it wrong. Study one flips at UPLOAD, which is why its
//    point-sample model in `frame-diff-rule.ts` has to mirror v.
//
// 5. ERRORS ARRIVE ON A SIDE CHANNEL. A GLSL compile failure is a
//    `getShaderParameter` call away, synchronously, at the point of the
//    mistake. WGSL validation errors surface through `device.lost` and
//    `popErrorScope`, asynchronously, and an unhandled one is a silently
//    blank canvas. `create()` therefore wraps module creation in an error
//    scope and REFUSES rather than returning a half-built renderer — this
//    repo has paid enough for waits and failures that report nothing.

import {
  GRID_W,
  GRID_H,
  LUMA_R,
  LUMA_G,
  LUMA_B,
  type ChangeGrid,
} from './frame-diff-rule.ts';

/**
 * Invocations per workgroup, as an 8x8 square. Each workgroup owns exactly
 * one grid cell and strides its 64 invocations over that cell's tile, so
 * this number is a scheduling choice and not part of the rule — the answer
 * is identical at any workgroup size.
 */
const WG_X = 8;
const WG_Y = 8;

const DIFF_COMPUTE_WGSL = /* wgsl */ `
struct Params {
  threshold : f32,
  gridW     : u32,
  gridH     : u32,
  _pad      : u32,
};

@group(0) @binding(0) var prevTex : texture_2d<f32>;
@group(0) @binding(1) var currTex : texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> cells : array<f32>;
@group(0) @binding(3) var<uniform> params : Params;

// One counter pair per workgroup — the reduction study one could not do.
var<workgroup> wgChanged : atomic<u32>;
var<workgroup> wgTotal   : atomic<u32>;

fn luma(c : vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(${LUMA_R}, ${LUMA_G}, ${LUMA_B}));
}

// Must stay identical to tileStart() in frame-diff-rule.ts. Integer floor
// division tiles the axis exactly for sizes not divisible by the cell count,
// which is every real capture width against 64.
fn tileStart(i : u32, size : u32, cells_n : u32) -> u32 {
  return (i * size) / cells_n;
}

@compute @workgroup_size(${WG_X}, ${WG_Y})
fn main(
  @builtin(workgroup_id) wg : vec3<u32>,
  @builtin(local_invocation_id) local : vec3<u32>,
) {
  if (local.x == 0u && local.y == 0u) {
    atomicStore(&wgChanged, 0u);
    atomicStore(&wgTotal, 0u);
  }
  workgroupBarrier();

  let dims = textureDimensions(currTex);
  let w = dims.x;
  let h = dims.y;

  let x0 = tileStart(wg.x, w, params.gridW);
  let x1 = tileStart(wg.x + 1u, w, params.gridW);
  let y0 = tileStart(wg.y, h, params.gridH);
  let y1 = tileStart(wg.y + 1u, h, params.gridH);

  var localChanged : u32 = 0u;
  var localTotal   : u32 = 0u;

  // Stride the workgroup's invocations across the tile. A tile is usually
  // larger than the workgroup, so each invocation handles several pixels.
  var y = y0 + local.y;
  loop {
    if (y >= y1) { break; }
    var x = x0 + local.x;
    loop {
      if (x >= x1) { break; }
      let p = textureLoad(prevTex, vec2<i32>(i32(x), i32(y)), 0).rgb;
      let c = textureLoad(currTex, vec2<i32>(i32(x), i32(y)), 0).rgb;
      let d = abs(luma(p) - luma(c));
      // step(edge, x) is x >= edge. GLSL's step() and this must agree.
      if (d >= params.threshold) { localChanged = localChanged + 1u; }
      localTotal = localTotal + 1u;
      x = x + ${WG_X}u;
    }
    y = y + ${WG_Y}u;
  }

  atomicAdd(&wgChanged, localChanged);
  atomicAdd(&wgTotal, localTotal);
  workgroupBarrier();

  if (local.x == 0u && local.y == 0u) {
    let total = atomicLoad(&wgTotal);
    let idx = wg.y * params.gridW + wg.x;
    if (total == 0u) {
      cells[idx] = 0.0;
    } else {
      cells[idx] = f32(atomicLoad(&wgChanged)) / f32(total);
    }
  }
}
`;

const MASK_RENDER_WGSL = /* wgsl */ `
struct Params { threshold : f32 };

@group(0) @binding(0) var prevTex : texture_2d<f32>;
@group(0) @binding(1) var currTex : texture_2d<f32>;
@group(0) @binding(2) var texSampler : sampler;
@group(0) @binding(3) var<uniform> params : Params;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Full-screen triangle, same trick as study one's gl_VertexID version.
  var POS = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0)
  );
  let p = POS[vi];
  var out : VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  // The one Y flip in the file: clip space is +Y up, texture space is +Y
  // down. Study one does this at upload time instead (see note 4).
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}

fn luma(c : vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(${LUMA_R}, ${LUMA_G}, ${LUMA_B}));
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  let prevC = textureSample(prevTex, texSampler, in.uv).rgb;
  let currC = textureSample(currTex, texSampler, in.uv).rgb;
  let d = abs(luma(prevC) - luma(currC));
  let changed = select(0.0, 1.0, d >= params.threshold);
  let dimmed = currC * 0.35;
  let highlight = vec3<f32>(1.0, 0.15, 0.1);
  return vec4<f32>(mix(dimmed, highlight, changed), 1.0);
}
`;

/** Anything that can be handed to `copyExternalImageToTexture` — an ImageBitmap in practice. */
export type SourceFrame = ImageBitmap;

export interface GpuSupport {
  readonly supported: boolean;
  /** Why not, in a sentence a page can show a visitor. Empty when supported. */
  readonly reason: string;
}

/**
 * Whether this browser can run study two at all, answered without throwing.
 *
 * Deliberately distinguishes the three failure modes rather than collapsing
 * them: no `navigator.gpu` (the browser has no WebGPU build), no adapter
 * (WebGPU exists but there is no usable GPU — headless Linux, a blocklisted
 * driver), and a device request that fails. A page that said only "WebGPU
 * unavailable" would send a visitor on Firefox and a visitor on a
 * blocklisted driver to the same wrong fix.
 */
export async function checkGpuSupport(): Promise<GpuSupport> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { supported: false, reason: 'This browser has no WebGPU support (navigator.gpu is absent).' };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        reason: 'WebGPU is present but no GPU adapter is available — common on headless or software-rendered browsers.',
      };
    }
    return { supported: true, reason: '' };
  } catch (e) {
    return { supported: false, reason: `Requesting a WebGPU adapter failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * The WGSL port of `FrameDiffRenderer`. Same two jobs — draw the mask, score
 * the frame — but the scoring is a real reduction rather than a downsampled
 * raster.
 */
export class FrameDiffGpuRenderer {
  private prevTex: GPUTexture | null = null;
  private currTex: GPUTexture | null = null;
  private texW = 0;
  private texH = 0;

  private readonly cellCount = GRID_W * GRID_H;
  private readonly cellBytes = GRID_W * GRID_H * 4;

  private constructor(
    private readonly device: GPUDevice,
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GPUCanvasContext,
    private readonly format: GPUTextureFormat,
    private readonly computePipeline: GPUComputePipeline,
    private readonly renderPipeline: GPURenderPipeline,
    private readonly sampler: GPUSampler,
    private readonly cellBuffer: GPUBuffer,
    private readonly readbackBuffer: GPUBuffer,
    private readonly computeParams: GPUBuffer,
    private readonly renderParams: GPUBuffer,
  ) {}

  static async create(canvas: HTMLCanvasElement): Promise<FrameDiffGpuRenderer> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU is not available in this browser');
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no WebGPU adapter available');
    const device = await adapter.requestDevice();

    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('canvas.getContext("webgpu") returned null');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    // Note 5: WGSL validation is asynchronous, so a bad shader is a blank
    // canvas rather than a thrown error. Catch it here or not at all.
    device.pushErrorScope('validation');
    const computeModule = device.createShaderModule({ code: DIFF_COMPUTE_WGSL });
    const renderModule = device.createShaderModule({ code: MASK_RENDER_WGSL });

    const computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'main' },
    });
    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vs' },
      fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    const validationError = await device.popErrorScope();
    if (validationError) {
      device.destroy();
      throw new Error(`WGSL validation failed: ${validationError.message}`);
    }

    const cellBytes = GRID_W * GRID_H * 4;
    const cellBuffer = device.createBuffer({
      size: cellBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const readbackBuffer = device.createBuffer({
      size: cellBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const computeParams = device.createBuffer({
      size: 16, // threshold + gridW + gridH + pad, std140-ish alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const renderParams = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    return new FrameDiffGpuRenderer(
      device, canvas, context, format,
      computePipeline, renderPipeline, sampler,
      cellBuffer, readbackBuffer, computeParams, renderParams,
    );
  }

  /** (Re)allocates the two frame textures when the source size changes, then uploads both frames. */
  private upload(prev: SourceFrame, curr: SourceFrame): void {
    if (prev.width !== curr.width || prev.height !== curr.height) {
      throw new Error(
        `frame size mismatch: ${prev.width}x${prev.height} vs ${curr.width}x${curr.height}`,
      );
    }
    if (!this.prevTex || this.texW !== prev.width || this.texH !== prev.height) {
      this.prevTex?.destroy();
      this.currTex?.destroy();
      const usage =
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT;
      const size = { width: prev.width, height: prev.height };
      this.prevTex = this.device.createTexture({ size, format: 'rgba8unorm', usage });
      this.currTex = this.device.createTexture({ size, format: 'rgba8unorm', usage });
      this.texW = prev.width;
      this.texH = prev.height;
    }
    this.device.queue.copyExternalImageToTexture(
      { source: prev }, { texture: this.prevTex! }, { width: prev.width, height: prev.height },
    );
    this.device.queue.copyExternalImageToTexture(
      { source: curr }, { texture: this.currTex! }, { width: curr.width, height: curr.height },
    );
  }

  /** Draws the eye-view mask to the visible canvas. Still a fragment shader — this one really is a raster. */
  draw(prev: SourceFrame, curr: SourceFrame, threshold: number): void {
    if (this.canvas.width !== prev.width || this.canvas.height !== prev.height) {
      this.canvas.width = prev.width;
      this.canvas.height = prev.height;
      this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    }
    this.upload(prev, curr);
    this.device.queue.writeBuffer(this.renderParams, 0, new Float32Array([threshold, 0, 0, 0]));

    const bind = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.prevTex!.createView() },
        { binding: 1, resource: this.currTex!.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.renderParams } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * The reduction. Returns the full 64x36 change grid AND the exact
   * changed-pixel fraction — where study one could only return the scalar,
   * and an estimated one at that.
   *
   * Async because a GPU readback is: `mapAsync` is the only way back to the
   * CPU, against study one's synchronous `readPixels`. That asynchrony is
   * the second API shape change the port forces on the page.
   */
  async changeGrid(prev: SourceFrame, curr: SourceFrame, threshold: number): Promise<ChangeGrid> {
    this.upload(prev, curr);

    // Params is a mixed struct — one f32 then three u32 — so it is written
    // through a DataView rather than a typed array, which can only hold one
    // of the two. `true` is little-endian, which WGSL uniform buffers are.
    const params = new ArrayBuffer(16);
    const view = new DataView(params);
    view.setFloat32(0, threshold, true);
    view.setUint32(4, GRID_W, true);
    view.setUint32(8, GRID_H, true);
    view.setUint32(12, 0, true);
    this.device.queue.writeBuffer(this.computeParams, 0, params);

    const bind = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.prevTex!.createView() },
        { binding: 1, resource: this.currTex!.createView() },
        { binding: 2, resource: { buffer: this.cellBuffer } },
        { binding: 3, resource: { buffer: this.computeParams } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, bind);
    // One workgroup per grid cell — the dispatch IS the grid.
    pass.dispatchWorkgroups(GRID_W, GRID_H);
    pass.end();
    encoder.copyBufferToBuffer(this.cellBuffer, 0, this.readbackBuffer, 0, this.cellBytes);
    this.device.queue.submit([encoder.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const cells = new Float32Array(this.readbackBuffer.getMappedRange().slice(0));
    this.readbackBuffer.unmap();

    // The grid holds per-tile fractions; the frame-wide fraction has to be
    // reweighted by tile size, because tiles differ by a pixel when the
    // frame is not divisible by 64x36. Averaging the cells would be wrong
    // by exactly that much.
    let changedPixels = 0;
    for (let gy = 0; gy < GRID_H; gy++) {
      const y0 = Math.floor((gy * this.texH) / GRID_H);
      const y1 = Math.floor(((gy + 1) * this.texH) / GRID_H);
      for (let gx = 0; gx < GRID_W; gx++) {
        const x0 = Math.floor((gx * this.texW) / GRID_W);
        const x1 = Math.floor(((gx + 1) * this.texW) / GRID_W);
        changedPixels += cells[gy * GRID_W + gx]! * (x1 - x0) * (y1 - y0);
      }
    }
    const totalPixels = this.texW * this.texH;
    return {
      cells,
      changedFraction: changedPixels / totalPixels,
      changedPixels: Math.round(changedPixels),
      totalPixels,
    };
  }

  /** Study one's API shape, for a caller that only wants the scalar. */
  async changedFraction(prev: SourceFrame, curr: SourceFrame, threshold: number): Promise<number> {
    return (await this.changeGrid(prev, curr, threshold)).changedFraction;
  }

  dispose(): void {
    this.prevTex?.destroy();
    this.currTex?.destroy();
    this.cellBuffer.destroy();
    this.readbackBuffer.destroy();
    this.computeParams.destroy();
    this.renderParams.destroy();
    this.device.destroy();
  }
}
