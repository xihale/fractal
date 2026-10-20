import { IFractalRenderer } from './RendererType';
import { WebGLRenderer } from './WebGLRenderer';
import { WorkerRenderer } from './WorkerRenderer';

/** True when the device can create a WebGL2 context at all. */
function supportsWebGL2(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return false;
  // Release the probe context instead of leaving a GPU context allocated.
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

export class RendererFactory {
  static async createRenderer(canvas: HTMLCanvasElement): Promise<IFractalRenderer> {
    // Probe on a detached canvas: grabbing 'webgl2' on the real one would make
    // the 2D fallback impossible if renderer setup throws.
    if (supportsWebGL2()) {
      try {
        const gl = new WebGLRenderer(canvas);
        console.log("Using primary WebGL 2.0 Renderer (Emulated FP64)");
        return gl;
      } catch (e) {
        console.warn("WebGL initialization failed", e);
      }
    }

    console.log("Using ultimate fallback JavaScript Web Worker Renderer");
    return new WorkerRenderer(canvas);
  }
}
