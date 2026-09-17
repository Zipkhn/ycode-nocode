import '@/app/site.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import HreflangAlternateLinks from '@/components/HreflangAlternateLinks';
import PageTransitionShell from '@/components/PageTransitionShell';
import RootLayoutShell, { defaultMetadata } from '@/components/RootLayoutShell';
import { composeDocumentBodyClassName } from '@/lib/body-classes';
import { fetchGlobalPageSettings } from '@/lib/generate-page-metadata';
import { renderRootLayoutHeadCode } from '@/lib/parse-head-html';
import { resolvePageDocumentChrome } from '@/lib/resolve-page-head-code';
import { runWithYcodeStamp } from '@/lib/ycode-html-comment';
import { loadCurrentTheme } from '@/lib/studio-theme-store';
import { renderStudioDynamicCss } from '@/lib/studio-css';

const ycodeGeneratorMetadata: Metadata = {
  ...defaultMetadata,
  other: { generator: 'Ycode' },
};

interface SiteDocumentLayoutProps {
  children: ReactNode;
  /** BCP-47 language baked into `<html lang>` for the current URL. */
  lang: string;
  /**
   * Public pathname for this document (`/` or `/fr/about`). Used to inject
   * page-level custom `<head>` code, body-layer classes, and hreflang
   * without reading request headers.
   */
  pathname: string;
  /** Tenant to scope data fetches to (cloud). Omitted self-hosted. */
  tenantId?: string;
  /** Absolute site base URL for hreflang. Resolved by the caller. */
  baseUrl?: string | null;
  /** Site base URL used to absolutize asset URLs in custom head code. */
  primaryDomainUrl?: string | null;
  /** Publish time for the HTML source stamp. */
  publishedAt?: string | null;
  /** Site-wide custom `<head>` code, injected into the real document head. */
  globalCustomCodeHead?: string | null;
}

/**
 * Shared `<html>` document for published, preview, and pagination routes.
 * `lang`, `dir`, and `pathname` come from route params (or a rewrite's original
 * path) so cloud ISR can still emit them in the first HTML byte. Global
 * settings are injected by the caller so this stays tenant-agnostic.
 */
export default async function SiteDocumentLayout({
  children,
  lang,
  pathname,
  tenantId,
  baseUrl,
  primaryDomainUrl = null,
  publishedAt = null,
  globalCustomCodeHead = null,
}: SiteDocumentLayoutProps) {
  const headElements: ReactNode[] = [];
  let bodyClasses = '';

  try {
    const pageChrome = await resolvePageDocumentChrome(pathname, { tenantId, baseUrl, primaryDomainUrl });
    bodyClasses = pageChrome.bodyClasses;
    if (pageChrome.hreflang.length > 0) {
      headElements.push(
        <HreflangAlternateLinks
          key="hreflang"
          alternates={pageChrome.hreflang}
        />
      );
    }
    if (globalCustomCodeHead) {
      headElements.push(...renderRootLayoutHeadCode(globalCustomCodeHead));
    }
    if (pageChrome.customHead) {
      headElements.push(...renderRootLayoutHeadCode(pageChrome.customHead, 'page-head'));
    }
  } catch {
    // Supabase not configured — stamp still emits the Made in line
  }

  // Studio design system — inject the live theme (variables + bridges) from the
  // DB so theme edits reach the published site without a rebuild. Overrides the
  // stale build-time values from the global-theme.css bundle. Placed before
  // custom head code so the user's custom CSS can still override it.
  try {
    const css = renderStudioDynamicCss(await loadCurrentTheme());
    if (css.trim()) {
      headElements.unshift(
        <style
          key="studio-theme" id="studio-theme"
          dangerouslySetInnerHTML={{ __html: css }}
        />
      );
    }
  } catch {
    // Supabase not configured — build-time bundle remains the fallback
  }

  return runWithYcodeStamp(publishedAt, () => (
    <RootLayoutShell
      lang={lang}
      headElements={headElements}
      bodyClassName={composeDocumentBodyClassName(bodyClasses)}
    >
      <PageTransitionShell>{children}</PageTransitionShell>
    </RootLayoutShell>
  ));
}

export async function generateSiteMetadata(): Promise<Metadata> {
  if (process.env.SKIP_SETUP === 'true') {
    return ycodeGeneratorMetadata;
  }

  try {
    const globalSettings = await fetchGlobalPageSettings();
    const metadata: Metadata = { ...ycodeGeneratorMetadata };

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
    return ycodeGeneratorMetadata;
  }
}
