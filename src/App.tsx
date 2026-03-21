import { useEffect, useRef, useState, useCallback } from "react";

import Mandelbrot from "./components/Mandelbrot";
import Julia from "./components/Julia";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  const [useMandelbrot, setUseMandelbrot] = useState(false);
  
  const defaultZoom = Math.min(window.innerWidth / 4, window.innerHeight / 3);
  const [view, setView] = useState({
    zoom: defaultZoom,
    offsetX: 0, // Julia default
    offsetY: 0
  });

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isInteracting = useRef(false);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const computeFractal = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;

    const mandelbrot = new Mandelbrot(width, height);
    const julia = new Julia(width, height);
    const pix = useMandelbrot ? mandelbrot : julia;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    let offset = 0;
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [r, g, b, a] = pix.getPixel(i, j, view);
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [dimensions, useMandelbrot, view]);

  useEffect(() => {
    if (transform.scale === 1 && transform.x === 0 && transform.y === 0) {
      // Small timeout to allow the browser to paint reset transforms if we're unfreezing
      const timer = setTimeout(() => computeFractal(), 0);
      return () => clearTimeout(timer);
    }
  }, [computeFractal, transform]);

  const commitTransform = useCallback((currentTransform: {x: number, y: number, scale: number}) => {
    setView(prevView => {
      const { width, height } = dimensions;
      const canvasX = (width / 2 - currentTransform.x) / currentTransform.scale;
      const canvasY = (height / 2 - currentTransform.y) / currentTransform.scale;
      
      const newOffsetX = (canvasX - width / 2) / prevView.zoom + prevView.offsetX;
      const newOffsetY = (canvasY - height / 2) / prevView.zoom + prevView.offsetY;
      
      return {
        zoom: prevView.zoom * currentTransform.scale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
      };
    });
    setTransform({ x: 0, y: 0, scale: 1 });
    isInteracting.current = false;
  }, [dimensions]);

  useEffect(() => {
    if (isInteracting.current) {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        commitTransform(transform);
      }, 200);
    }
  }, [transform, commitTransform]);

  const handleWheel = (e: React.WheelEvent) => {
    isInteracting.current = true;
    const zoomFactor = Math.pow(0.99, e.deltaY);
    
    setTransform(prev => {
      const newScale = prev.scale * zoomFactor;
      const cx = e.clientX;
      const cy = e.clientY;
      const newX = cx - (cx - prev.x) * zoomFactor;
      const newY = cy - (cy - prev.y) * zoomFactor;
      return { scale: newScale, x: newX, y: newY };
    });
  };

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

    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#000', position: 'relative', touchAction: 'none' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10, fontFamily: 'sans-serif' }}>
        <button 
          onClick={() => {
            setUseMandelbrot(false);
            setView({ zoom: defaultZoom, offsetX: 0, offsetY: 0 });
            setTransform({ x: 0, y: 0, scale: 1 });
            isInteracting.current = false;
          }} 
          style={{ padding: '8px 16px', background: !useMandelbrot ? '#007bff' : '#333', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 4 }}
        >
          Julia
        </button>
        <button 
          onClick={() => {
            setUseMandelbrot(true);
            setView({ zoom: defaultZoom, offsetX: -0.5, offsetY: 0 });
            setTransform({ x: 0, y: 0, scale: 1 });
            isInteracting.current = false;
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
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        Your browser does not support the HTML5 canvas element
      </canvas>
    </div>
  );
}

export default App;
