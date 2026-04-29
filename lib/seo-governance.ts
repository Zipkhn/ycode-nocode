/**
 * SEO Governance — centralized indexability and canonical rules.
 *
 * Pure functions: no server-only, no DB, no Next.js imports.
 * Fully testable in isolation.
 *
 * Priority convention (highest → lowest):
 *   page.settings.seo.*  >  global settings  >  computed fallback  >  omit
 */

import type { Page } from '@/types';

// ── Context ───────────────────────────────────────────────────────────────────

export interface SeoGovernanceContext {
  page: Page;
  /** True when the page is password-protected AND the visitor has not unlocked it. */
  isPasswordProtected?: boolean;
  /** True in preview/editor mode — forces noindex, no canonical. */
  isPreview?: boolean;
  /** Current page path, e.g. '/about' or '/blog/my-post'. */
  pagePath?: string;
  /** Global canonical base URL from settings (e.g. 'https://example.com'). */
  globalCanonicalUrl?: string | null;
  /** Primary domain from environment / deployment config. */
  primaryDomainUrl?: string | null;
}

// ── Robots directives ─────────────────────────────────────────────────────────

export interface RobotsDirectives {
  index: boolean;
  follow: boolean;
  'max-snippet'?: number;
  'max-image-preview'?: 'none' | 'standard' | 'large';
  'max-video-preview'?: number;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Whether a page should be indexed by search engines.
 *
 * Returns false when any of the following is true:
 * - preview/editor mode
 * - page is an error page (4xx/5xx)
 * - page has noindex enabled
 * - page is password-protected and not unlocked
 */
export function isIndexablePage(ctx: SeoGovernanceContext): boolean {
  const { page, isPasswordProtected = false, isPreview = false } = ctx;
  if (isPreview) return false;
  if (page.error_page != null) return false;
  if (page.settings?.seo?.noindex) return false;
  if (isPasswordProtected) return false;
  return true;
}

/**
 * Whether a page should appear in the auto-generated sitemap.
 *
 * Conservative: excludes noindex and error pages.
 * Does not check password protection — sitemap generation is a server-side
 * batch process with no per-request auth cookie.
 */
export function shouldAppearInSitemap(page: Page): boolean {
  if (page.error_page != null) return false;
  if (page.settings?.seo?.noindex) return false;
  return true;
}

/**
 * Compute the canonical URL for a page.
 *
 * Priority:
 *   1. page.settings.seo.canonical_override (absolute URL, verbatim)
 *   2. globalCanonicalUrl + pagePath
 *   3. primaryDomainUrl + pagePath
 *   4. null (no canonical emitted)
 *
 * Never emits a canonical in preview mode.
 */
export function getCanonicalUrl(ctx: SeoGovernanceContext): string | null {
  const { page, isPreview = false, pagePath, globalCanonicalUrl, primaryDomainUrl } = ctx;

  if (isPreview) return null;

  // Page-level override takes absolute priority.
  const override = page.settings?.seo?.canonical_override?.trim();
  if (override) return override;

  // Compute from base URL.
  const base = globalCanonicalUrl || primaryDomainUrl;
  if (!base || pagePath === undefined) return null;

  const cleanBase = base.replace(/\/$/, '');
  if (!pagePath || pagePath === '/') return cleanBase;
  return `${cleanBase}${pagePath.startsWith('/') ? pagePath : `/${pagePath}`}`;
}

/**
 * Build robots directives for a page.
 *
 * When not indexable: `{ index: false, follow: false }` — no granular directives.
 * When indexable: includes max-snippet / max-image-preview / max-video-preview
 * if explicitly set on the page.
 */
export function getRobotsDirectives(ctx: SeoGovernanceContext): RobotsDirectives {
  const indexable = isIndexablePage(ctx);
  const seo = ctx.page.settings?.seo;

  const directives: RobotsDirectives = {
    index: indexable,
    follow: indexable,
  };

  if (indexable && seo) {
    if (seo.max_snippet !== undefined) {
      directives['max-snippet'] = seo.max_snippet;
    }
    if (seo.max_image_preview !== undefined) {
      directives['max-image-preview'] = seo.max_image_preview;
    }
    if (seo.max_video_preview !== undefined) {
      directives['max-video-preview'] = seo.max_video_preview;
    }
  }

  return directives;
}
