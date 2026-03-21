export default class Mandelbrot {
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
  ) {
    let iterations = 0;
    const cx = (px - this.width / 2) / view.zoom + view.offsetX;
    const cy = (py - this.height / 2) / view.zoom + view.offsetY;
    let zx = 0;
    let zy = 0;
    const maxIterations = 300;

    while (zx * zx + zy * zy < 4 && iterations < maxIterations) {
      const tempX = zx * zx - zy * zy + cx;
      zy = 2 * zx * zy + cy;
      zx = tempX;
      ++iterations;
    }
    return [iterations, iterations, iterations, 255];
  }
}