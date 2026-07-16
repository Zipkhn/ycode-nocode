import '@/app/site.css';
import type { Metadata } from 'next';
import RootLayoutShell, { defaultMetadata } from '@/components/RootLayoutShell';
import PageCurtain from '@/components/PageCurtain';
import { fetchGlobalPageSettings } from '@/lib/generate-page-metadata';
import { renderRootLayoutHeadCode } from '@/lib/parse-head-html';
import { loadCurrentTheme } from '@/lib/studio-theme-store';
import { renderStudioDynamicCss } from '@/lib/studio-css';
import { getSettingByKey } from '@/lib/repositories/settingsRepository';
import { normalizePageTransition, generatePageTransitionCss, isShaderTransition, DEFAULT_PAGE_TRANSITION } from '@/lib/page-transitions';

export async function generateMetadata(): Promise<Metadata> {
  if (process.env.SKIP_SETUP === 'true') {
    return defaultMetadata;
  }

  try {
    const globalSettings = await fetchGlobalPageSettings();
    const metadata: Metadata = { ...defaultMetadata };

    if (globalSettings.faviconUrl || globalSettings.webClipUrl) {
      metadata.icons = {};
      if (globalSettings.faviconUrl) {
        metadata.icons.icon = globalSettings.faviconUrl;
      }
      if (globalSettings.webClipUrl) {
        metadata.icons.apple = globalSettings.webClipUrl;
      }
    }

    return metadata;
  } catch {
    return defaultMetadata;
  }
}

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let headElements: React.ReactNode[] = [];

  // Cloud mode uses ISR with explicit tenantId — calling headers() here
  // would force all pages dynamic. Cloud injects global head code from PageRenderer instead.
  if (process.env.SKIP_SETUP !== 'true') {
    try {
      const globalSettings = await fetchGlobalPageSettings();
      if (globalSettings.globalCustomCodeHead) {
        headElements = renderRootLayoutHeadCode(globalSettings.globalCustomCodeHead);
      }
    } catch {
      // Supabase not configured — skip custom code
    }

    // Studio design system — inject the live theme (variables + bridges) from the
    // DB so theme edits reach the published site without a rebuild. Overrides the
    // stale build-time values from the global-theme.css bundle. Placed before
    // custom head code so the user's custom CSS can still override it.
    try {
      const css = renderStudioDynamicCss(await loadCurrentTheme());
      if (css.trim()) {
        headElements = [
          <style
            key="studio-theme" id="studio-theme"
            dangerouslySetInnerHTML={{ __html: css }}
          />,
          ...headElements,
        ];
      }
    } catch {
      // Supabase not configured — build-time bundle remains the fallback
    }
  }

  // Site-wide page transitions — read once at the layout so the curtain engine +
  // overlay persist across client (router.push) navigations, instead of remounting
  // per page. try/catch so an unreachable DB simply disables transitions.
  let pageTransition = { ...DEFAULT_PAGE_TRANSITION, enabled: false };
  try {
    pageTransition = normalizePageTransition(await getSettingByKey('page_transitions'));
  } catch {
    // Supabase not configured — transitions off
  }
  const { css: transitionCss, rgbFilterDx } = generatePageTransitionCss(pageTransition);
  const shaderTransition = isShaderTransition(pageTransition.type);

  // Published sites render text with the browser-default (`auto`) font
  // smoothing — matching legacy output. Forcing `antialiased` here would render
  // glyphs thinner/lighter than the original site.
  return (
    <RootLayoutShell headElements={headElements} bodyClassName="font-sans">
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
    </RootLayoutShell>
  );
}
