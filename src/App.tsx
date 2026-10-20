import { useCallback, useEffect, useRef, useState } from "react";
import { RendererFactory } from "./renderers/RendererFactory";
import { IFractalRenderer, RenderQuality, ViewState } from "./renderers/RendererType";
import { clampZoom, fitZoom, pinchView, zoomView } from "./view";

/** Delay before the full-resolution pass after a wheel gesture ends. */
const WHEEL_SETTLE_MS = 120;
/** A single tap has no action here, so the window can be generous. */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 40;
const DOUBLE_TAP_FACTOR = 2.5;
const ZOOM_ANIMATION_MS = 260;
/** Pointer travel (CSS px) under which a press still counts as a tap. */
const TAP_SLOP = 12;

interface Point {
  x: number;
  y: number;
}

type Gesture =
  | { type: "pan"; last: Point }
  | { type: "pinch"; startView: ViewState; startMid: Point; startDistance: number };

const QUALITY_RANK: Record<RenderQuality, number> = { preview: 0, full: 1 };

function initialView(isMandelbrot: boolean, width: number, height: number): ViewState {
  return {
    zoom: fitZoom(width, height),
    offsetX: isMandelbrot ? -0.5 : 0,
    offsetY: 0,
  };
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IFractalRenderer | null>(null);

  const sizeRef = useRef({ width: window.innerWidth, height: window.innerHeight, dpr: 1 });
  const viewRef = useRef<ViewState>(initialView(false, window.innerWidth, window.innerHeight));

  const [isMandelbrot, setIsMandelbrot] = useState(false);
  const modeRef = useRef(isMandelbrot);

  const pointers = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const panTravel = useRef(0);
  const multiTouch = useRef(false);
  const tapRef = useRef({ time: 0, x: 0, y: 0 });

  const frameRef = useRef<number | null>(null);
  const pendingQuality = useRef<RenderQuality | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const animationRef = useRef<number | null>(null);

  const renderNow = useCallback((quality: RenderQuality) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const { width, height, dpr } = sizeRef.current;
    void renderer.render(viewRef.current, modeRef.current, {
      quality,
      pixelRatio: dpr,
      cssWidth: width,
      cssHeight: height,
    });
  }, []);

  // Coalesces repeated inputs into one frame and keeps the best requested tier.
  const scheduleRender = useCallback(
    (quality: RenderQuality) => {
      const pending = pendingQuality.current;
      if (!pending || QUALITY_RANK[quality] > QUALITY_RANK[pending]) {
        pendingQuality.current = quality;
      }
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingQuality.current ?? "full";
        pendingQuality.current = null;
        renderNow(next);
      });
    },
    [renderNow]
  );

  const finishInteraction = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleTimer.current = undefined;
    scheduleRender("full");
  }, [scheduleRender]);

  const settleSoon = useCallback(() => {
    clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = undefined;
      scheduleRender("full");
    }, WHEEL_SETTLE_MS);
  }, [scheduleRender]);

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const applySize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      rendererRef.current?.maxPixelRatio ?? 2
    );
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));

    const previous = sizeRef.current;
    sizeRef.current = { width, height, dpr };
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    if (
      previous.width !== width ||
      previous.height !== height ||
      previous.dpr !== dpr
    ) {
      scheduleRender("full");
    }
  }, [scheduleRender]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const renderer = await RendererFactory.createRenderer(canvas);
      if (!active) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      applySize();
      renderNow("full");
    };
    void init();

    return () => {
      active = false;
      cancelAnimation();
      clearTimeout(settleTimer.current);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [applySize, cancelAnimation, renderNow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Fires on rotation, mobile browser bar collapse and window resizes; also
    // catches devicePixelRatio changes after a browser-level zoom.
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    window.addEventListener("resize", applySize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applySize);
    };
  }, [applySize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimation();
      const { width, height } = sizeRef.current;
      // Trackpad pinch arrives as ctrl+wheel with smaller deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.005));
      viewRef.current = zoomView(
        viewRef.current,
        viewRef.current.zoom * factor,
        e.clientX,
        e.clientY,
        width,
        height
      );
      scheduleRender("preview");
      settleSoon();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [cancelAnimation, scheduleRender, settleSoon]);

  const animateView = useCallback(
    (target: ViewState, anchor?: Point) => {
      const { width, height } = sizeRef.current;
      const from = viewRef.current;
      const endZoom = clampZoom(target.zoom);
      if (endZoom === from.zoom && !anchor) {
        viewRef.current = { ...target, zoom: endZoom };
        scheduleRender("full");
        return;
      }

      // World point pinned under the finger for the whole animation.
      const anchorX = anchor?.x ?? 0;
      const anchorY = anchor?.y ?? 0;
      const anchorWorldX = anchor ? (anchorX - width / 2) / from.zoom + from.offsetX : 0;
      const anchorWorldY = anchor ? (anchorY - height / 2) / from.zoom + from.offsetY : 0;
      const fromLog = Math.log(from.zoom);
      const toLog = Math.log(endZoom);

      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / ZOOM_ANIMATION_MS);
        const eased = 1 - (1 - t) ** 3;
        const zoom = Math.exp(fromLog + (toLog - fromLog) * eased);
        viewRef.current = anchor
          ? {
              zoom,
              offsetX: anchorWorldX - (anchorX - width / 2) / zoom,
              offsetY: anchorWorldY - (anchorY - height / 2) / zoom,
            }
          : {
              zoom,
              offsetX: from.offsetX + (target.offsetX - from.offsetX) * eased,
              offsetY: from.offsetY + (target.offsetY - from.offsetY) * eased,
            };
        scheduleRender("preview");
        if (t < 1) {
          animationRef.current = requestAnimationFrame(step);
        } else {
          animationRef.current = null;
          scheduleRender("full");
        }
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [scheduleRender]
  );

  const beginGesture = useCallback(() => {
    const samples = [...pointers.current.values()];
    if (samples.length === 1) {
      gestureRef.current = { type: "pan", last: { ...samples[0] } };
    } else if (samples.length === 2) {
      const [a, b] = samples;
      gestureRef.current = {
        type: "pinch",
        startView: viewRef.current,
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startDistance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    } else {
      gestureRef.current = null;
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) {
      // A pinch must never be mistaken for the first half of a double tap.
      multiTouch.current = true;
    } else {
      panTravel.current = 0;
    }
    cancelAnimation();
    beginGesture();
    containerRef.current?.classList.add("is-dragging");
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const samples = pointers.current;
    if (!samples.has(e.pointerId)) return;
    samples.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const gesture = gestureRef.current;
    if (!gesture) return;
    const { width, height } = sizeRef.current;

    if (gesture.type === "pan" && samples.size === 1) {
      const point = samples.get(e.pointerId)!;
      const dx = point.x - gesture.last.x;
      const dy = point.y - gesture.last.y;
      gesture.last = { ...point };
      panTravel.current += Math.abs(dx) + Math.abs(dy);

      const view = viewRef.current;
      viewRef.current = {
        zoom: view.zoom,
        offsetX: view.offsetX - dx / view.zoom,
        offsetY: view.offsetY - dy / view.zoom,
      };
      scheduleRender("preview");
    } else if (gesture.type === "pinch" && samples.size >= 2) {
      const [a, b] = [...samples.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      panTravel.current += TAP_SLOP;
      viewRef.current = pinchView(
        gesture.startView,
        gesture.startMid,
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance / Math.max(gesture.startDistance, 1),
        width,
        height
      );
      scheduleRender("preview");
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, allowTap: boolean) => {
    const samples = pointers.current;
    if (!samples.has(e.pointerId)) return;
    samples.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (samples.size > 0) {
      // Re-anchor the remaining finger so the view does not jump.
      beginGesture();
      return;
    }

    gestureRef.current = null;
    containerRef.current?.classList.remove("is-dragging");

    // Double-tap/double-click detection lives on the pointer path so mouse and
    // touch share one code path (and one zoom animation).
    const wasMultiTouch = multiTouch.current;
    multiTouch.current = false;
    if (allowTap && !wasMultiTouch && panTravel.current < TAP_SLOP) {
      const now = performance.now();
      const last = tapRef.current;
      const isDoubleTap =
        now - last.time < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_SLOP;

      if (isDoubleTap) {
        tapRef.current = { time: 0, x: 0, y: 0 };
        const { width, height } = sizeRef.current;
        const home = fitZoom(width, height);
        const current = viewRef.current;
        if (current.zoom > home * 6) {
          // Zooming out around the tap would keep the pan offset; go home.
          animateView(initialView(modeRef.current, width, height));
        } else {
          animateView(
            { ...current, zoom: current.zoom * DOUBLE_TAP_FACTOR },
            { x: e.clientX, y: e.clientY }
          );
        }
        return;
      }
      tapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }

    finishInteraction();
  };

  const switchMode = (mandelbrot: boolean) => {
    cancelAnimation();
    tapRef.current = { time: 0, x: 0, y: 0 };
    modeRef.current = mandelbrot;
    setIsMandelbrot(mandelbrot);
    const { width, height } = sizeRef.current;
    viewRef.current = initialView(mandelbrot, width, height);
    scheduleRender("full");
  };

  return (
    <div
      ref={containerRef}
      className="fractal"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endPointer(e, true)}
      onPointerCancel={(e) => endPointer(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="fractal__canvas">
        Your browser does not support the HTML5 canvas element
      </canvas>

      <div className="fractal__modes" role="group" aria-label="Fractal type">
        <button
          type="button"
          className="fractal__mode"
          aria-pressed={!isMandelbrot}
          onClick={() => switchMode(false)}
        >
          Julia
        </button>
        <button
          type="button"
          className="fractal__mode"
          aria-pressed={isMandelbrot}
          onClick={() => switchMode(true)}
        >
          Mandelbrot
        </button>
      </div>
    </div>
  );
}

export default App;
