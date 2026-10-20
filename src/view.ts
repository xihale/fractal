import { ViewState } from './renderers/RendererType';

export interface ScreenPoint {
  x: number;
  y: number;
}

/** JS Number precision breaks down past ~1e14, so zoom is clamped to 1e13. */
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 1e13;

/** World units visible across the smaller viewport axis. */
const VISIBLE_SPAN = 3;

/** Zoom that fits the fractal on screens of any aspect ratio, including phones. */
export const fitZoom = (width: number, height: number) =>
  Math.min(width, height) / VISIBLE_SPAN;

export const clampZoom = (zoom: number) =>
  Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);

/** Zoom keeping the world point under (anchorX, anchorY) fixed on screen. */
export function zoomView(
  view: ViewState,
  targetZoom: number,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number
): ViewState {
  const zoom = clampZoom(targetZoom);
  const worldX = (anchorX - width / 2) / view.zoom + view.offsetX;
  const worldY = (anchorY - height / 2) / view.zoom + view.offsetY;
  return {
    zoom,
    offsetX: worldX - (anchorX - width / 2) / zoom,
    offsetY: worldY - (anchorY - height / 2) / zoom,
  };
}

/**
 * Two-finger gesture result: scale around the start midpoint while letting that
 * same world point travel with the moving midpoint (so pinching also pans).
 */
export function pinchView(
  start: ViewState,
  startMid: ScreenPoint,
  mid: ScreenPoint,
  scale: number,
  width: number,
  height: number
): ViewState {
  const zoom = clampZoom(start.zoom * scale);
  const anchorX = (startMid.x - width / 2) / start.zoom + start.offsetX;
  const anchorY = (startMid.y - height / 2) / start.zoom + start.offsetY;
  return {
    zoom,
    offsetX: anchorX - (mid.x - width / 2) / zoom,
    offsetY: anchorY - (mid.y - height / 2) / zoom,
  };
}
