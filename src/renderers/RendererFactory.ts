import { IFractalRenderer } from './RendererType';
import { WebGLRenderer } from './WebGLRenderer';
import { WorkerRenderer } from './WorkerRenderer';

export class RendererFactory {
  static async createRenderer(canvas: HTMLCanvasElement): Promise<IFractalRenderer> {
    try {
      // 启用支持双精度模拟的 WebGL2 渲染器
      const glContext = canvas.getContext('webgl2');
      if (glContext) {
        const gl = new WebGLRenderer(canvas);
        console.log("Using primary WebGL 2.0 Renderer (Emulated FP64)");
        return gl;
      }
    } catch(e) {
      console.warn("WebGL initialization failed", e);
    }
    
    // 如果用户的浏览器实在不支持 WebGL2，则回退到 Web Worker
    console.log("Using ultimate fallback JavaScript Web Worker Renderer");
    return new WorkerRenderer(canvas);
  }
}
