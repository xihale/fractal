import Mandelbrot from '../components/Mandelbrot';
import Julia from '../components/Julia';
import { ViewState } from './RendererType';

let currentId = 0;

self.onmessage = (e: MessageEvent<{
  id: number;
  view: ViewState;
  width: number;
  height: number;
  isMandelbrot: boolean;
  step: number; 
}>) => {
  const { id, view, width, height, isMandelbrot, step } = e.data;
  currentId = id; // Update to latest request
  
  const rw = Math.ceil(width / step);
  const rh = Math.ceil(height / step);
  
  const buffer = new Uint8ClampedArray(rw * rh * 4);
  const mandelbrot = new Mandelbrot(width, height);
  const julia = new Julia(width, height);
  const pix = isMandelbrot ? mandelbrot : julia;

  let offset = 0;
  let j = 0;

  function renderChunk() {
    // Abort if a continuous new request arrived
    if (currentId !== id) {
      return; 
    }

    const chunkStart = performance.now();
    let yielded = false;
    
    // Calculate for about 16ms before yielding
    while (j < height) {
      for (let i = 0; i < width; i += step) {
        const [r, g, b, a] = pix.getPixel(i, j, view);
        buffer[offset++] = r;
        buffer[offset++] = g;
        buffer[offset++] = b;
        buffer[offset++] = a;
      }
      j += step;
      
      if (performance.now() - chunkStart > 16) {
        setTimeout(renderChunk, 0);
        yielded = true;
        break;
      }
    }

    if (yielded) return;

    // Done calculating
    self.postMessage({ id, buffer, width: rw, height: rh }, { transfer: [buffer.buffer] });
  }

  renderChunk();
};
