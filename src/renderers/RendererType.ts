export interface ViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface IFractalRenderer {
  render(view: ViewState, isMandelbrot: boolean, isLowRes?: boolean): Promise<void> | void;
  destroy(): void;
}
