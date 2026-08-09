'use client';

/**
 * SelectionOverlay Component
 *
 * Renders selection, hover, and parent outlines on top of the canvas iframe.
 * Uses direct DOM manipulation for instant updates during scrolling.
 *
 * Note: Drag initiation for sibling reordering is handled by the
 * useCanvasSiblingReorder hook, which listens to iframe mousedown events.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
interface SelectionOverlayProps {
  /** Reference to the canvas iframe element */
  iframeElement: HTMLIFrameElement | null;
  /** Reference to the container element for positioning */
  containerElement: HTMLElement | null;
  /** Currently selected layer ID */
  selectedLayerId: string | null;
  /** Parent layer ID (one level up from selected) */
  parentLayerId: string | null;
  /** Current zoom level (percentage) */
  zoom: number;
  /** Active sublayer index within a richText element (null = highlight whole layer) */
  activeSublayerIndex?: number | null;
  /** Active list item index within a list (null = highlight whole list block) */
  activeListItemIndex?: number | null;
}

export function SelectionOverlay({
  iframeElement,
  containerElement,
  selectedLayerId,
  parentLayerId,
  zoom,
  activeSublayerIndex,
  activeListItemIndex,
}: SelectionOverlayProps) {
  const hoveredLayerIdRef = useRef(useEditorStore.getState().hoveredLayerId);
  const activeUIState = useEditorStore((state) => state.activeUIState);
  const isStateActive = activeUIState !== 'neutral';
  // While the AI composer is in "reference a layer" mode, outlines turn teal to
  // signal the click will attach the layer to the chat rather than just select it.
  const isAiLayerPicking = useEditorStore((state) => state.isAiLayerPicking);
  // Canvas spacing overlay (Cmd+Shift+D)
  const isSpacingOverlay = useEditorStore((state) => state.isSpacingOverlay);
  // Held Alt+Shift "peeks" at spacing: the bands follow the cursor instead of
  // the selection, for as long as the modifiers are down.
  const [isSpacingPeek, setIsSpacingPeek] = useState(false);

  // Pick-mode uses a brighter, slightly thicker teal so the outline keeps
  // contrast over both light and dark page content (the muted badge teal washes
  // out on dark backgrounds). A faint dark ring (box-shadow) is added for extra
  // separation on light backgrounds.
  const SELECTED_OUTLINE_CLASS = isAiLayerPicking
    ? 'outline outline-1 outline-[#22c1de] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]'
    : isStateActive
      ? 'outline outline-1 outline-[#8dd92f]'
      : 'outline outline-1 outline-blue-500';
  const HOVERED_OUTLINE_CLASS = isAiLayerPicking
    ? 'outline outline-1 outline-[#22c1de] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]'
    : isStateActive
      ? 'outline outline-1 outline-[#8dd92f]/50'
      : 'outline outline-1 outline-blue-400/50';
  const PARENT_OUTLINE_CLASS = isAiLayerPicking
    ? 'outline outline-1 outline-dashed outline-[#22c1de]'
    : isStateActive
      ? 'outline outline-1 outline-dashed outline-[#8dd92f]'
      : 'outline outline-1 outline-dashed outline-blue-400';
  // Container refs for outline groups (supports multiple instances per layer ID)
  const selectedContainerRef = useRef<HTMLDivElement>(null);
  const hoveredContainerRef = useRef<HTMLDivElement>(null);
  const parentContainerRef = useRef<HTMLDivElement>(null);

  // Track drag/animation/resize state for scroll/mutation handlers
  const isDraggingRef = useRef(false);
  const isSliderAnimatingRef = useRef(false);
  const isSidebarResizingRef = useRef(false);

  const spacingContainerRef = useRef<HTMLDivElement>(null);

  const hideAllOutlines = useCallback(() => {
    if (selectedContainerRef.current) selectedContainerRef.current.style.display = 'none';
    if (hoveredContainerRef.current) hoveredContainerRef.current.style.display = 'none';
    if (parentContainerRef.current) parentContainerRef.current.style.display = 'none';
    if (spacingContainerRef.current) spacingContainerRef.current.style.display = 'none';
  }, []);

  /**
   * Paint the selected element's padding (inside the box) and margin (outside
   * it), Chrome DevTools colour convention: green for padding, orange for
   * margin. Bands are pooled children positioned in the same screen coordinate
   * space as the outlines above, so they inherit every listener already wired
   * up below (scroll, mutation, resize, zoom).
   */
  const updateSpacingOverlay = useCallback((
    container: HTMLDivElement | null,
    layerId: string | null,
    iframeDoc: Document,
    iframeElement: HTMLIFrameElement,
    containerElement: HTMLElement,
    scale: number,
  ) => {
    if (!container) return;

    // The body layer has no box of its own (#canvas-body is display:contents).
    const target = layerId && layerId !== 'body'
      ? iframeDoc.querySelector(`[data-layer-id="${layerId}"]`)
      : null;
    if (!target) {
      container.style.display = 'none';
      return;
    }

    const view = iframeElement.contentWindow;
    if (!view) {
      container.style.display = 'none';
      return;
    }

    const cs = view.getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const iframeRect = iframeElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();

    const top = iframeRect.top - containerRect.top + rect.top * scale;
    const left = iframeRect.left - containerRect.left + rect.left * scale;
    const width = rect.width * scale;
    const height = rect.height * scale;

    const num = (v: string) => parseFloat(v) || 0;
    const pad = { t: num(cs.paddingTop), r: num(cs.paddingRight), b: num(cs.paddingBottom), l: num(cs.paddingLeft) };
    const mar = { t: num(cs.marginTop), r: num(cs.marginRight), b: num(cs.marginBottom), l: num(cs.marginLeft) };

    // Inner height of the padding side-bands, so they don't overlap top/bottom.
    const sideTop = top + pad.t * scale;
    const sideHeight = Math.max(0, height - (pad.t + pad.b) * scale);

    type Band = { x: number; y: number; w: number; h: number; value: number; margin: boolean };
    const bands: Band[] = [
      { x: left, y: top, w: width, h: pad.t * scale, value: pad.t, margin: false },
      { x: left, y: top + height - pad.b * scale, w: width, h: pad.b * scale, value: pad.b, margin: false },
      { x: left, y: sideTop, w: pad.l * scale, h: sideHeight, value: pad.l, margin: false },
      { x: left + width - pad.r * scale, y: sideTop, w: pad.r * scale, h: sideHeight, value: pad.r, margin: false },
      { x: left, y: top - mar.t * scale, w: width, h: mar.t * scale, value: mar.t, margin: true },
      { x: left, y: top + height, w: width, h: mar.b * scale, value: mar.b, margin: true },
      { x: left - mar.l * scale, y: top, w: mar.l * scale, h: height, value: mar.l, margin: true },
      { x: left + width, y: top, w: mar.r * scale, h: height, value: mar.r, margin: true },
      // Negative margins are dropped below rather than drawn inverted.
    ].filter(b => b.value > 0 && b.w > 0 && b.h > 0);

    container.style.display = 'block';

    while (container.children.length < bands.length) {
      const div = document.createElement('div');
      div.className = 'absolute flex items-center justify-center text-[10px] leading-none font-medium text-black/70 tabular-nums overflow-hidden';
      container.appendChild(div);
    }
    for (let i = bands.length; i < container.children.length; i++) {
      (container.children[i] as HTMLElement).style.display = 'none';
    }

    bands.forEach((band, idx) => {
      const child = container.children[idx] as HTMLElement;
      child.style.display = 'flex';
      child.style.top = `${band.y}px`;
      child.style.left = `${band.x}px`;
      child.style.width = `${band.w}px`;
      child.style.height = `${band.h}px`;
      child.style.background = band.margin ? 'rgba(246, 178, 107, 0.45)' : 'rgba(147, 196, 125, 0.45)';
      // The value is the CSS px the user set, not the zoomed screen size. Hide it
      // when the band is too small to hold the label legibly.
      child.textContent = band.w >= 22 && band.h >= 12 ? String(Math.round(band.value)) : '';
    });
  }, []);

  // Update outline(s) for all elements matching a layer ID
  const updateOutline = useCallback((
    container: HTMLDivElement | null,
    layerId: string | null,
    iframeDoc: Document,
    iframeElement: HTMLIFrameElement,
    containerElement: HTMLElement,
    scale: number,
    outlineClass: string,
    blockIndex?: number | null,
    listItemIndex?: number | null,
  ) => {
    if (!container) return;

    if (!layerId) {
      container.style.display = 'none';
      return;
    }

    const isBody = layerId === 'body';
    let targetElements: Element[];
    if (isBody) {
      // The Body layer's wrapper (#canvas-body) uses display:contents and has
      // no box. Its visible representation on the canvas is the entire iframe
      // surface. We render a single outline using the iframe element's rect
      // below, but we still need a non-empty list to drive the loop.
      targetElements = [iframeElement];
    } else if (blockIndex !== undefined && blockIndex !== null && listItemIndex !== undefined && listItemIndex !== null) {
      targetElements = Array.from(iframeDoc.querySelectorAll(
        `[data-layer-id="${layerId}"] [data-block-index="${blockIndex}"] [data-list-item-index="${listItemIndex}"]`
      ));
    } else if (blockIndex !== undefined && blockIndex !== null) {
      targetElements = Array.from(iframeDoc.querySelectorAll(`[data-layer-id="${layerId}"] [data-block-index="${blockIndex}"]`));
    } else {
      targetElements = Array.from(iframeDoc.querySelectorAll(`[data-layer-id="${layerId}"]`));
    }
    if (targetElements.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    const iframeRect = iframeElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();

    // The canvas is scaled with `transform: scale()` on a wrapper, so inner
    // element rects (measured via getBoundingClientRect inside the iframe) are
    // reported in the iframe's own unscaled layout coordinates in every browser.
    // Multiplying by the scale factor (`scale` = zoom/100) maps them to on-screen
    // pixels. NOTE: do NOT derive the multiplier from iframeRect.width /
    // innerRootWidth — the iframe element width (canvas width) and the content
    // layout width can differ, which over-scaled outlines on Safari.

    // Ensure we have the right number of child outline divs
    while (container.children.length < targetElements.length) {
      const div = document.createElement('div');
      div.className = `absolute ${outlineClass}`;
      container.appendChild(div);
    }
    // Hide excess children
    for (let i = targetElements.length; i < container.children.length; i++) {
      (container.children[i] as HTMLElement).style.display = 'none';
    }

    targetElements.forEach((targetElement, idx) => {
      const child = container.children[idx] as HTMLElement;

      let top: number;
      let left: number;
      let width: number;
      let height: number;
      if (isBody) {
        // Body outline always covers the full visible canvas (iframe area).
        top = iframeRect.top - containerRect.top;
        left = iframeRect.left - containerRect.left;
        width = iframeRect.width;
        height = iframeRect.height;
      } else {
        const elementRect = targetElement.getBoundingClientRect();
        top = iframeRect.top - containerRect.top + (elementRect.top * scale);
        left = iframeRect.left - containerRect.left + (elementRect.left * scale);
        width = elementRect.width * scale;
        height = elementRect.height * scale;
      }

      child.className = `absolute ${outlineClass}`;
      child.style.display = 'block';
      child.style.top = `${top}px`;
      child.style.left = `${left}px`;
      child.style.width = `${width}px`;
      child.style.height = `${height}px`;
    });
  }, []);

  // Track the Alt+Shift peek modifiers. The cursor sits over the iframe while
  // peeking, so its document is what receives the key events — listen in both.
  useEffect(() => {
    const iframeDoc = iframeElement?.contentDocument;
    const targets: Document[] = iframeDoc ? [document, iframeDoc] : [document];
    const sync = (e: Event) => setIsSpacingPeek((e as KeyboardEvent).altKey && (e as KeyboardEvent).shiftKey);
    const clear = () => setIsSpacingPeek(false);

    targets.forEach((t) => {
      t.addEventListener('keydown', sync);
      t.addEventListener('keyup', sync);
    });
    // A modifier released while the window is unfocused never fires keyup.
    window.addEventListener('blur', clear);

    return () => {
      targets.forEach((t) => {
        t.removeEventListener('keydown', sync);
        t.removeEventListener('keyup', sync);
      });
      window.removeEventListener('blur', clear);
    };
  }, [iframeElement]);

  /** Which layer the spacing bands describe: the hovered one while peeking,
   * otherwise the selection when the persistent overlay is on. */
  const spacingLayerId = useCallback(() => {
    if (isAiLayerPicking) return null;
    if (isSpacingPeek) return hoveredLayerIdRef.current;
    return isSpacingOverlay ? selectedLayerId : null;
  }, [isAiLayerPicking, isSpacingPeek, isSpacingOverlay, selectedLayerId]);

  /** Resolve iframe state needed to position an outline. Returns null when
   * outlines must be hidden (during slider animation, sidebar resize, or when
   * the iframe isn't ready). */
  const getOutlineContext = useCallback(() => {
    if (isSliderAnimatingRef.current || isSidebarResizingRef.current) return null;
    if (!iframeElement || !containerElement) return null;
    const iframeDoc = iframeElement.contentDocument;
    if (!iframeDoc) return null;
    return { iframeDoc, iframeElement, containerElement, scale: zoom / 100 };
  }, [iframeElement, containerElement, zoom]);

  // Update just the hovered outline. Used on every hover store change so the
  // outline tracks the cursor at the full RAF rate without the ~3× DOM work
  // of refreshing selected/parent outlines that haven't moved.
  const updateHoveredOutline = useCallback(() => {
    const ctx = getOutlineContext();
    if (!ctx) {
      hideAllOutlines();
      return;
    }
    const hovered = hoveredLayerIdRef.current;
    // In pick mode the selection outline is hidden, so highlight whatever is
    // hovered — even the already-selected layer — for a focused picking cursor.
    const effectiveHoveredId = isAiLayerPicking
      ? hovered
      : hovered !== selectedLayerId ? hovered : null;
    updateOutline(hoveredContainerRef.current, effectiveHoveredId, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale, HOVERED_OUTLINE_CLASS);

    // While peeking, the bands track the cursor at the same rate as the hover
    // outline rather than waiting for the next scroll/mutation pass.
    if (isSpacingPeek) {
      updateSpacingOverlay(spacingContainerRef.current, hovered, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale);
    }
  }, [getOutlineContext, hideAllOutlines, selectedLayerId, updateOutline, updateSpacingOverlay, isSpacingPeek, HOVERED_OUTLINE_CLASS, isAiLayerPicking]);

  // Update all outlines. Called whenever selection/parent change, on scroll,
  // viewport switches, drag start/end, and on iframe layout shifts (image
  // loads, font swaps, etc.) detected by the ResizeObserver below.
  const updateAllOutlines = useCallback((skipSolidBorders = false) => {
    const ctx = getOutlineContext();
    if (!ctx) {
      hideAllOutlines();
      return;
    }

    updateSpacingOverlay(
      spacingContainerRef.current, spacingLayerId(),
      ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale,
    );

    // Pick mode: strip selection/parent outlines for a focused picking UX and
    // show only the layer currently under the cursor.
    if (isAiLayerPicking) {
      if (selectedContainerRef.current) selectedContainerRef.current.style.display = 'none';
      if (parentContainerRef.current) parentContainerRef.current.style.display = 'none';
      updateOutline(hoveredContainerRef.current, hoveredLayerIdRef.current, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale, HOVERED_OUTLINE_CLASS);
      return;
    }

    // Update selected outline (skip during drag)
    if (!skipSolidBorders) {
      updateOutline(selectedContainerRef.current, selectedLayerId, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale, SELECTED_OUTLINE_CLASS, activeSublayerIndex, activeListItemIndex);

      const hovered = hoveredLayerIdRef.current;
      const effectiveHoveredId = hovered !== selectedLayerId ? hovered : null;
      updateOutline(hoveredContainerRef.current, effectiveHoveredId, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale, HOVERED_OUTLINE_CLASS);
    }

    // When a sublayer is active, show the parent richText layer with parent outline
    const effectiveParentId = activeSublayerIndex !== null && activeSublayerIndex !== undefined
      ? selectedLayerId
      : (parentLayerId !== selectedLayerId ? parentLayerId : null);
    updateOutline(parentContainerRef.current, effectiveParentId, ctx.iframeDoc, ctx.iframeElement, ctx.containerElement, ctx.scale, PARENT_OUTLINE_CLASS);
  }, [getOutlineContext, hideAllOutlines, selectedLayerId, parentLayerId, updateOutline, updateSpacingOverlay, spacingLayerId, activeSublayerIndex, activeListItemIndex, SELECTED_OUTLINE_CLASS, HOVERED_OUTLINE_CLASS, PARENT_OUTLINE_CLASS, isAiLayerPicking]);

  // Initial update and updates when IDs change. Selecting a layer can reveal a
  // previously hidden ancestor (display:none → visible) in the iframe's separate
  // React root, which commits a frame or two after this effect runs — so the
  // first measurement would land on the element's stale (hidden) rect. Re-run on
  // the next frame and once more shortly after so the outline tracks the revealed
  // element.
  useEffect(() => {
    updateAllOutlines();
    const rafId = requestAnimationFrame(() => updateAllOutlines());
    const timeoutId = setTimeout(() => updateAllOutlines(), 120);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [updateAllOutlines]);

  // Subscribe to hoveredLayerId changes without re-rendering. Uses a
  // leading + trailing throttle around `updateHoveredOutline` (the cheap
  // single-outline path): the first hover after an idle period runs
  // synchronously so the outline lands in the same frame as the mouse event,
  // and rapid cursor sweeps coalesce into one trailing update per RAF.
  // Selected/parent outlines stay accurate because the ResizeObserver below
  // catches layout shifts (image loads etc.) and triggers `updateAllOutlines`.
  useEffect(() => {
    let rafId: number | null = null;
    let lastDrawnId: string | null = hoveredLayerIdRef.current;
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (state.hoveredLayerId === hoveredLayerIdRef.current) return;
      hoveredLayerIdRef.current = state.hoveredLayerId;

      if (rafId !== null) return;

      lastDrawnId = state.hoveredLayerId;
      updateHoveredOutline();

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (hoveredLayerIdRef.current !== lastDrawnId) {
          lastDrawnId = hoveredLayerIdRef.current;
          updateHoveredOutline();
        }
      });
    });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unsubscribe();
    };
  }, [updateHoveredOutline]);

  // Set up scroll/resize/mutation listeners
  useEffect(() => {
    if (!iframeElement || !containerElement) return;

    const iframeDoc = iframeElement.contentDocument;
    if (!iframeDoc) return;

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    // Hide outlines during scroll, show after scroll ends
    const handleScroll = () => {
      hideAllOutlines();

      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Show outlines after scrolling stops (150ms delay)
      scrollTimeout = setTimeout(() => {
        // Skip solid borders if dragging
        updateAllOutlines(isDraggingRef.current);
      }, 150);
    };

    // MutationObserver for DOM changes inside iframe
    let mutationTimeout: ReturnType<typeof setTimeout> | null = null;
    let mutationRafId: number | null = null;
    const mutationObserver = new MutationObserver((mutations) => {
      const hasStructuralChange = mutations.some(m => m.type === 'childList');

      // Cancel any pending updates to avoid double-firing
      if (mutationTimeout) clearTimeout(mutationTimeout);
      if (mutationRafId) {
        cancelAnimationFrame(mutationRafId);
        mutationRafId = null;
      }

      if (hasStructuralChange) {
        // Structural DOM changes: defer update to let DOM settle
        // Don't hide outlines first — avoids blinking on re-selection
        mutationTimeout = setTimeout(() => {
          updateAllOutlines(isDraggingRef.current);
        }, 50);
      } else {
        // Attribute-only changes (class/style) - defer to next frame so
        // Tailwind Browser CDN has time to generate CSS for new classes
        // and the browser can reflow before we measure dimensions
        mutationRafId = requestAnimationFrame(() => {
          mutationRafId = requestAnimationFrame(() => {
            updateAllOutlines(isDraggingRef.current);
            mutationRafId = null;
          });
        });
      }
    });

    // Observe the iframe body for changes
    if (iframeDoc.body) {
      mutationObserver.observe(iframeDoc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }

    // ResizeObserver catches async layout shifts that MutationObserver misses
    // (image loads, font swaps, transitions). Coalesced into a RAF so a burst
    // of images loading at once only triggers one full outline refresh.
    let resizeRafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRafId !== null) return;
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        updateAllOutlines(isDraggingRef.current);
      });
    });
    if (iframeDoc.body) {
      resizeObserver.observe(iframeDoc.body);
    }
    // Also observe the iframe element itself. In component-edit mode the canvas
    // is vertically centered and its height tracks content, so revealing/hiding
    // a block resizes and re-centers the iframe — shifting every element's
    // on-screen position. Observing the element catches that move so outlines
    // re-measure to the new position (not just the body's internal size).
    resizeObserver.observe(iframeElement);

    // Hide outlines during viewport switch, show after transition settles
    let viewportTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleViewportChange = () => {
      hideAllOutlines();

      if (viewportTimeout) clearTimeout(viewportTimeout);

      // Show outlines after viewport transition settles
      viewportTimeout = setTimeout(() => {
        updateAllOutlines(isDraggingRef.current);
      }, 150);
    };

    // Add event listeners
    containerElement.addEventListener('scroll', handleScroll, { passive: true });
    iframeDoc.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    window.addEventListener('viewportChange', handleViewportChange);

    // Cleanup
    return () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (viewportTimeout) clearTimeout(viewportTimeout);
      if (mutationTimeout) clearTimeout(mutationTimeout);
      if (mutationRafId) cancelAnimationFrame(mutationRafId);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      containerElement.removeEventListener('scroll', handleScroll);
      iframeDoc.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('viewportChange', handleViewportChange);
    };
  }, [iframeElement, containerElement, updateAllOutlines, hideAllOutlines]);

  // Check if layer dragging is active (to hide selection during drag)
  const isDraggingLayerOnCanvas = useEditorStore((state) => state.isDraggingLayerOnCanvas);

  // Hide solid selection/hover outlines during drag, but keep dashed parent outline
  useEffect(() => {
    isDraggingRef.current = isDraggingLayerOnCanvas;

    if (isDraggingLayerOnCanvas) {
      hideAllOutlines();
      updateAllOutlines(true); // skipSolidBorders = true, re-shows parent outline
    } else {
      // Re-show all outlines when drag ends
      updateAllOutlines(false);
    }
  }, [isDraggingLayerOnCanvas, updateAllOutlines, hideAllOutlines]);

  // Hide outlines during slider transitions
  const isSliderAnimating = useEditorStore((state) => state.isSliderAnimating);
  const isCanvasContextMenuOpen = useEditorStore((state) => state.isCanvasContextMenuOpen);

  useEffect(() => {
    isSliderAnimatingRef.current = isSliderAnimating;
    if (isSliderAnimating) {
      hideAllOutlines();
    } else {
      updateAllOutlines();
    }
  }, [isSliderAnimating, updateAllOutlines, hideAllOutlines]);

  // Hide outlines during sidebar resize
  const isSidebarResizing = useEditorStore((state) => state.isSidebarResizing);

  useEffect(() => {
    isSidebarResizingRef.current = isSidebarResizing;
    if (isSidebarResizing) {
      hideAllOutlines();
    } else {
      updateAllOutlines();
    }
  }, [isSidebarResizing, hideAllOutlines, updateAllOutlines]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-40"
      style={isCanvasContextMenuOpen ? { display: 'none' } : undefined}
    >
      {/* Spacing bands (Cmd+Shift+D) - painted under the outlines */}
      <div ref={spacingContainerRef} style={{ display: 'none' }} />

      {/* Parent outline container (dashed) - visible during drag */}
      <div ref={parentContainerRef} style={{ display: 'none' }} />

      {/* Hover outline container - hidden during drag */}
      <div ref={hoveredContainerRef} style={{ display: 'none' }} />

      {/* Selection outline container - hidden during drag */}
      <div ref={selectedContainerRef} style={{ display: 'none' }} />
    </div>
  );
}

export default React.memo(SelectionOverlay);
