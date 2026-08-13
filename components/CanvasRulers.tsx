'use client';

/**
 * CanvasRulers Component
 *
 * Graduated px rulers along the top and left edges of the canvas (Shift+R).
 * Coordinates are the page's own CSS pixels (document space), so the labels
 * stay meaningful at any zoom: on-screen position = origin + value * scale.
 *
 * Ticks are painted with repeating background gradients (one 1px line per tile)
 * rather than DOM nodes — only the labels are real elements, and they're pooled
 * the same way SelectionOverlay pools its outlines.
 */

import React, { useCallback, useEffect, useRef } from 'react';

/** Ruler thickness in screen px. */
const BAND = 20;
/** Candidate label intervals, in page px. */
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
/** One 1px line at the left/top of each tile. */
const TICK_H = 'linear-gradient(to right, currentColor 0 1px, transparent 1px)';
const TICK_V = 'linear-gradient(to bottom, currentColor 0 1px, transparent 1px)';

const mod = (a: number, n: number) => ((a % n) + n) % n;

interface CanvasRulersProps {
  /** Reference to the canvas iframe element */
  iframeElement: HTMLIFrameElement | null;
  /** Scroll container the iframe lives in */
  containerElement: HTMLElement | null;
  /** Current zoom level (percentage) */
  zoom: number;
}

export function CanvasRulers({ iframeElement, containerElement, zoom }: CanvasRulersProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hBandRef = useRef<HTMLDivElement>(null);
  const vBandRef = useRef<HTMLDivElement>(null);
  const hLabelsRef = useRef<HTMLDivElement>(null);
  const vLabelsRef = useRef<HTMLDivElement>(null);

  /** Pool + position the label spans for one ruler. */
  const paintLabels = useCallback((
    host: HTMLDivElement | null,
    values: number[],
    place: (el: HTMLElement, value: number) => void,
  ) => {
    if (!host) return;
    while (host.children.length < values.length) {
      const span = document.createElement('span');
      span.className = 'absolute text-[9px] leading-none tabular-nums';
      host.appendChild(span);
    }
    for (let i = values.length; i < host.children.length; i++) {
      (host.children[i] as HTMLElement).style.display = 'none';
    }
    values.forEach((value, i) => {
      const el = host.children[i] as HTMLElement;
      el.style.display = 'block';
      el.textContent = String(value);
      place(el, value);
    });
  }, []);

  const draw = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !iframeElement) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const iframeRect = iframeElement.getBoundingClientRect();
    const view = iframeElement.contentWindow;
    const scale = zoom / 100;

    // Page origin in wrapper coordinates. Both scroll axes are folded in: the
    // outer container scroll moves the iframe rect, the iframe's own scroll
    // moves the document under it.
    const originX = iframeRect.left - wrapperRect.left - (view?.scrollX ?? 0) * scale;
    const originY = iframeRect.top - wrapperRect.top - (view?.scrollY ?? 0) * scale;

    // Label every `major` page px (≥ 60 screen px apart), tick every `minor`.
    const major = STEPS.find((s) => s * scale >= 60) ?? STEPS[STEPS.length - 1];
    const minor = (major / 5) * scale >= 6 ? major / 5 : major;

    const hBand = hBandRef.current;
    if (hBand) {
      hBand.style.backgroundImage = `${TICK_H}, ${TICK_H}`;
      hBand.style.backgroundSize = `${major * scale}px 9px, ${minor * scale}px 5px`;
      hBand.style.backgroundPosition = `${mod(originX, major * scale)}px bottom, ${mod(originX, minor * scale)}px bottom`;
      hBand.style.backgroundRepeat = 'repeat-x';
    }

    const vBand = vBandRef.current;
    if (vBand) {
      vBand.style.backgroundImage = `${TICK_V}, ${TICK_V}`;
      vBand.style.backgroundSize = `9px ${major * scale}px, 5px ${minor * scale}px`;
      vBand.style.backgroundPosition = `right ${mod(originY, major * scale)}px, right ${mod(originY, minor * scale)}px`;
      vBand.style.backgroundRepeat = 'repeat-y';
    }

    // Only label positions inside the page and clear of the other ruler.
    const values = (origin: number, extent: number) => {
      const out: number[] = [];
      const first = Math.max(0, Math.ceil((BAND - origin) / scale / major) * major);
      for (let v = first; origin + v * scale <= extent; v += major) out.push(v);
      return out;
    };

    paintLabels(hLabelsRef.current, values(originX, wrapperRect.width), (el, v) => {
      el.style.left = `${originX + v * scale + 3}px`;
      el.style.top = '3px';
    });
    paintLabels(vLabelsRef.current, values(originY, wrapperRect.height), (el, v) => {
      el.style.top = `${originY + v * scale + 3}px`;
      el.style.left = '3px';
      // Latin runs rotate sideways in vertical writing mode — same as Figma.
      el.style.writingMode = 'vertical-rl';
    });
  }, [iframeElement, zoom, paintLabels]);

  useEffect(() => {
    if (!iframeElement || !containerElement) return;

    let rafId: number | null = null;
    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        draw();
      });
    };
    schedule();

    const iframeDoc = iframeElement.contentDocument;
    containerElement.addEventListener('scroll', schedule, { passive: true });
    iframeDoc?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('viewportChange', schedule);

    // The iframe is re-centered/resized on viewport switches and content growth.
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(iframeElement);
    resizeObserver.observe(containerElement);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      containerElement.removeEventListener('scroll', schedule);
      iframeDoc?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('viewportChange', schedule);
    };
  }, [iframeElement, containerElement, draw]);

  return (
    <div ref={wrapperRef} className="absolute inset-0 pointer-events-none overflow-hidden z-40 text-muted-foreground">
      <div
        ref={hBandRef}
        className="absolute top-0 inset-x-0 bg-background/95 border-b border-border"
        style={{ height: BAND }}
      />
      <div
        ref={hLabelsRef} className="absolute top-0 inset-x-0"
        style={{ height: BAND }}
      />
      <div
        ref={vBandRef}
        className="absolute inset-y-0 left-0 bg-background/95 border-r border-border"
        style={{ width: BAND }}
      />
      <div
        ref={vLabelsRef} className="absolute inset-y-0 left-0"
        style={{ width: BAND }}
      />
      {/* Corner square hides the overlap of the two bands */}
      <div
        className="absolute top-0 left-0 bg-background border-b border-r border-border"
        style={{ width: BAND, height: BAND }}
      />
    </div>
  );
}

export default React.memo(CanvasRulers);
