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
  ) {
    let iters = 0;
    const cx = 0.285;
    const cy = 0.01;
    let zx = (px - this.width / 2) / view.zoom + view.offsetX;
    let zy = (py - this.height / 2) / view.zoom + view.offsetY;
    const maxIterations = 300;

    function hslToRgb(h: number, s: number, l: number): [number, number, number, number] {
      s /= 100;
      l /= 100;
      const k = (n: number) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
      return [f(0), f(8), f(4), 255];
    }

    while (zx * zx + zy * zy < 4 && iters < maxIterations) {
      const tempX = zx * zx - zy * zy + cx;
      zy = 2 * zx * zy + cy;
      zx = tempX;
      ++iters;
    }

    if (iters === maxIterations) return [0, 0, 0, 255];
    return hslToRgb((iters / maxIterations) * 360 + 160, 90, 60);
  }
}
