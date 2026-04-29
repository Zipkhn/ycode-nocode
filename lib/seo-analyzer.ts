/**
 * SEO Semantic Analyzer — Phase 3C
 *
 * Pure function: no server-only, no DB, no framework imports.
 * Takes draft layers + page settings, returns a list of issues to display in the builder UI.
 *
 * origin:
 *   'structure' — issue lives in the layer tree (fix it on the canvas)
 *   'content'   — issue lives in the SEO settings fields (fix it here in the panel)
 */

import type { Layer, PageSettings } from '@/types';

export type SeoIssueLevel = 'error' | 'warning' | 'info';
export type SeoIssueOrigin = 'structure' | 'content';

export interface SeoIssue {
  level: SeoIssueLevel;
  origin: SeoIssueOrigin;
  message: string;
}

interface AnalyzerContext {
  isErrorPage: boolean;
  isDynamicPage: boolean;
}

// ── Layer traversal ───────────────────────────────────────────────────────────

function collectHeadingTags(layers: Layer[]): string[] {
  const tags: string[] = [];
  for (const layer of layers) {
    const tag = resolveHeadingTag(layer);
    if (tag) tags.push(tag);
    if (layer.children?.length) {
      tags.push(...collectHeadingTags(layer.children));
    }
  }
  return tags;
}

function resolveHeadingTag(layer: Layer): string | null {
  const tag = layer.settings?.tag;
  if (tag && /^h[1-6]$/.test(tag)) return tag;
  if (layer.name === 'heading') return tag || 'h2';
  if (layer.name === 'text' && tag && /^h[1-6]$/.test(tag)) return tag;
  return null;
}

// ── Checks ────────────────────────────────────────────────────────────────────

function checkH1(headingTags: string[], issues: SeoIssue[]) {
  const h1Count = headingTags.filter(t => t === 'h1').length;
  if (h1Count === 0) {
    issues.push({ level: 'error', origin: 'structure', message: 'No H1 heading found on this page.' });
  } else if (h1Count > 1) {
    issues.push({ level: 'warning', origin: 'structure', message: `${h1Count} H1 headings found — there should be exactly one.` });
  }
}

function checkHeadingHierarchy(headingTags: string[], issues: SeoIssue[]) {
  // Walk headings in DOM order. Flag every transition where the level jumps
  // by more than 1 (e.g. h2→h4 skips h3). Going back up is always allowed.
  // Deduplicate: report each (fromLevel→toLevel) pair at most once.
  const reported = new Set<string>();
  let prevLevel = 0;

  for (const tag of headingTags) {
    const level = parseInt(tag[1], 10);

    if (level > prevLevel + 1 && prevLevel !== 0) {
      const key = `${prevLevel}->${level}`;
      if (!reported.has(key)) {
        reported.add(key);
        issues.push({
          level: 'warning',
          origin: 'structure',
          message: `Heading level skipped: <h${level}> follows <h${prevLevel}> — <h${prevLevel + 1}> is missing.`,
        });
      }
    }

    prevLevel = level;
  }
}

function checkMeta(seo: PageSettings['seo'] | undefined, issues: SeoIssue[]) {
  const title = seo?.title?.trim() ?? '';
  const desc = seo?.description?.trim() ?? '';

  if (title && title.length > 60) {
    issues.push({ level: 'warning', origin: 'content', message: `Page title is ${title.length} characters — recommended max is 60.` });
  }
  if (desc.length === 0) {
    issues.push({ level: 'info', origin: 'content', message: 'No meta description set.' });
  } else if (desc.length > 160) {
    issues.push({ level: 'warning', origin: 'content', message: `Meta description is ${desc.length} characters — recommended max is 160.` });
  }
}

function checkOgImage(seo: PageSettings['seo'] | undefined, issues: SeoIssue[]) {
  if (!seo?.image) {
    issues.push({ level: 'info', origin: 'content', message: 'No social preview image set.' });
  }
}

function checkJsonLdSchemas(seo: PageSettings['seo'] | undefined, issues: SeoIssue[]) {
  const article = seo?.json_ld?.schemas?.article;
  if (article && !article.datePublished) {
    issues.push({
      level: 'warning',
      origin: 'content',
      message: 'Article schema is enabled but Date published is missing — schema will not be generated.',
    });
  }

  const faq = seo?.json_ld?.schemas?.faq;
  if (faq) {
    const empty = faq.items.filter(i => !i.question.trim() || !i.answer.trim());
    if (empty.length > 0) {
      issues.push({
        level: 'warning',
        origin: 'content',
        message: `FAQ schema has ${empty.length} incomplete item${empty.length > 1 ? 's' : ''} — empty questions or answers are excluded from the schema.`,
      });
    }
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export function analyzePage(
  layers: Layer[],
  seo: PageSettings['seo'] | undefined,
  ctx: AnalyzerContext
): SeoIssue[] {
  if (ctx.isErrorPage) return [];

  const issues: SeoIssue[] = [];
  const headingTags = collectHeadingTags(layers);

  checkH1(headingTags, issues);
  checkHeadingHierarchy(headingTags, issues);
  checkMeta(seo, issues);
  checkOgImage(seo, issues);
  checkJsonLdSchemas(seo, issues);

  return issues;
}
