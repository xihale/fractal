import { IFractalRenderer, RenderOptions, ViewState } from './RendererType';
import { MAX_ITERATIONS, PALETTE_GLSL } from './palette';

const V_SHADER = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const BLIT_V_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const BLIT_F_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;

void main() {
    outColor = texture(u_texture, v_uv);
}`;

const COMMON_MATH = `
vec2 add(vec2 a, vec2 b) {
    float t1 = a.x + b.x;
    float e = t1 - a.x;
    float t2 = ((b.x - e) + (a.x - (t1 - e))) + a.y + b.y;
    float res_x = t1 + t2;
    float res_y = t2 - (res_x - t1);
    return vec2(res_x, res_y);
}

vec2 sub(vec2 a, vec2 b) {
    return add(a, vec2(-b.x, -b.y));
}

vec2 mul(vec2 a, vec2 b) {
    float split = 4097.0; // 2^12 + 1
    
    float t1 = a.x * split;
    float a_hi = t1 - (t1 - a.x);
    float a_lo = a.x - a_hi;
    
    float t2 = b.x * split;
    float b_hi = t2 - (t2 - b.x);
    float b_lo = b.x - b_hi;
    
    float p1 = a.x * b.x;
    float p2 = ((a_hi * b_hi - p1) + a_hi * b_lo + a_lo * b_hi) + a_lo * b_lo;
    
    float p3 = p1 + (a.x * b.y + a.y * b.x);
    float res_x = p3;
    float res_y = (p3 - p1) + p2;
    return vec2(res_x, res_y);
}
`;

const F_SHADER_MANDELBROT_DS = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_offsetX;
uniform vec2 u_offsetY;
uniform vec2 u_zoomInv;
uniform int u_maxIterations;

out vec4 outColor;

${COMMON_MATH}
${PALETTE_GLSL}

void main() {
    vec2 coord = gl_FragCoord.xy;
    coord.y = u_resolution.y - coord.y; // Invert Y
    
    float cx_f = coord.x - u_resolution.x * 0.5;
    float cy_f = coord.y - u_resolution.y * 0.5;
    
    vec2 pos_x = add(mul(vec2(cx_f, 0.0), u_zoomInv), u_offsetX);
    vec2 pos_y = add(mul(vec2(cy_f, 0.0), u_zoomInv), u_offsetY);
    
    vec2 zx = vec2(0.0, 0.0);
    vec2 zy = vec2(0.0, 0.0);
    vec2 cx = pos_x;
    vec2 cy = pos_y;
    
    int iterations = 0;
    vec2 two = vec2(2.0, 0.0);
    vec2 zx2 = vec2(0.0, 0.0);
    vec2 zy2 = vec2(0.0, 0.0);
    
    for (int i = 0; i < u_maxIterations; ++i) {
        zx2 = mul(zx, zx);
        zy2 = mul(zy, zy);
        
        if (add(zx2, zy2).x >= 256.0) break;
        
        vec2 tempX = add(sub(zx2, zy2), cx);
        zy = add(mul(mul(two, zx), zy), cy);
        zx = tempX;
        iterations++;
    }
    
    if (iterations >= u_maxIterations) {
        outColor = vec4(interiorColor(), 1.0);
    } else {
        float smoothIterations = float(iterations) + 1.0 - log2(0.5 * log2(add(zx2, zy2).x));
        outColor = vec4(paletteFromSmooth(smoothIterations), 1.0);
    }
}`;

const F_SHADER_JULIA_DS = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_offsetX;
uniform vec2 u_offsetY;
uniform vec2 u_zoomInv;
uniform int u_maxIterations;

out vec4 outColor;

${COMMON_MATH}
${PALETTE_GLSL}

void main() {
    vec2 coord = gl_FragCoord.xy;
    coord.y = u_resolution.y - coord.y; // Invert Y
    
    float cx_f = coord.x - u_resolution.x * 0.5;
    float cy_f = coord.y - u_resolution.y * 0.5;
    
    vec2 pos_x = add(mul(vec2(cx_f, 0.0), u_zoomInv), u_offsetX);
    vec2 pos_y = add(mul(vec2(cy_f, 0.0), u_zoomInv), u_offsetY);
    
    vec2 zx = pos_x;
    vec2 zy = pos_y;
    vec2 cx = vec2(0.285, 0.0);
    vec2 cy = vec2(0.01, 0.0);
    
    int iterations = 0;
    vec2 two = vec2(2.0, 0.0);
    vec2 zx2 = vec2(0.0, 0.0);
    vec2 zy2 = vec2(0.0, 0.0);
    
    for (int i = 0; i < u_maxIterations; ++i) {
        zx2 = mul(zx, zx);
        zy2 = mul(zy, zy);
        
        if (add(zx2, zy2).x >= 256.0) break;
        
        vec2 tempX = add(sub(zx2, zy2), cx);
        zy = add(mul(mul(two, zx), zy), cy);
        zx = tempX;
        iterations++;
    }
    
    if (iterations >= u_maxIterations) {
        outColor = vec4(interiorColor(), 1.0);
    } else {
        float smoothIterations = float(iterations) + 1.0 - log2(0.5 * log2(add(zx2, zy2).x));
        outColor = vec4(paletteFromSmooth(smoothIterations), 1.0);
    }
}`;

interface FractalUniforms {
  resolution: WebGLUniformLocation | null;
  offsetX: WebGLUniformLocation | null;
  offsetY: WebGLUniformLocation | null;
  zoomInv: WebGLUniformLocation | null;
  maxIterations: WebGLUniformLocation | null;
}

interface RenderTarget {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/**
 * Preview pixels are kept around one CSS pixel regardless of screen density:
 * a 3x phone can afford 4x fewer backing pixels, a 1x desktop only 2x.
 */
const previewScale = (pixelRatio: number) =>
  Math.min(4, Math.max(2, Math.round(pixelRatio * 1.5)));

export class WebGLRenderer implements IFractalRenderer {
  /** Two device pixels per CSS pixel is the point of diminishing returns here. */
  readonly maxPixelRatio = 2;

  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programMandelbrot!: WebGLProgram;
  private programJulia!: WebGLProgram;
  private programBlit!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private uniformsMandelbrot!: FractalUniforms;
  private uniformsJulia!: FractalUniforms;
  private target: RenderTarget | null = null;
  private contextLost = false;
  /** Last drawn view, replayed at full quality after a context restore. */
  private lastFrame: { view: ViewState; isMandelbrot: boolean; pixelRatio: number } | null = null;
  private readonly f32 = new Float32Array(1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.initResources();

    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleContextLost = (event: Event) => {
    // Let the browser restore the context instead of blacking out the canvas.
    event.preventDefault();
    this.contextLost = true;
    this.target = null;
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.initResources();
    // The canvas comes back blank; redraw what the user was looking at.
    if (this.lastFrame) {
      const { view, isMandelbrot, pixelRatio } = this.lastFrame;
      this.render(view, isMandelbrot, { pixelRatio });
    }
  };

  private initResources(): void {
    const gl = this.gl;

    this.programMandelbrot = this.createProgram(gl, V_SHADER, F_SHADER_MANDELBROT_DS);
    this.programJulia = this.createProgram(gl, V_SHADER, F_SHADER_JULIA_DS);
    this.programBlit = this.createProgram(gl, BLIT_V_SHADER, BLIT_F_SHADER);
    this.uniformsMandelbrot = this.getUniforms(this.programMandelbrot);
    this.uniformsJulia = this.getUniforms(this.programJulia);

    gl.useProgram(this.programBlit);
    gl.uniform1i(gl.getUniformLocation(this.programBlit, 'u_texture'), 0);

    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // Extracts exactly representable hi/lo 32-bit floats from a 64-bit JS float
  private splitDouble(val: number): [number, number] {
    this.f32[0] = val;
    const hi = this.f32[0];
    const lo = val - hi;
    return [hi, lo];
  }

  private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(source);
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      throw new Error("Shader compile failed");
    }
    return shader;
  }

  private createProgram(gl: WebGL2RenderingContext, vSource: string, fSource: string): WebGLProgram {
    const vShader = this.createShader(gl, gl.VERTEX_SHADER, vSource);
    const fShader = this.createShader(gl, gl.FRAGMENT_SHADER, fSource);
    const program = gl.createProgram()!;
    
    gl.bindAttribLocation(program, 0, "a_position");
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      throw new Error("Program link failed");
    }
    return program;
  }

  private getUniforms(program: WebGLProgram): FractalUniforms {
    const gl = this.gl;
    return {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      offsetX: gl.getUniformLocation(program, "u_offsetX"),
      offsetY: gl.getUniformLocation(program, "u_offsetY"),
      zoomInv: gl.getUniformLocation(program, "u_zoomInv"),
      maxIterations: gl.getUniformLocation(program, "u_maxIterations"),
    };
  }

  private ensureTarget(width: number, height: number): RenderTarget {
    const gl = this.gl;
    if (this.target && this.target.width === width && this.target.height === height) {
      return this.target;
    }
    if (this.target) {
      gl.deleteFramebuffer(this.target.framebuffer);
      gl.deleteTexture(this.target.texture);
    }

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.target = { framebuffer, texture, width, height };
    return this.target;
  }

  render(view: ViewState, isMandelbrot: boolean, options: RenderOptions = {}): void {
    if (this.contextLost) return;

    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw === 0 || ch === 0) return;

    const pixelRatio = options.pixelRatio ?? 1;
    const scale = options.quality === "preview" ? previewScale(pixelRatio) : 1;

    const targetW = Math.max(1, Math.ceil(cw / scale));
    const targetH = Math.max(1, Math.ceil(ch / scale));

    const program = isMandelbrot ? this.programMandelbrot : this.programJulia;
    const uniforms = isMandelbrot ? this.uniformsMandelbrot : this.uniformsJulia;

    if (scale > 1) {
      const target = this.ensureTarget(targetW, targetH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, targetW, targetH);

    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, targetW, targetH);

    const [oxHi, oxLo] = this.splitDouble(view.offsetX);
    gl.uniform2f(uniforms.offsetX, oxHi, oxLo);

    const [oyHi, oyLo] = this.splitDouble(view.offsetY);
    gl.uniform2f(uniforms.offsetY, oyHi, oyLo);

    // World units per target pixel: view.zoom is expressed in CSS pixels, and
    // each target pixel covers `scale / pixelRatio` CSS pixels.
    const [zHi, zLo] = this.splitDouble(scale / (pixelRatio * view.zoom));
    gl.uniform2f(uniforms.zoomInv, zHi, zLo);

    // 保持高迭代计算，防止拖拽时因为迭代次数不足导致外围全部变黑
    gl.uniform1i(uniforms.maxIterations, MAX_ITERATIONS);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (scale > 1) {
      // Blit the low-resolution pass over the full canvas; LINEAR filtering
      // hides the coarse grid while a pan or pinch is in flight.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.useProgram(this.programBlit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.target!.texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);

    // Only a completed frame is worth replaying, never the preview pass.
    if (scale === 1) this.lastFrame = { view, isMandelbrot, pixelRatio };
  }

  destroy(): void {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    if (this.target) {
      gl.deleteFramebuffer(this.target.framebuffer);
      gl.deleteTexture(this.target.texture);
      this.target = null;
    }
    gl.deleteProgram(this.programMandelbrot);
    gl.deleteProgram(this.programJulia);
    gl.deleteProgram(this.programBlit);
    gl.deleteVertexArray(this.vao);
  }
}
