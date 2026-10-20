import {
  BAILOUT_SQ,
  INTERIOR_RGB_255,
  MAX_ITERATIONS,
  paletteColor,
  smoothEscape,
} from '../renderers/palette';

export default class Julia {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getPixel(
    px: number,
    py: number,
    view: { zoom: number; offsetX: number; offsetY: number }
  ): [number, number, number, number] {
    const cx = 0.285;
    const cy = 0.01;
    let zx = (px - this.width / 2) / view.zoom + view.offsetX;
    let zy = (py - this.height / 2) / view.zoom + view.offsetY;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      const zx2 = zx * zx;
      const zy2 = zy * zy;
      if (zx2 + zy2 >= BAILOUT_SQ) break;
      const tempX = zx2 - zy2 + cx;
      zy = 2 * zx * zy + cy;
      zx = tempX;
      ++iterations;
    }

    if (iterations >= MAX_ITERATIONS) {
      return [...INTERIOR_RGB_255, 255];
    }
    return [...paletteColor(smoothEscape(iterations, zx * zx + zy * zy)), 255];
  }
}
