import { useEffect, useRef, useState, useCallback } from "react";
import { RendererFactory } from "./renderers/RendererFactory";
import { IFractalRenderer, ViewState } from "./renderers/RendererType";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IFractalRenderer | null>(null);
  
  const dimensionsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const [dimensions, setDimensions] = useState(dimensionsRef.current);
  
  const [useMandelbrot, setUseMandelbrot] = useState(false);
  const useMandelbrotRef = useRef(useMandelbrot);
  
  const defaultZoom = Math.min(window.innerWidth / 4, window.innerHeight / 3);
  const viewRef = useRef<ViewState>({
    zoom: defaultZoom,
    offsetX: 0, 
    offsetY: 0
  });

  const isInteracting = useRef(false);
  const renderFrameRef = useRef<number | null>(null);

  const triggerRender = useCallback(async (isLowRes: boolean = false) => {
    if (!rendererRef.current) return;
    const view = viewRef.current;
    const isMandel = useMandelbrotRef.current;
    
    await rendererRef.current.render(view, isMandel, isLowRes);
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!canvasRef.current) return;
      const renderer = await RendererFactory.createRenderer(canvasRef.current);
      if (active) {
        rendererRef.current = renderer;
        triggerRender();
      } else {
        renderer.destroy();
      }
    };
    init();
    
    return () => {
      active = false;
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const nextDim = { width: window.innerWidth, height: window.innerHeight };
      dimensionsRef.current = nextDim;
      setDimensions(nextDim);
      
      requestAnimationFrame(() => {
        if (rendererRef.current) triggerRender();
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [triggerRender]);

  const debounceTimer = useRef<number | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    isInteracting.current = true;
    
    const zoomFactor = Math.pow(0.995, e.deltaY);
    const view = viewRef.current;
    const { width, height } = dimensionsRef.current;
    
    const cx = (e.clientX - width / 2) / view.zoom + view.offsetX;
    const cy = (e.clientY - height / 2) / view.zoom + view.offsetY;
    
    // JS Number precision breaks down past ~1e14, so we clamp zoom to 1e13.
    const MAX_ZOOM = 1e13;
    const MIN_ZOOM = 10;
    let newZoom = view.zoom * zoomFactor;
    newZoom = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
    
    const newOffsetX = cx - (e.clientX - width / 2) / newZoom;
    const newOffsetY = cy - (e.clientY - height / 2) / newZoom;
    
    viewRef.current = { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
    
    if (!renderFrameRef.current) {
      renderFrameRef.current = requestAnimationFrame(() => {
        triggerRender(true);
        renderFrameRef.current = null;
      });
    }

    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      triggerRender(false);
      isInteracting.current = false;
    }, 500); // 适中延迟，避免卡顿感同时足够敏捷
  }, [triggerRender]);

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
    
    if (!renderFrameRef.current) {
      renderFrameRef.current = requestAnimationFrame(() => {
        triggerRender(true);
        renderFrameRef.current = null;
      });
    }

    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      triggerRender(false);
      isInteracting.current = false;
    }, 300); // 移动停止后 300ms 刷新
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    triggerRender(false); 
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
            triggerRender(false);
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
            triggerRender(false);
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
