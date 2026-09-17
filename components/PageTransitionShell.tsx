import type { ReactNode } from 'react';
import PageCurtain from '@/components/PageCurtain';
import { getSettingByKey } from '@/lib/repositories/settingsRepository';
import { normalizePageTransition, generatePageTransitionCss, isShaderTransition, DEFAULT_PAGE_TRANSITION } from '@/lib/page-transitions';

/**
 * Site-wide page transitions — rendered once by the document layout so the curtain
 * engine + overlay persist across client (router.push) navigations, instead of
 * remounting per page.
 */
export default async function PageTransitionShell({ children }: { children: ReactNode }) {
  // try/catch so an unreachable DB simply disables transitions.
  let pageTransition = { ...DEFAULT_PAGE_TRANSITION, enabled: false };
  try {
    pageTransition = normalizePageTransition(await getSettingByKey('page_transitions'));
  } catch {
    // Supabase not configured — transitions off
  }
  const { css: transitionCss, rgbFilterDx } = generatePageTransitionCss(pageTransition);
  const shaderTransition = isShaderTransition(pageTransition.type);

  return (
    <>
      {/* Page-transition CSS + surfaces, injected once at the layout so they survive
          the RSC subtree swap. Shader presets need the overlay; CSS presets animate
          the persistent #yc-route wrapper below. */}
      {transitionCss && (
        <>
          <style id="ycode-view-transitions" dangerouslySetInnerHTML={{ __html: transitionCss }} />
          {shaderTransition && <div id="ycode-curtain" aria-hidden="true" />}
          {rgbFilterDx !== null && (
            <svg
              width="0" height="0"
              aria-hidden="true" style={{ position: 'absolute' }}
            >
              <filter
                id="ycode-rgb-split" x="-20%"
                y="-20%" width="140%"
                height="140%" colorInterpolationFilters="sRGB"
              >
                <feColorMatrix
                  in="SourceGraphic" type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"
                />
                <feOffset
                  in="r" dx={rgbFilterDx}
                  dy="0" result="ro"
                />
                <feColorMatrix
                  in="SourceGraphic" type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"
                />
                <feColorMatrix
                  in="SourceGraphic" type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"
                />
                <feOffset
                  in="b" dx={-rgbFilterDx}
                  dy="0" result="bo"
                />
                <feBlend
                  in="ro" in2="g"
                  mode="screen" result="rg"
                />
                <feBlend
                  in="rg" in2="bo"
                  mode="screen"
                />
              </filter>
            </svg>
          )}
        </>
      )}
      {/* Persistent, transform-able wrapper that survives the RSC route swap (the
          per-page #ybody unmounts, so it can't be the CSS-preset target). */}
      <div id="yc-route">{children}</div>
      {pageTransition.enabled && <PageCurtain config={pageTransition} />}
    </>
  );
}
