/**
 * Generate Page Metadata
 *
 * SERVER-ONLY: This module uses server-only utilities and should never be imported in client code.
 */

import 'server-only';

import { cache } from 'react';
import type { Metadata } from 'next';
import type { Asset, Page } from '@/types';
import type { CollectionItemWithValues } from '@/types';
import { resolveInlineVariables, resolveImageUrl } from '@/lib/resolve-cms-variables';
import { getSettingsByKeys } from '@/lib/repositories/settingsRepository';
import { getAssetById } from '@/lib/repositories/assetRepository';
import { buildSvgDataUrl, getAssetProxyUrl } from '@/lib/asset-utils';
import { generateColorVariablesCss } from '@/lib/repositories/colorVariableRepository';
import { getSiteBaseUrl } from '@/lib/url-utils';
import {
  getCanonicalUrl,
  getRobotsDirectives,
  isIndexablePage,
  type SeoGovernanceContext,
} from '@/lib/seo-governance';

// ── Global page settings ──────────────────────────────────────────────────────

/**
 * Global page render settings fetched once per page render.
 */
export interface GlobalPageSettings {
  googleSiteVerification?: string | null;
  globalCanonicalUrl?: string | null;
  gaMeasurementId?: string | null;
  publishedCss?: string | null;
  colorVariablesCss?: string | null;
  globalCustomCodeHead?: string | null;
  globalCustomCodeBody?: string | null;
  ycodeBadge?: boolean;
  faviconUrl?: string | null;
  faviconMimeType?: string | null;
  webClipUrl?: string | null;
  webClipMimeType?: string | null;
  /** Global og:site_name — used when the page does not set its own og_site_name. */
  ogSiteName?: string | null;
  /** Organization name for JSON-LD Organization schema (Phase 2). */
  schemaOrgName?: string | null;
  /** Absolute URL of organization logo for JSON-LD Organization schema (Phase 2). */
  schemaOrgLogoUrl?: string | null;
}

/** @deprecated Use GlobalPageSettings instead */
export type GlobalSeoSettings = GlobalPageSettings;

// ── Generate metadata options ─────────────────────────────────────────────────

export interface GenerateMetadataOptions {
  /** Include [Preview] prefix in title */
  isPreview?: boolean;
  /** Fallback title if page has no name */
  fallbackTitle?: string;
  /** Fallback description if page has no SEO description */
  fallbackDescription?: string;
  /** Collection item for resolving field variables (for dynamic pages) */
  collectionItem?: CollectionItemWithValues;
  /** Current page path for canonical URL */
  pagePath?: string;
  /** Pre-fetched global SEO settings (avoids duplicate fetches) */
  globalSeoSettings?: GlobalSeoSettings;
  /** Tenant ID for multi-tenant deployments */
  tenantId?: string;
  /** Primary domain URL (e.g. https://example.com) for metadataBase */
  primaryDomainUrl?: string;
  /**
   * True when the page is password-protected and the visitor has not unlocked it.
   * When true, noindex is forced regardless of page settings.
   * Note: the caller typically returns early with a minimal metadata object
   * before reaching generatePageMetadata; this flag is provided for completeness
   * and future use.
   */
  isPasswordProtected?: boolean;
}

// ── Fetch global settings ─────────────────────────────────────────────────────

/**
 * Resolve a usable URL for favicon/web-clip assets, falling back to an
 * inline data URL for SVGs stored without a public_url/storage_path.
 */
function resolveIconAssetUrl(asset: Asset): string | null {
  const proxyOrPublic = getAssetProxyUrl(asset) || asset.public_url || null;
  if (proxyOrPublic) return proxyOrPublic;

  if (asset.mime_type === 'image/svg+xml' && asset.content) {
    return buildSvgDataUrl(asset.content, asset.width, asset.height);
  }

  return null;
}

async function fetchGlobalPageSettingsImpl(isPreview = false): Promise<GlobalPageSettings> {
  const settings = await getSettingsByKeys([
    'google_site_verification',
    'global_canonical_url',
    'ga_measurement_id',
    'published_css',
    'custom_code_head',
    'custom_code_body',
    'ycode_badge',
    'favicon_asset_id',
    'web_clip_asset_id',
    'og_site_name',
    'schema_org_name',
    'schema_org_logo_url',
  ]);

  // Fetch favicon and web clip asset URLs if IDs are set
  // In preview mode, read draft assets so the favicon shows before publishing.
  let faviconUrl: string | null = null;
  let faviconMimeType: string | null = null;
  let webClipUrl: string | null = null;
  let webClipMimeType: string | null = null;
  const isAssetPublished = !isPreview;

  if (settings.favicon_asset_id) {
    try {
      const asset = await getAssetById(settings.favicon_asset_id, isAssetPublished);
      if (asset) {
        faviconUrl = resolveIconAssetUrl(asset);
        faviconMimeType = asset.mime_type || null;
      }
    } catch {
      // Ignore errors fetching favicon
    }
  }

  if (settings.web_clip_asset_id) {
    try {
      const asset = await getAssetById(settings.web_clip_asset_id, isAssetPublished);
      if (asset) {
        webClipUrl = resolveIconAssetUrl(asset);
        webClipMimeType = asset.mime_type || null;
      }
    } catch {
      // Ignore errors fetching web clip
    }
  }

  const colorVariablesCss = await generateColorVariablesCss();

  return {
    googleSiteVerification: settings.google_site_verification || null,
    globalCanonicalUrl: settings.global_canonical_url || null,
    gaMeasurementId: settings.ga_measurement_id || null,
    publishedCss: settings.published_css || null,
    colorVariablesCss,
    globalCustomCodeHead: settings.custom_code_head || null,
    globalCustomCodeBody: settings.custom_code_body || null,
    ycodeBadge: settings.ycode_badge ?? true,
    faviconUrl,
    faviconMimeType,
    webClipUrl,
    webClipMimeType,
    ogSiteName: settings.og_site_name || null,
    schemaOrgName: settings.schema_org_name || null,
    schemaOrgLogoUrl: settings.schema_org_logo_url || null,
  };
}

/**
 * Fetch all global page settings in a single database query
 * Includes SEO settings, published CSS, and global custom code
 * Wrapped with React cache to deduplicate within the same request (non-preview only)
 */
const fetchGlobalPageSettingsCached = cache(async (): Promise<GlobalPageSettings> => {
  return fetchGlobalPageSettingsImpl();
});

export async function fetchGlobalPageSettings(isPreview = false): Promise<GlobalPageSettings> {
  if (isPreview) {
    // Preview mode: bypass cache and read draft assets
    return fetchGlobalPageSettingsImpl(true);
  }
  return fetchGlobalPageSettingsCached();
}

/** @deprecated Use fetchGlobalPageSettings instead */
export const fetchGlobalSeoSettings = fetchGlobalPageSettingsCached;

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Generate Next.js metadata from a page object.
 *
 * Handles: title, description, Open Graph (type / site_name / locale / url / image),
 * Twitter Card, canonical URL, robots directives, Google site verification, favicons.
 *
 * SEO governance rules (priority: page > global > fallback):
 * - Canonical: page.settings.seo.canonical_override > globalCanonicalUrl + path
 * - og:site_name: page.settings.seo.og_site_name > global og_site_name setting
 * - og:type: page.settings.seo.og_type > 'website'
 * - Robots: noindex flag | error page | preview | password-protected → noindex
 */
export async function generatePageMetadata(
  page: Page,
  options: GenerateMetadataOptions = {}
): Promise<Metadata> {
  const {
    isPreview = false,
    fallbackTitle,
    fallbackDescription,
    collectionItem,
    pagePath,
    primaryDomainUrl,
    isPasswordProtected = false,
  } = options;

  const seo = page.settings?.seo;
  const isErrorPage = page.error_page !== null;

  // ── Title ──────────────────────────────────────────────────────────────────
  let title = seo?.title || page.name || fallbackTitle || 'Page';
  if (collectionItem && seo?.title) {
    title = resolveInlineVariables(seo.title, collectionItem) || page.name || fallbackTitle || 'Page';
  }
  if (isPreview) title = `[Preview] ${title}`;

  // ── Description ────────────────────────────────────────────────────────────
  let description = seo?.description || fallbackDescription || `${page.name} - Built with Ycode`;
  if (collectionItem && seo?.description) {
    description =
      resolveInlineVariables(seo.description, collectionItem) ||
      fallbackDescription ||
      `${page.name} - Built with Ycode`;
  }

  // ── Base metadata ──────────────────────────────────────────────────────────
  const metadata: Metadata = { title, description };

  // ── Global settings & derived values (skipped in preview) ─────────────────
  let siteBaseUrl: string | null = null;
  let canonicalUrl: string | null = null;
  let globalSettings: GlobalPageSettings = {};

  // Always fetch global settings — preview mode reads draft assets so the
  // favicon and web clip render before the user publishes.
  globalSettings = options.globalSeoSettings || (await fetchGlobalPageSettings(isPreview));

  if (!isPreview) {
    siteBaseUrl = getSiteBaseUrl({
      globalCanonicalUrl: globalSettings.globalCanonicalUrl,
      primaryDomainUrl,
    });

    // Google site verification
    if (globalSettings.googleSiteVerification) {
      metadata.verification = { google: globalSettings.googleSiteVerification };
    }

    // Canonical URL — via governance (page override > global + path)
    const govCtx: SeoGovernanceContext = {
      page,
      isPreview,
      isPasswordProtected,
      pagePath,
      globalCanonicalUrl: globalSettings.globalCanonicalUrl,
      primaryDomainUrl,
    };
    canonicalUrl = getCanonicalUrl(govCtx);
    if (canonicalUrl) {
      metadata.alternates = { canonical: canonicalUrl };
    }
  }

  // Add custom favicon and web clip (apple-touch-icon) — applies to preview too.
  // Default favicon is handled by app/icon.svg
  if (globalSettings.faviconUrl || globalSettings.webClipUrl) {
    metadata.icons = {};
    if (globalSettings.faviconUrl) {
      metadata.icons.icon = globalSettings.faviconMimeType
        ? { url: globalSettings.faviconUrl, type: globalSettings.faviconMimeType }
        : globalSettings.faviconUrl;
    }
    if (globalSettings.webClipUrl) {
      metadata.icons.apple = globalSettings.webClipMimeType
        ? { url: globalSettings.webClipUrl, type: globalSettings.webClipMimeType }
        : globalSettings.webClipUrl;
    }
  }

  // ── OG image resolution ────────────────────────────────────────────────────
  let imageUrl: string | null = null;
  if (seo?.image && !isErrorPage) {
    imageUrl = await resolveImageUrl(seo.image, collectionItem);
    // Social crawlers require absolute og:image URLs.
    if (imageUrl && imageUrl.startsWith('/') && siteBaseUrl) {
      imageUrl = `${siteBaseUrl}${imageUrl}`;
    }
  }

  // ── Open Graph (not for error pages) ──────────────────────────────────────
  if (!isErrorPage) {
    // og:site_name: page override > global setting > omit
    const ogSiteName =
      seo?.og_site_name?.trim() ||
      (globalSettings as GlobalPageSettings).ogSiteName ||
      undefined;

    const ogLocale = seo?.og_locale || undefined;

    // og:type cast: stored value used at runtime; 'website' satisfies TS discriminant.
    // Full article/product schema injection is Phase 2 (SchemaGenerator).
    const ogType = (seo?.og_type ?? 'website') as 'website';

    metadata.openGraph = {
      title,
      description,
      type: ogType,
      ...(ogSiteName ? { siteName: ogSiteName } : {}),
      ...(ogLocale ? { locale: ogLocale } : {}),
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    };

    if (imageUrl) {
      metadata.openGraph.images = [{ url: imageUrl, width: 1200, height: 630 }];
      metadata.twitter = {
        card: 'summary_large_image',
        title,
        description,
        images: [imageUrl],
      };
    }
  }

  // ── Robots — via governance ────────────────────────────────────────────────
  const govCtxForRobots: SeoGovernanceContext = {
    page,
    isPreview,
    isPasswordProtected,
  };
  const robots = getRobotsDirectives(govCtxForRobots);
  const hasGranularDirectives =
    robots['max-snippet'] !== undefined ||
    robots['max-image-preview'] !== undefined ||
    robots['max-video-preview'] !== undefined;

  // Only emit robots meta when page is not indexable OR when granular directives are set.
  if (!robots.index || hasGranularDirectives) {
    metadata.robots = robots;
  }

  return metadata;
}

// Re-export governance helpers so callers can use them without a second import.
export { isIndexablePage, getCanonicalUrl, getRobotsDirectives };
export type { SeoGovernanceContext, RobotsDirectives } from '@/lib/seo-governance';
