/**
 * JSON-LD Schema Generator
 *
 * Phase 2: WebSite + Organization schemas.
 * Future phases: Article, FAQPage, Person, Product (see types/index.ts → SeoJsonLdSettings).
 *
 * Pure functions — no server-only, no DB, no framework imports.
 * Every function is independently testable.
 *
 * ── Field hierarchy ──────────────────────────────────────────────────────────
 *
 * WebSite.name  (og:site_name)
 *   1. page.settings.seo.og_site_name    — per-page override
 *   2. settings.og_site_name             — global setting (GlobalPageSettings.ogSiteName)
 *   3. omitted
 *
 * WebSite.url / Organization.url
 *   → globalCanonicalUrl (settings.global_canonical_url), normalized to no trailing slash
 *
 * Organization.name
 *   → settings.schema_org_name (GlobalPageSettings.schemaOrgName)
 *   → required: Organization schema not emitted if missing
 *   → doubles as Article/WebPage publisher name in Phase 3D+
 *
 * Organization.logo
 *   → settings.schema_org_logo_url (GlobalPageSettings.schemaOrgLogoUrl)
 *   → optional: emitted as ImageObject when set
 *
 * Cross-referencing (Phase 3D+)
 *   Article.publisher  → { "@id": "{baseUrl}/#organization" }
 *   Article.author     → { "@id": "{baseUrl}/#organization" } (default) or per-page Person @id
 *   WebSite.publisher  → { "@id": "{baseUrl}/#organization" } (when org exists)
 *
 * ── @graph architecture ───────────────────────────────────────────────────────
 *
 * All schemas for a page are merged into a single JSON-LD document:
 *   { "@context": "https://schema.org", "@graph": [...nodes] }
 *
 * One <script type="application/ld+json"> tag per page, hoisted to <head> by React 19.
 * Adding a new schema in Phase 3D: push a node into the graph inside generatePageJsonLd().
 *
 * @id convention:
 *   WebSite      → {baseUrl}/#website
 *   Organization → {baseUrl}/#organization
 *   Article      → {pageUrl}/#article        (Phase 3D, uses canonical page URL)
 *   FAQPage      → {pageUrl}/#faqpage        (Phase 3D)
 *
 * Schema.org reference: https://schema.org
 */

import { isIndexablePage, type SeoGovernanceContext } from './seo-governance';
import type { ArticleSchemaInput, FaqSchemaInput } from '@/types';

// ── Config types ──────────────────────────────────────────────────────────────

export interface WebSiteSchemaConfig {
  /** Canonical base URL. Required — schema not emitted without it. */
  url: string;
  /** Site name. Maps to WebSite.name and og:site_name. Optional. */
  name?: string;
  /**
   * @id of the Organization node to cross-reference as publisher.
   * Only set when Organization schema is also present in the same graph.
   */
  publisherId?: string;
}

export interface OrganizationSchemaConfig {
  /** Organization display name. Required — schema not emitted without it. */
  name: string;
  /** Primary organization URL (canonical base). Optional. */
  url?: string;
  /** Absolute URL of the organization logo image. Optional. */
  logoUrl?: string;
}

export interface JsonLdGenerationContext {
  /**
   * Canonical base URL (e.g. 'https://example.com').
   * WebSite schema omitted when null/empty.
   * Also used as Organization.url and as the base for all @id values.
   */
  baseUrl: string | null | undefined;
  /** WebSite.name — page.settings.seo.og_site_name overrides GlobalPageSettings.ogSiteName. */
  ogSiteName?: string | null;
  /**
   * Organization.name from GlobalPageSettings.schemaOrgName (settings.schema_org_name).
   * Organization schema omitted when missing.
   * Also used as publisher reference in Phase 3D Article/WebPage schemas.
   */
  schemaOrgName?: string | null;
  /** Organization logo URL from GlobalPageSettings.schemaOrgLogoUrl (settings.schema_org_logo_url). */
  schemaOrgLogoUrl?: string | null;
  /** Governance context — determines whether structured data is emitted at all. */
  govCtx: SeoGovernanceContext;
  /**
   * Full canonical URL of this specific page (e.g. 'https://example.com/blog/my-post').
   * Used as base for Article/@id and FAQPage/@id. Falls back to baseUrl when absent.
   */
  pageCanonicalUrl?: string | null;
}

// ── @id helpers ───────────────────────────────────────────────────────────────

/**
 * Build a stable @id for a schema entity.
 * e.g. buildEntityId('https://example.com', 'organization') → 'https://example.com/#organization'
 */
export function buildEntityId(baseUrl: string, entityType: string): string {
  return `${baseUrl.replace(/\/$/, '')}/#${entityType}`;
}

// ── Individual schema generators ──────────────────────────────────────────────

/**
 * Generate a https://schema.org/WebSite node (without @context — used inside @graph).
 * Returns null when url is missing.
 *
 * When publisherId is supplied, adds `publisher: { "@id": publisherId }` so crawlers
 * can link WebSite → Organization without duplicating data.
 */
export function generateWebSiteSchema(
  config: WebSiteSchemaConfig
): Record<string, unknown> | null {
  if (!config.url) return null;

  const cleanUrl = config.url.replace(/\/$/, '');
  const node: Record<string, unknown> = {
    '@type': 'WebSite',
    '@id': buildEntityId(cleanUrl, 'website'),
    url: cleanUrl,
  };

  if (config.name) node.name = config.name;
  if (config.publisherId) node.publisher = { '@id': config.publisherId };

  return node;
}

/**
 * Generate a https://schema.org/Organization node (without @context — used inside @graph).
 * Returns null when name is missing.
 */
export function generateOrganizationSchema(
  config: OrganizationSchemaConfig,
  baseUrl?: string
): Record<string, unknown> | null {
  if (!config.name) return null;

  const node: Record<string, unknown> = {
    '@type': 'Organization',
    name: config.name,
  };

  if (baseUrl) node['@id'] = buildEntityId(baseUrl.replace(/\/$/, ''), 'organization');
  if (config.url) node.url = config.url.replace(/\/$/, '');

  if (config.logoUrl) {
    node.logo = {
      '@type': 'ImageObject',
      url: config.logoUrl,
    };
  }

  return node;
}

/**
 * Generate a https://schema.org/Article node.
 * Returns null when no meaningful data is present.
 *
 * @param input          — per-page article settings from json_ld.schemas.article
 * @param pageUrl        — canonical URL of the page (used for @id and url)
 * @param publisherId    — @id of the Organization node for cross-referencing
 * @param fallbackTitle  — page title / page name used when headline is not set
 */
export function generateArticleSchema(
  input: ArticleSchemaInput,
  pageUrl: string,
  publisherId?: string,
  fallbackTitle?: string
): Record<string, unknown> | null {
  const cleanUrl = pageUrl.replace(/\/$/, '');
  // datePublished is the minimum required field for a valid Article rich result.
  // Without it Google cannot surface the schema, so we suppress the node entirely.
  if (!input.datePublished) return null;
  const headline = input.headline || fallbackTitle;

  const node: Record<string, unknown> = {
    '@type': 'Article',
    '@id': buildEntityId(cleanUrl, 'article'),
    url: cleanUrl,
  };

  if (headline) node.headline = headline;
  if (input.datePublished) node.datePublished = input.datePublished;
  if (input.dateModified) node.dateModified = input.dateModified;
  if (input.image) node.image = input.image;

  if (input.author) {
    node.author = { '@type': 'Person', name: input.author };
  }

  if (publisherId) {
    node.publisher = { '@id': publisherId };
    // Default author to org when no person author is set
    if (!input.author) node.author = { '@id': publisherId };
  }

  return node;
}

/**
 * Generate a https://schema.org/FAQPage node.
 * Returns null when the items list is empty.
 */
export function generateFaqSchema(
  input: FaqSchemaInput,
  pageUrl: string
): Record<string, unknown> | null {
  const validItems = input.items.filter(i => i.question.trim() && i.answer.trim());
  if (validItems.length === 0) return null;

  const cleanUrl = pageUrl.replace(/\/$/, '');

  return {
    '@type': 'FAQPage',
    '@id': buildEntityId(cleanUrl, 'faqpage'),
    url: cleanUrl,
    mainEntity: validItems.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question.trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer.trim(),
      },
    })),
  };
}

// ── Safe serialization ────────────────────────────────────────────────────────

/**
 * Serialize a JSON-LD document to a string safe for dangerouslySetInnerHTML.
 *
 * Escapes `<`, `>`, `&` to Unicode escapes so that a malicious value like
 * `"name": "</script><script>alert(1)</script>"` cannot break out of the
 * script tag. Matches Next.js's own JSON-LD serialization behavior.
 */
export function serializeJsonLd(doc: Record<string, unknown>): string {
  return JSON.stringify(doc)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Generate the full JSON-LD script for a page.
 *
 * All schemas are merged into a single @graph document so that @id cross-references
 * work correctly between nodes (e.g. WebSite.publisher → Organization).
 *
 * Returns [] when:
 * - The page is not indexable (noindex, error page, preview, password-protected).
 * - No qualifying data exists (no baseUrl, no org name).
 *
 * Returns ['<serialized @graph>'] — a single-element array ready for:
 *   <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: scripts[0] }} />
 *
 * Phase 3D extension point: add nodes to the `nodes` array inside this function
 * before the graph is assembled (Article, FAQPage, etc.).
 */
export function generatePageJsonLd(ctx: JsonLdGenerationContext): string[] {
  if (!isIndexablePage(ctx.govCtx)) return [];

  const cleanBase = ctx.baseUrl ? ctx.baseUrl.replace(/\/$/, '') : null;
  const nodes: Record<string, unknown>[] = [];

  // Determine Organization @id upfront so WebSite can reference it.
  const orgId =
    cleanBase && ctx.schemaOrgName
      ? buildEntityId(cleanBase, 'organization')
      : undefined;

  // WebSite node
  if (cleanBase) {
    const node = generateWebSiteSchema({
      url: cleanBase,
      name: ctx.ogSiteName || undefined,
      publisherId: orgId,
    });
    if (node) nodes.push(node);
  }

  // Organization node
  if (ctx.schemaOrgName) {
    const node = generateOrganizationSchema(
      {
        name: ctx.schemaOrgName,
        url: cleanBase || undefined,
        logoUrl: ctx.schemaOrgLogoUrl || undefined,
      },
      cleanBase || undefined
    );
    if (node) nodes.push(node);
  }

  // ── Phase 3D: per-page schema nodes ───────────────────────────────────────
  const schemas = ctx.govCtx.page.settings?.seo?.json_ld?.schemas;
  const pageUrl = ctx.pageCanonicalUrl || cleanBase || '';

  if (schemas?.article && pageUrl) {
    const node = generateArticleSchema(
      schemas.article,
      pageUrl,
      orgId,
      ctx.govCtx.page.settings?.seo?.title || ctx.govCtx.page.name
    );
    if (node) nodes.push(node);
  }

  if (schemas?.faq && pageUrl) {
    const node = generateFaqSchema(schemas.faq, pageUrl);
    if (node) nodes.push(node);
  }

  if (nodes.length === 0) return [];

  const graph: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };

  return [serializeJsonLd(graph)];
}
