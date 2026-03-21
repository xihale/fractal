import { IFractalRenderer, ViewState } from './RendererType';

export class WorkerRenderer implements IFractalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker;
  private currentId = 0;
  private pendingResolves: Map<number, () => void> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error("Could not get 2d context for WorkerRenderer");
    this.ctx = ctx;

    this.worker = new Worker(new URL('./fractal.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(e: MessageEvent) {
    const { id, buffer, width, height } = e.data;
    const resolve = this.pendingResolves.get(id);
    if (resolve) {
      if (width > 0 && height > 0) {
        const imgData = new ImageData(buffer, width, height);
        
        if (width === this.canvas.width && height === this.canvas.height) {
          this.ctx.putImageData(imgData, 0, 0);
        } else {
          // Low-res pass step
          const offscreen = document.createElement("canvas");
          offscreen.width = width;
          offscreen.height = height;
          const offCtx = offscreen.getContext("2d", { alpha: false });
          if (offCtx) {
            offCtx.putImageData(imgData, 0, 0);
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(offscreen, 0, 0, width, height, 0, 0, this.canvas.width, this.canvas.height);
          }
        }
      }
      resolve();
      this.pendingResolves.delete(id);
    }
  }

  render(view: ViewState, isMandelbrot: boolean, isLowRes: boolean = false): Promise<void> {
    // Resolve and clear previous pending renders to prevent memory leaks
    this.pendingResolves.forEach(resolve => resolve());
    this.pendingResolves.clear();

    return new Promise((resolve) => {
      const id = ++this.currentId;
      this.pendingResolves.set(id, resolve);
      const step = isLowRes ? 8 : 1;
      
      this.worker.postMessage({
        id,
        view,
        width: this.canvas.width,
        height: this.canvas.height,
        isMandelbrot,
        step
      });
    });
  }

  destroy() {
    this.worker.terminate();
  }
}
