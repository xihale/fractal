import { useEffect, useRef, useState, useCallback } from "react";

import Mandelbrot from "./components/Mandelbrot";
import Julia from "./components/Julia";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const dimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const [dimensions, setDimensions] = useState(dimensionsRef.current);
  
  const [useMandelbrot, setUseMandelbrot] = useState(false);
  const useMandelbrotRef = useRef(useMandelbrot);
  
  const defaultZoom = Math.min(window.innerWidth / 4, window.innerHeight / 3);
  const viewRef = useRef({
    zoom: defaultZoom,
    offsetX: 0, 
    offsetY: 0
  });

  const isInteracting = useRef(false);
  const debounceTimer = useRef<number | null>(null);
  const renderFrameRef = useRef<number | null>(null);

  const computeFractal = useCallback((isLowRes: boolean = false, overrideMandelbrot?: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const { width, height } = dimensionsRef.current;
    const view = viewRef.current;

    const isMandelbrot = overrideMandelbrot ?? useMandelbrotRef.current;
    const mandelbrot = new Mandelbrot(width, height);
    const julia = new Julia(width, height);
    const pix = isMandelbrot ? mandelbrot : julia;

    const step = isLowRes ? 8 : 1;
    const rw = Math.ceil(width / step);
    const rh = Math.ceil(height / step);

    const imgData = new ImageData(rw, rh);
    const data = imgData.data;

    let offset = 0;
    for (let j = 0; j < height; j += step) {
      for (let i = 0; i < width; i += step) {
        const [r, g, b, a] = pix.getPixel(i, j, view);
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
      }
    }

    if (step === 1) {
      ctx.putImageData(imgData, 0, 0);
    } else {
      const offscreen = document.createElement("canvas");
      offscreen.width = rw;
      offscreen.height = rh;
      const offCtx = offscreen.getContext("2d", { alpha: false });
      if (offCtx) {
        offCtx.putImageData(imgData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreen, 0, 0, rw, rh, 0, 0, rw * step, rh * step);
      }
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const nextDim = { width: window.innerWidth, height: window.innerHeight };
      dimensionsRef.current = nextDim;
      setDimensions(nextDim);
      computeFractal(false);
    };
    window.addEventListener('resize', handleResize);
    
    // Initial render
    computeFractal(false);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerLowResRender = useCallback(() => {
    if (!renderFrameRef.current) {
      renderFrameRef.current = requestAnimationFrame(() => {
        computeFractal(true);
        renderFrameRef.current = null;
      });
    }
    
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      computeFractal(false);
      isInteracting.current = false;
    }, 150);
  }, [computeFractal]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    isInteracting.current = true;
    
    // deltaY is usually 100 for wheel ticks.
    // 0.995^100 ≈ 0.6. This is a good zoom rate.
    const zoomFactor = Math.pow(0.995, e.deltaY);
    const view = viewRef.current;
    const { width, height } = dimensionsRef.current;
    
    const cx = (e.clientX - width / 2) / view.zoom + view.offsetX;
    const cy = (e.clientY - height / 2) / view.zoom + view.offsetY;
    
    const newZoom = view.zoom * zoomFactor;
    
    const newOffsetX = cx - (e.clientX - width / 2) / newZoom;
    const newOffsetY = cy - (e.clientY - height / 2) / newZoom;
    
    viewRef.current = { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
    
    triggerLowResRender();
  }, [triggerLowResRender]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const [isDragging, setIsDragging] = useState(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    isInteracting.current = true;
    
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    const view = viewRef.current;
    viewRef.current = {
      ...view,
      offsetX: view.offsetX - dx / view.zoom,
      offsetY: view.offsetY - dy / view.zoom
    };
    
    triggerLowResRender();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', position: 'relative', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10, fontFamily: 'sans-serif' }}>
        <button 
          onClick={() => {
            setUseMandelbrot(false);
            useMandelbrotRef.current = false;
            viewRef.current = { zoom: Math.min(window.innerWidth / 4, window.innerHeight / 3), offsetX: 0, offsetY: 0 };
            computeFractal(false, false);
          }} 
          style={{ padding: '8px 16px', background: !useMandelbrot ? '#007bff' : '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 4 }}
        >
          Julia
        </button>
        <button 
          onClick={() => {
            setUseMandelbrot(true);
            useMandelbrotRef.current = true;
            viewRef.current = { zoom: Math.min(window.innerWidth / 4, window.innerHeight / 3), offsetX: -0.5, offsetY: 0 };
            computeFractal(false, true);
          }} 
          style={{ padding: '8px 16px', background: useMandelbrot ? '#007bff' : '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 4 }}
        >
          Mandelbrot
        </button>
      </div>

      <canvas 
        ref={canvasRef} 
        width={dimensions.width} 
        height={dimensions.height}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        Your browser does not support the HTML5 canvas element
      </canvas>
    </div>
  );
}

export default App;
