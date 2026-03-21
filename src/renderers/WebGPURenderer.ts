import { IFractalRenderer, ViewState } from './RendererType';

const SHADER_CODE = `
struct Uniforms {
  resolution: vec2<f32>,
  offset: vec2<f32>,
  zoom: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0)
  );
  var output: VertexOutput;
  output.position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn fs_mandelbrot(in: VertexOutput) -> @location(0) vec4<f32> {
    var coord = in.position.xy;
    coord.y = uniforms.resolution.y - coord.y;
    let pos = (coord - uniforms.resolution * 0.5) / uniforms.zoom + uniforms.offset;
    
    var zx: f32 = 0.0;
    var zy: f32 = 0.0;
    let cx: f32 = pos.x;
    let cy: f32 = pos.y;
    
    var iterations: i32 = 0;
    let maxIterations: i32 = 300;
    
    loop {
        if (iterations >= maxIterations) { break; }
        if (zx * zx + zy * zy >= 4.0) { break; }
        let tempX = zx * zx - zy * zy + cx;
        zy = 2.0 * zx * zy + cy;
        zx = tempX;
        iterations++;
    }
    
    let t = f32(iterations);
    return vec4<f32>(t / 255.0, t / 255.0, t / 255.0, 1.0);
}

fn hsl2rgb(c: vec3<f32>) -> vec3<f32> {
    let rgb = clamp(abs(((c.x * 6.0 + vec3<f32>(0.0, 4.0, 2.0)) % 6.0) - 3.0) - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

@fragment
fn fs_julia(in: VertexOutput) -> @location(0) vec4<f32> {
    var coord = in.position.xy;
    coord.y = uniforms.resolution.y - coord.y;
    let pos = (coord - uniforms.resolution * 0.5) / uniforms.zoom + uniforms.offset;
    
    var zx: f32 = pos.x;
    var zy: f32 = pos.y;
    let cx: f32 = 0.285;
    let cy: f32 = 0.01;
    
    var iterations: i32 = 0;
    let maxIterations: i32 = 300;
    
    loop {
        if (iterations >= maxIterations) { break; }
        if (zx * zx + zy * zy >= 4.0) { break; }
        let tempX = zx * zx - zy * zy + cx;
        zy = 2.0 * zx * zy + cy;
        zx = tempX;
        iterations++;
    }
    
    if (iterations == maxIterations) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    } else {
        let hue = f32(iterations) / f32(maxIterations) + (160.0 / 360.0);
        return vec4<f32>(hsl2rgb(vec3<f32>(hue, 0.9, 0.6)), 1.0);
    }
}
`;

export class WebGPURenderer implements IFractalRenderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipelineMandelbrot: GPURenderPipeline;
  private pipelineJulia: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;
  private bindGroupUniforms: GPUBindGroup;
  
  private uniformData: Float32Array;

  private constructor(
    canvas: HTMLCanvasElement, 
    device: GPUDevice, 
    context: GPUCanvasContext, 
    pipelineMandelbrot: GPURenderPipeline,
    pipelineJulia: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    bindGroupUniforms: GPUBindGroup
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.pipelineMandelbrot = pipelineMandelbrot;
    this.pipelineJulia = pipelineJulia;
    this.uniformBuffer = uniformBuffer;
    this.bindGroupUniforms = bindGroupUniforms;
    this.uniformData = new Float32Array(8);
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer | null> {
    if (!navigator.gpu) return null;
    
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
      if (!context) return null;
      
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque'
      });

      const module = device.createShaderModule({ code: SHADER_CODE });

      const createPipeline = (entryPoint: string) => {
        return device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module,
            entryPoint: 'vs_main',
          },
          fragment: {
            module,
            entryPoint,
            targets: [{ format: presentationFormat }],
          },
          primitive: {
            topology: 'triangle-list',
          },
        });
      };

      const pipelineMandelbrot = createPipeline('fs_mandelbrot');
      const pipelineJulia = createPipeline('fs_julia');

      // 8 floats = 32 bytes (well over the required 20 bytes, properly aligned)
      const uniformBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Layout is assumed identical for both pipelines since WGSL is the same
      const bindGroupUniforms = device.createBindGroup({
        layout: pipelineMandelbrot.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: { buffer: uniformBuffer },
          },
        ],
      });

      return new WebGPURenderer(
        canvas, 
        device, 
        context, 
        pipelineMandelbrot, 
        pipelineJulia, 
        uniformBuffer, 
        bindGroupUniforms
      );
    } catch (e) {
      console.error('WebGPU initialization failed', e);
      return null;
    }
  }

  render(view: ViewState, isMandelbrot: boolean): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    
    this.uniformData[0] = cw;
    this.uniformData[1] = ch;
    this.uniformData[2] = view.offsetX;
    this.uniformData[3] = view.offsetY;
    this.uniformData[4] = view.zoom;
    
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData.buffer, 0, 32);

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(isMandelbrot ? this.pipelineMandelbrot : this.pipelineJulia);
    passEncoder.setBindGroup(0, this.bindGroupUniforms);
    passEncoder.draw(6); 
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  destroy(): void {
    // Basic cleanup
    this.uniformBuffer.destroy();
    this.device.destroy();
  }
}
