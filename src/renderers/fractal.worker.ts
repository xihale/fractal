import Mandelbrot from '../components/Mandelbrot';
import Julia from '../components/Julia';
import type { WorkerRenderRequest } from './RendererType';

let currentId = 0;

/** Roughly one frame worth of work before yielding to the message queue. */
const SLICE_MS = 12;

self.onmessage = (e: MessageEvent<WorkerRenderRequest>) => {
  const { id, view, width, height, isMandelbrot, step } = e.data;
  currentId = id; // Update to latest request

  const rw = Math.ceil(width / step);
  const rh = Math.ceil(height / step);

  const buffer = new Uint8ClampedArray(rw * rh * 4);
  const pix = isMandelbrot ? new Mandelbrot(width, height) : new Julia(width, height);

  let offset = 0;
  let j = 0;

  const renderChunk = () => {
    // A newer request arrived; drop this render instead of finishing it.
    if (currentId !== id) return;

    const chunkStart = performance.now();
    while (j < height) {
      for (let i = 0; i < width; i += step) {
        const [r, g, b, a] = pix.getPixel(i, j, view);
        buffer[offset++] = r;
        buffer[offset++] = g;
        buffer[offset++] = b;
        buffer[offset++] = a;
      }
      j += step;

      if (performance.now() - chunkStart > SLICE_MS) {
        setTimeout(renderChunk, 0);
        return;
      }
    }

    self.postMessage({ id, buffer, width: rw, height: rh }, { transfer: [buffer.buffer] });
  };

  renderChunk();
};
