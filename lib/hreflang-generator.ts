import type { Page, PageFolder, Locale, Translation, HreflangEntry } from '@/types';
import { buildLocalizedSlugPath } from '@/lib/page-utils';

/**
 * Build a hreflang cluster from pre-computed per-locale URL pairs.
 *
 * This is the single assembly point for hreflang clusters — both static pages
 * (via generateHreflangEntries) and dynamic CMS pages (sitemap-utils) call this
 * function after building their per-locale URLs, so the cluster shape and
 * x-default placement are guaranteed to be structurally identical.
 *
 * Returns [] when only one locale is provided (no hreflang needed).
 */
export function buildHreflangCluster(
  localeUrls: { locale: Locale; url: string }[]
): HreflangEntry[] {
  if (localeUrls.length <= 1) return [];

  const entries: HreflangEntry[] = localeUrls.map(({ locale, url }) => ({
    hreflang: locale.code,
    href: url,
  }));

  // x-default convention:
  //   Points to the default locale URL (is_default = true in the locales table).
  //   Signals "use this URL when no other locale matches the visitor's preference."
  //   If Ycode introduces a language-selector landing page, x-default should be
  //   updated to point to that page instead of the default locale URL.
  const defaultUrl = localeUrls.find(u => u.locale.is_default)?.url;
  if (defaultUrl) entries.push({ hreflang: 'x-default', href: defaultUrl });

  return entries;
}

/**
 * Generate hreflang entries for a static page across all published locales.
 *
 * Returns [] for mono-locale sites (no hreflang needed).
 *
 * Symmetry guarantee:
 *   This function is the single source of truth for hreflang clusters on
 *   static pages. Both generateMetadata (page <head>) and generateSitemapUrls
 *   (sitemap.xml) call this function, ensuring <head> and sitemap clusters
 *   are always identical.
 *
 *   Dynamic/CMS pages in sitemap-utils compute their per-locale URLs inline
 *   (because the item slug is not in the Page object) but then pass them through
 *   buildHreflangCluster — the same assembly function used here — so the cluster
 *   shape cannot diverge between static and dynamic paths.
 */
export function generateHreflangEntries(
  page: Page,
  allFolders: PageFolder[],
  availableLocales: Locale[],
  translationsByLocale: Record<string, Record<string, Translation>>,
  siteBaseUrl: string
): HreflangEntry[] {
  const published = availableLocales.filter(l => l.is_published && !l.deleted_at);
  if (published.length <= 1) return [];

  const base = siteBaseUrl.replace(/\/$/, '');

  const localeUrls = published.map(locale => {
    const translations = translationsByLocale[locale.id] ?? {};
    const path = buildLocalizedSlugPath(page, allFolders, 'page', locale, translations);
    return { locale, url: `${base}${path}` };
  });

  return buildHreflangCluster(localeUrls);
}
