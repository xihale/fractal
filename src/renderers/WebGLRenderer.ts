import { IFractalRenderer, ViewState } from './RendererType';

const V_SHADER = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
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
    
    for (int i = 0; i < u_maxIterations; ++i) {
        vec2 zx2 = mul(zx, zx);
        vec2 zy2 = mul(zy, zy);
        
        if (add(zx2, zy2).x >= 4.0) break;
        
        vec2 tempX = add(sub(zx2, zy2), cx);
        zy = add(mul(mul(two, zx), zy), cy);
        zx = tempX;
        iterations++;
    }
    
    float t = float(iterations);
    outColor = vec4(t / 255.0, t / 255.0, t / 255.0, 1.0);
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

vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

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
    
    for (int i = 0; i < u_maxIterations; ++i) {
        vec2 zx2 = mul(zx, zx);
        vec2 zy2 = mul(zy, zy);
        
        if (add(zx2, zy2).x >= 4.0) break;
        
        vec2 tempX = add(sub(zx2, zy2), cx);
        zy = add(mul(mul(two, zx), zy), cy);
        zx = tempX;
        iterations++;
    }
    
    if (iterations == u_maxIterations) {
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // 使用常数 400.0 进行归一化，否则迭代次数变化时会导致整体色相偏移造成“闪烁/变色”
        float t = float(iterations) / 400.0;
        float hue = t + (160.0 / 360.0);
        outColor = vec4(hsl2rgb(vec3(hue, 0.9, 0.6)), 1.0);
    }
}`;

export class WebGLRenderer implements IFractalRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private programMandelbrot: WebGLProgram;
  private programJulia: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private f32 = new Float32Array(1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    this.programMandelbrot = this.createProgram(gl, V_SHADER, F_SHADER_MANDELBROT_DS);
    this.programJulia = this.createProgram(gl, V_SHADER, F_SHADER_JULIA_DS);
    
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

  render(view: ViewState, isMandelbrot: boolean, _isLowRes: boolean = false): void {
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const program = isMandelbrot ? this.programMandelbrot : this.programJulia;
    gl.useProgram(program);
    
    const locRes = gl.getUniformLocation(program, "u_resolution");
    const locOffsetX = gl.getUniformLocation(program, "u_offsetX");
    const locOffsetY = gl.getUniformLocation(program, "u_offsetY");
    const locZoomInv = gl.getUniformLocation(program, "u_zoomInv");
    const locMaxIters = gl.getUniformLocation(program, "u_maxIterations");
    
    gl.uniform2f(locRes, cw, ch);
    
    const [oxHi, oxLo] = this.splitDouble(view.offsetX);
    gl.uniform2f(locOffsetX, oxHi, oxLo);
    
    const [oyHi, oyLo] = this.splitDouble(view.offsetY);
    gl.uniform2f(locOffsetY, oyHi, oyLo);
    
    const [zHi, zLo] = this.splitDouble(1.0 / view.zoom);
    gl.uniform2f(locZoomInv, zHi, zLo);
    
    // 保持高迭代计算，防止拖拽时因为迭代次数不足导致外围全部变黑
    gl.uniform1i(locMaxIters, 400);
    
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this.programMandelbrot);
    gl.deleteProgram(this.programJulia);
    gl.deleteVertexArray(this.vao);
  }
}
