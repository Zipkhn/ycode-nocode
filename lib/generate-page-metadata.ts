/**
 * Generate Page Metadata
 *
 * SERVER-ONLY: This module uses server-only utilities and should never be imported in client code.
 */

import 'server-only';

import { cache } from 'react';
import type { Metadata } from 'next';
import type { Asset, Locale, Page, PageFolder, Translation } from '@/types';
import type { CollectionItemWithValues } from '@/types';
import { resolveInlineVariables, resolveImageUrl } from '@/lib/resolve-cms-variables';
import { getSettingsByKeys } from '@/lib/repositories/settingsRepository';
import { getAssetById } from '@/lib/repositories/assetRepository';
import { getAllLocales } from '@/lib/repositories/localeRepository';
import { getAllPublishedPageFolders } from '@/lib/repositories/pageFolderRepository';
import { getValuesByItemIds } from '@/lib/repositories/collectionItemValueRepository';
import { getSlugTranslationsByLocale } from '@/lib/repositories/translationRepository';
import { buildSvgDataUrl, getAssetProxyUrl } from '@/lib/asset-utils';
import { generateColorVariablesCss } from '@/lib/repositories/colorVariableRepository';
import { buildPageHreflangAlternates, type HreflangAlternate } from '@/lib/hreflang-utils';
import { getTranslatableKey, getTranslatedAssetId, getTranslatedText } from '@/lib/locale-runtime';
import { buildAbsolutePageUrl, getSiteBaseUrl } from '@/lib/url-utils';
import {
  getCanonicalUrl,
  getRobotsDirectives,
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
  /** Per-locale translations, keyed `{source}:{id}:{content_key}`, for localized SEO */
  translations?: Record<string, Translation> | null;
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
 * Localization data needed to build per-page hreflang alternates.
 * Translations are keyed by locale ID, then by translatable key.
 */
interface HreflangDataset {
  locales: Locale[];
  folders: PageFolder[];
  translationsByLocale: Map<string, Record<string, Translation>>;
}

/**
 * Load published locales, folders and per-locale translations needed to build
 * hreflang alternates. Wrapped in React cache so it runs once per request even
 * when multiple metadata helpers ask for it. Returns a single locale only when
 * the site isn't multilingual, in which case callers skip hreflang.
 */
const fetchHreflangDataset = cache(async (): Promise<HreflangDataset> => {
  const [locales, folders] = await Promise.all([
    getAllLocales(true),
    getAllPublishedPageFolders(),
  ]);

  const translationsByLocale = new Map<string, Record<string, Translation>>();

  if (locales.length > 1) {
    for (const locale of locales) {
      if (locale.is_default) continue;
      // hreflang alternates only need slug rows to build localized URLs.
      const translations = await getSlugTranslationsByLocale(locale.id, true);
      const map: Record<string, Translation> = {};
      for (const t of translations) {
        map[getTranslatableKey(t)] = t;
      }
      translationsByLocale.set(locale.id, map);
    }
  }

  return { locales, folders, translationsByLocale };
});

/**
 * Build the hreflang alternates for a page on a multilingual site. Returns an
 * empty array when hreflang shouldn't be emitted (single locale or no
 * resolvable alternates). Rendered as lowercase `<link rel="alternate"
 * hreflang>` tags (see HreflangAlternateLinks) rather than via Next's
 * `metadata.alternates.languages`, which React 19 emits as camelCase `hrefLang`.
 */
export async function buildPageHreflangAlternatesForPage(
  page: Page,
  baseUrl: string,
  collectionItem?: CollectionItemWithValues,
   
  tenantId?: string
): Promise<HreflangAlternate[]> {
  const { locales, folders, translationsByLocale } = await fetchHreflangDataset();

  if (locales.length <= 1) {
    return [];
  }

  // Dynamic pages need the collection item's slug to resolve per-locale URLs.
  // `collectionItem.values` is localized to the active render locale, so read the
  // raw (default-locale) slug — it anchors the x-default and default-locale
  // alternates and the fallback for locales without a translated slug.
  const slugFieldId = page.settings?.cms?.slug_field_id;
  let dynamicSlug: { itemId: string; defaultValue: string } | null = null;
  if (page.is_dynamic && collectionItem && slugFieldId) {
    const rawValues = await getValuesByItemIds([collectionItem.id], true, undefined, [slugFieldId]);
    const rawSlug = rawValues[collectionItem.id]?.[slugFieldId];
    dynamicSlug = {
      itemId: collectionItem.id,
      defaultValue: String(rawSlug ?? collectionItem.values?.[slugFieldId] ?? ''),
    };
  }

  return buildPageHreflangAlternates({
    page,
    folders,
    baseUrl,
    locales,
    translationsByLocale,
    dynamicSlug,
  });
}

/**
 * Generate Next.js metadata from a page object
 * Handles SEO settings, Open Graph, Twitter Card, and noindex rules
 * Resolves field variables for dynamic pages
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
    translations,
  } = options;

  const seo = page.settings?.seo;
  const isErrorPage = page.error_page !== null;

  // Locale-translated SEO values (fall back to the originals when no completed
  // translation exists for the current locale).
  const seoTitle = getTranslatedText(seo?.title, 'seo:title', translations, page.id);
  const seoDescription = getTranslatedText(seo?.description, 'seo:description', translations, page.id);

  // ── Title ──────────────────────────────────────────────────────────────────
  let title = seoTitle || page.name || fallbackTitle || 'Page';
  if (collectionItem && seoTitle) {
    title = resolveInlineVariables(seoTitle, collectionItem) || page.name || fallbackTitle || 'Page';
  }
  if (isPreview) title = `[Preview] ${title}`;

  // ── Description ────────────────────────────────────────────────────────────
  let description = seoDescription || fallbackDescription || page.name;
  if (collectionItem && seoDescription) {
    description = resolveInlineVariables(seoDescription, collectionItem) || fallbackDescription || page.name;
  }

  // ── Base metadata ──────────────────────────────────────────────────────────
  const metadata: Metadata = { title, description };

  // ── Global settings & derived values (skipped in preview) ─────────────────
  let siteBaseUrl: string | null = null;
  let canonicalUrl: string | null = null;
  let globalSettings: GlobalPageSettings = {};

  // URL of the current page, shared by canonical and og:url. Prefer an absolute
  // URL built from the resolved base (canonical / primary domain / Vercel env)
  // so it's correct on Vercel and cloud even when the route doesn't set
  // `metadataBase`. Falls back to the relative path locally (no base
  // configured), which Next.js resolves against `metadataBase` when available.
  let pageUrl: string | undefined;

  // Always fetch global settings — preview mode reads draft assets so the
  // favicon and web clip render before the user publishes.
  globalSettings = options.globalSeoSettings || (await fetchGlobalPageSettings(isPreview));

  if (!isPreview) {
    siteBaseUrl = getSiteBaseUrl({
      globalCanonicalUrl: globalSettings.globalCanonicalUrl,
      primaryDomainUrl,
    });

    pageUrl = pagePath === undefined
      ? undefined
      : siteBaseUrl
        ? buildAbsolutePageUrl(siteBaseUrl, pagePath)
        : pagePath;

    // Google site verification
    if (globalSettings.googleSiteVerification) {
      metadata.verification = { google: globalSettings.googleSiteVerification };
    }

    // Canonical URL — governance (page override > global + path), falling back
    // to the self-referencing page URL so every page emits a canonical tag.
    const govCtx: SeoGovernanceContext = {
      page,
      isPreview,
      isPasswordProtected,
      pagePath,
      globalCanonicalUrl: globalSettings.globalCanonicalUrl,
      primaryDomainUrl,
    };
    canonicalUrl = getCanonicalUrl(govCtx) ?? pageUrl ?? null;
    if (canonicalUrl) {
      metadata.alternates = { ...metadata.alternates, canonical: canonicalUrl };
    }

    // hreflang alternates are rendered as lowercase <link> tags in the page
    // head (see HreflangAlternateLinks / PageRenderer), not via
    // metadata.alternates.languages — React 19 emits that map's `hrefLang`
    // prop verbatim, but the HTML/Google standard is lowercase `hreflang`.
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
    // A fixed asset (string ID) can be translated per locale; CMS field
    // variables resolve from the collection item instead.
    const seoImage = typeof seo.image === 'string'
      ? getTranslatedAssetId(seo.image, 'seo:image', translations, page.id)
      : seo.image;
    imageUrl = seoImage ? await resolveImageUrl(seoImage, collectionItem) : null;
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
      // og:url — prefer the governance canonical, else this page's own URL (upstream og:url feature).
      ...((canonicalUrl ?? pageUrl) ? { url: canonicalUrl ?? pageUrl } : {}),
    };

    if (imageUrl) {
      metadata.openGraph.images = [{ url: imageUrl, width: 1200, height: 630 }];
      metadata.twitter = {
        card: imageUrl ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
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
