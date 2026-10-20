export interface ViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** Rendering tier: coarse while the user moves, native resolution when idle. */
export type RenderQuality = 'preview' | 'full';

export interface RenderOptions {
  quality?: RenderQuality;
  /** Backing-store pixels per CSS pixel currently applied to the canvas. */
  pixelRatio?: number;
  /** Viewport size in CSS pixels. */
  cssWidth?: number;
  cssHeight?: number;
}

export interface IFractalRenderer {
  /**
   * Upper bound for the canvas backing-store density. Rendering cost grows with
   * pixel count, so high-DPI phones need this cap to stay interactive.
   */
  readonly maxPixelRatio: number;
  render(view: ViewState, isMandelbrot: boolean, options?: RenderOptions): Promise<void> | void;
  destroy(): void;
}

export interface WorkerRenderRequest {
  id: number;
  view: ViewState;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** Sampling stride in CSS pixels (4 while interacting, 1 when idle). */
  step: number;
  isMandelbrot: boolean;
}
