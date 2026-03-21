import Complex from "./Complex";

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
    const C = new Complex(
      (px - this.width / 2) / view.zoom + view.offsetX,
      (py - this.height / 2) / view.zoom + view.offsetY
    );
    const Z = new Complex(0, 0);

    while (Z.distanse2() < 4 && iterations < 300) {
      Z.square().add(C);
      ++iterations;
    }
    return [iterations, iterations, iterations, 255];
  }
}