'use client';

/**
 * Client-routed page-transition engine — layout-mounted, persistent across RSC
 * navigations. Single document (no MPA frontier, no anti-flash hold script):
 *
 *   intercept internal <a> click → COVER animation on the target
 *     → startTransition(() => router.push(href)) — the RSC subtree swaps inside the
 *       still-mounted target; the cover animation's `both` fill holds it at the
 *       leave-end frame so the incoming content never flashes
 *     → on the resulting pathname change → REVEAL animation → clear.
 *
 * Animated target per preset:
 *   - CSS presets    → the persistent `#yc-route` wrapper (real page content).
 *   - Shader presets → the persistent `#ycode-curtain` overlay (WebGL canvas portal).
 *
 * Inert inside an iframe (preview/builder) so it never hijacks the editor's navigation.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import {
  CURTAIN_ID,
  ROUTE_ID,
  CURTAIN_PHASE_ATTR,
  isShaderTransition,
  type PageTransitionConfig,
} from '@/lib/page-transitions';

const ShaderCurtainCanvas = dynamic(() => import('./ShaderCurtainCanvas'), { ssr: false });

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Resolve an anchor to the internal same-tab path it would navigate to, or null. */
function internalHrefFor(a: Element | null): string | null {
  if (!a || a.hasAttribute('download')) return null;
  const t = a.getAttribute('target');
  if (t && t !== '_self') return null;
  if (!a.getAttribute('href')) return null;
  let url: URL;
  try { url = new URL((a as HTMLAnchorElement).href, window.location.href); } catch { return null; }
  if (url.origin !== window.location.origin) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Same-document hash jump or identical URL — let the browser handle it natively.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search + url.hash;
}

export default function PageCurtain({ config }: { config: PageTransitionConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [shaderMounted, setShaderMounted] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const navigatingRef = useRef(false);
  const pendingRevealRef = useRef(false);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const gaSeenRef = useRef(false);
  const shader = isShaderTransition(config.type);

  // Preview/builder renders the published page inside an iframe — never hijack the
  // editor's navigation there. Active only in the top-level window.
  const active = typeof window !== 'undefined' && window.top === window.self;

  // Resolve the animated target once hydrated: overlay for shaders, route wrapper else.
  useEffect(() => {
    if (!active) return;
    setTarget(document.getElementById(shader ? CURTAIN_ID : ROUTE_ID));
  }, [active, shader]);

  // PREFETCH the RSC payload on hover/focus so the new route is warm by the time the
  // cover animation ends.
  useEffect(() => {
    if (!active) return;
    const prefetch = (e: Event) => {
      const href = internalHrefFor((e.target as Element | null)?.closest?.('a') ?? null);
      if (!href || prefetchedRef.current.has(href)) return;
      prefetchedRef.current.add(href);
      try { router.prefetch(href); } catch { /* ignore */ }
    };
    document.addEventListener('mouseover', prefetch, { passive: true });
    document.addEventListener('focusin', prefetch, { passive: true });
    return () => {
      document.removeEventListener('mouseover', prefetch);
      document.removeEventListener('focusin', prefetch);
    };
  }, [active, router]);

  // COVER: intercept internal link clicks, play the leave animation, then navigate.
  useEffect(() => {
    if (!active || !target) return;
    const onClick = (e: MouseEvent) => {
      if (navigatingRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = internalHrefFor((e.target as Element | null)?.closest?.('a') ?? null);
      if (!href) return;

      e.preventDefault();
      navigatingRef.current = true;

      const go = () => {
        pendingRevealRef.current = true;
        startTransition(() => router.push(href));
      };

      if (prefersReducedMotion()) { go(); return; }

      if (shader) setShaderMounted(true);
      target.addEventListener('animationend', go, { once: true });
      // Fallback in case animationend never fires (e.g. display quirks).
      window.setTimeout(go, config.duration + 150);
      // Next frame so the shader canvas has a tick to appear before the cover starts.
      requestAnimationFrame(() => target.setAttribute(CURTAIN_PHASE_ATTR, 'cover'));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, target, shader, config.duration, router, startTransition]);

  // GA SPA pageview on every route change after the first paint (no reload fires it now).
  useEffect(() => {
    if (!gaSeenRef.current) { gaSeenRef.current = true; return; }
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 'page_view', { page_path: pathname });
  }, [pathname]);

  // REVEAL: after the route commits, animate the target back in. Guarded so it only
  // runs for a navigation this engine initiated (not back/forward or external pushes).
  useEffect(() => {
    if (!pendingRevealRef.current || !target) return;
    pendingRevealRef.current = false;

    const finish = () => {
      target.removeAttribute(CURTAIN_PHASE_ATTR);
      setShaderMounted(false);
      navigatingRef.current = false;
    };
    if (prefersReducedMotion()) { finish(); return; }

    const raf = requestAnimationFrame(() => {
      target.setAttribute(CURTAIN_PHASE_ATTR, 'reveal');
      target.addEventListener('animationend', finish, { once: true });
      window.setTimeout(finish, config.duration + 200);
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, target, config.duration]);

  if (shader && shaderMounted && target) {
    return createPortal(<ShaderCurtainCanvas config={config} />, target);
  }
  return null;
}
