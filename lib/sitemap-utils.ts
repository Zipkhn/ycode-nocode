/**
 * Sitemap Utility Functions
 *
 * Generates sitemap XML for published pages with localization support.
 * Hreflang clusters are built via generateHreflangEntries — the same function
 * used by generateMetadata in the page routes — guaranteeing full <head> / sitemap symmetry.
 */

import type {
  Page,
  PageFolder,
  Locale,
  Translation,
  SitemapSettings,
  SitemapChangeFrequency,
  CollectionItem,
} from '@/types';
import { buildSlugPath, buildLocalizedSlugPath } from './page-utils';
import { getTranslatableKey } from './localisation-utils';
import { shouldAppearInSitemap } from './seo-governance';
import { buildHreflangCluster, generateHreflangEntries } from './hreflang-generator';

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: SitemapChangeFrequency;
  alternates?: SitemapAlternate[];
}

export interface SitemapAlternate {
  hreflang: string;
  href: string;
}

/**
 * Build sitemap URL entries for a static page (non-dynamic).
 *
 * Monolingue: one <url> entry, no alternates.
 * Multilingue: one <url> entry per published locale, each carrying the full
 * shared alternates cluster (self-reference included, x-default = default locale).
 *
 * The cluster is built via generateHreflangEntries — identical to what
 * generateMetadata injects into <head> — guaranteeing <head>/sitemap symmetry.
 */
function buildStaticPageUrls(
  page: Page,
  folders: PageFolder[],
  baseUrl: string,
  settings: SitemapSettings,
  locales: Locale[],
  translationsByLocale: Record<string, Record<string, Translation>>
): SitemapUrl[] {
  if (!shouldAppearInSitemap(page)) return [];

  const publishedLocales = locales.filter(l => l.is_published && !l.deleted_at);

  // Monolingue: single URL, no alternates
  if (publishedLocales.length <= 1) {
    const path = buildSlugPath(page, folders, 'page');
    return [{
      loc: `${baseUrl}${path}`,
      lastmod: page.updated_at,
      changefreq: settings.defaultChangeFrequency,
    }];
  }

  // Build the shared alternates cluster — same as generateMetadata <head>
  const hreflangEntries = generateHreflangEntries(
    page,
    folders,
    publishedLocales,
    translationsByLocale,
    baseUrl
  );

  if (hreflangEntries.length === 0) {
    // Fallback for edge case (shouldn't occur with publishedLocales.length > 1)
    const path = buildSlugPath(page, folders, 'page');
    return [{
      loc: `${baseUrl}${path}`,
      lastmod: page.updated_at,
      changefreq: settings.defaultChangeFrequency,
    }];
  }

  const alternates: SitemapAlternate[] = hreflangEntries.map(e => ({
    hreflang: e.hreflang,
    href: e.href,
  }));

  // One <url> per locale variant, all carrying the same cluster
  return publishedLocales.map(locale => {
    const translations = translationsByLocale[locale.id] ?? {};
    const path = buildLocalizedSlugPath(page, folders, 'page', locale, translations);
    return {
      loc: `${baseUrl}${path}`,
      lastmod: page.updated_at,
      changefreq: settings.defaultChangeFrequency,
      alternates,
    };
  });
}

/**
 * Build sitemap URL entries for a dynamic page (CMS collection items).
 *
 * Monolingue: one <url> per item, no alternates.
 * Multilingue: one <url> per item per locale, each carrying the full shared
 * alternates cluster for that item (same symmetry guarantee as static pages).
 */
function buildDynamicPageUrls(
  page: Page,
  folders: PageFolder[],
  baseUrl: string,
  settings: SitemapSettings,
  collectionItems: CollectionItem[],
  slugFieldId: string,
  itemValues: Map<string, Map<string, string>>,
  locales: Locale[],
  translationsByLocale: Record<string, Record<string, Translation>>
): SitemapUrl[] {
  if (!shouldAppearInSitemap(page)) return [];

  const publishedLocales = locales.filter(l => l.is_published && !l.deleted_at);
  const urls: SitemapUrl[] = [];

  // Folder path prefix without the {slug} placeholder
  const folderPath = buildSlugPath(page, folders, 'page', '').replace(/\/$/, '');

  for (const item of collectionItems) {
    const fieldValues = itemValues.get(item.id);
    const slugValue = fieldValues?.get(slugFieldId);
    if (!slugValue) continue;

    const defaultItemPath = folderPath ? `${folderPath}/${slugValue}` : `/${slugValue}`;
    const defaultItemUrl = `${baseUrl}${defaultItemPath}`;

    // Monolingue
    if (publishedLocales.length <= 1) {
      urls.push({
        loc: defaultItemUrl,
        lastmod: item.updated_at,
        changefreq: settings.defaultChangeFrequency,
      });
      continue;
    }

    // Build per-locale URLs for this item
    const localeUrls: { locale: Locale; url: string }[] = [];

    for (const locale of publishedLocales) {
      const translations = translationsByLocale[locale.id] ?? {};
      let localeItemUrl: string;

      if (locale.is_default) {
        localeItemUrl = defaultItemUrl;
      } else {
        // Localized folder path (locale prefix + translated folder slugs)
        const localizedFolderPath = buildLocalizedSlugPath(
          page, folders, 'page', locale, translations, ''
        ).replace(/\/$/, '');

        // Translated item slug (falls back to default slug)
        const translatedSlugKey = getTranslatableKey({
          source_type: 'cms',
          source_id: item.id,
          content_key: slugFieldId,
        });
        const translatedSlug = translations[translatedSlugKey]?.content_value || slugValue;

        localeItemUrl = localizedFolderPath
          ? `${baseUrl}${localizedFolderPath}/${translatedSlug}`
          : `${baseUrl}/${locale.code}/${translatedSlug}`;
      }

      localeUrls.push({ locale, url: localeItemUrl });
    }

    // Shared alternates cluster via buildHreflangCluster — same assembly logic as static pages
    const hreflangEntries = buildHreflangCluster(localeUrls);
    const alternates: SitemapAlternate[] = hreflangEntries.map(e => ({
      hreflang: e.hreflang,
      href: e.href,
    }));

    // One <url> per locale variant, all carrying the same cluster
    for (const { url } of localeUrls) {
      urls.push({
        loc: url,
        lastmod: item.updated_at,
        changefreq: settings.defaultChangeFrequency,
        alternates,
      });
    }
  }

  return urls;
}

/**
 * Generate sitemap URLs from pages and collection data.
 */
export function generateSitemapUrls(
  pages: Page[],
  folders: PageFolder[],
  baseUrl: string,
  settings: SitemapSettings,
  locales: Locale[],
  translationsByLocale: Record<string, Record<string, Translation>>,
  dynamicPageData: Map<string, {
    items: CollectionItem[];
    slugFieldId: string;
    itemValues: Map<string, Map<string, string>>;
  }>
): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  for (const page of pages) {
    if (page.is_dynamic && page.settings?.cms) {
      const data = dynamicPageData.get(page.id);
      if (data) {
        urls.push(...buildDynamicPageUrls(
          page,
          folders,
          baseUrl,
          settings,
          data.items,
          data.slugFieldId,
          data.itemValues,
          locales,
          translationsByLocale
        ));
      }
    } else {
      urls.push(...buildStaticPageUrls(
        page,
        folders,
        baseUrl,
        settings,
        locales,
        translationsByLocale
      ));
    }
  }

  return urls;
}

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date for sitemap (W3C Datetime format).
 */
function formatSitemapDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Generate XML sitemap from URLs.
 * Adds xmlns:xhtml namespace only when alternates are present.
 */
export function generateSitemapXml(urls: SitemapUrl[]): string {
  const hasAlternates = urls.some(url => url.alternates && url.alternates.length > 0);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';

  if (hasAlternates) {
    xml += '\n        xmlns:xhtml="http://www.w3.org/1999/xhtml"';
  }

  xml += '>\n';

  for (const url of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;

    if (url.lastmod) {
      xml += `    <lastmod>${formatSitemapDate(url.lastmod)}</lastmod>\n`;
    }

    if (url.changefreq) {
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    }

    if (url.alternates && url.alternates.length > 0) {
      for (const alt of url.alternates) {
        xml += `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />\n`;
      }
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>';

  return xml;
}

/**
 * Default sitemap settings (Ycode-generated sitemap enabled for new apps).
 */
export function getDefaultSitemapSettings(): SitemapSettings {
  return {
    mode: 'auto',
    includeImages: false,
    defaultChangeFrequency: 'weekly',
    customXml: '',
  };
}
