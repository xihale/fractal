import { IFractalRenderer, RenderOptions, RenderQuality, ViewState, WorkerRenderRequest } from './RendererType';

/** Sampling stride per quality tier, measured in CSS pixels. */
const QUALITY_STEP: Record<RenderQuality, number> = { preview: 4, full: 1 };

interface WorkerResponse {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export class WorkerRenderer implements IFractalRenderer {
  /** The JS renderer is CPU bound, so extra backing-store pixels only cost time. */
  readonly maxPixelRatio = 1;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker;
  private currentId = 0;
  /** Reused canvas for scaling coarse passes up to the backing store. */
  private scratch: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error("Could not get 2d context for WorkerRenderer");
    this.ctx = ctx;

    this.worker = new Worker(new URL('./fractal.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(e: MessageEvent<WorkerResponse>) {
    const { id, buffer, width, height } = e.data;
    // Superseded render; the worker already aborted it.
    if (id !== this.currentId || width <= 0 || height <= 0) return;

    const imgData = new ImageData(new Uint8ClampedArray(buffer), width, height);

    if (width === this.canvas.width && height === this.canvas.height) {
      this.ctx.putImageData(imgData, 0, 0);
      return;
    }

    this.scratch ??= document.createElement("canvas");
    const offscreen = this.scratch;
    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width;
      offscreen.height = height;
    }
    offscreen.getContext("2d", { alpha: false })!.putImageData(imgData, 0, 0);
    // Smooth upscaling hides the coarse grid while the user moves.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(offscreen, 0, 0, width, height, 0, 0, this.canvas.width, this.canvas.height);
  }

  render(view: ViewState, isMandelbrot: boolean, options: RenderOptions = {}): void {
    const width = options.cssWidth ?? this.canvas.clientWidth;
    const height = options.cssHeight ?? this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    const id = ++this.currentId;
    const request: WorkerRenderRequest = {
      id,
      view,
      width,
      height,
      step: QUALITY_STEP[options.quality ?? 'full'],
      isMandelbrot,
    };
    this.worker.postMessage(request);
  }

  destroy() {
    this.currentId++;
    this.worker.terminate();
  }
}
