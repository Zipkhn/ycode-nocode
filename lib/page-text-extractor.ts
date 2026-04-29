/**
 * Page Text Extractor — Phase 4
 *
 * Pure function: no server-only, no DB, no framework imports.
 * Extracts readable text from draft layers for AI SEO payload.
 *
 * Handles:
 *   dynamic_text — string with optional <ycode-inline-variable> tags (stripped)
 *   dynamic_rich_text — TipTap JSON (text nodes collected recursively)
 */

import type { Layer } from '@/types';

export interface ExtractedSegment {
  level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'text';
  text: string;
}

// ── TipTap plain-text walk ────────────────────────────────────────────────────

function tiptapToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;

  if (n.type === 'text' && typeof n.text === 'string') return n.text;

  const children = Array.isArray(n.content) ? n.content : [];
  const childText = children.map(tiptapToText).join('');

  // Separate block-level nodes with a space so words don't run together
  const blockTypes = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock']);
  return blockTypes.has(n.type as string) ? childText + ' ' : childText;
}

// ── Inline variable tag stripper ──────────────────────────────────────────────

const INLINE_VAR_RE = /<ycode-inline-variable[^>]*\/?>/g;

function stripInlineVars(text: string): string {
  return text.replace(INLINE_VAR_RE, '').trim();
}

// ── Layer heading tag resolver ────────────────────────────────────────────────

function resolveTag(layer: Layer): ExtractedSegment['level'] | null {
  const tag = layer.settings?.tag;

  if (layer.name === 'heading') {
    const resolved = tag && /^h[1-6]$/.test(tag) ? tag : 'h2';
    return resolved as ExtractedSegment['level'];
  }

  // text layer with explicit heading tag override
  if (layer.name === 'text' && tag && /^h[1-6]$/.test(tag)) {
    return tag as ExtractedSegment['level'];
  }

  if (layer.name === 'text') return 'text';

  return null;
}

// ── Per-layer text extraction ─────────────────────────────────────────────────

function extractLayerText(layer: Layer): string {
  const variable = layer.variables?.text as
    | { type: string; data: { content: unknown } }
    | undefined;

  if (!variable) return '';

  if (variable.type === 'dynamic_text') {
    return typeof variable.data.content === 'string'
      ? stripInlineVars(variable.data.content)
      : '';
  }

  if (variable.type === 'dynamic_rich_text') {
    return tiptapToText(variable.data.content).trim();
  }

  return '';
}

// ── Recursive tree walker ─────────────────────────────────────────────────────

function walk(layers: Layer[], out: ExtractedSegment[]) {
  for (const layer of layers) {
    if (layer.hidden) continue;

    const level = resolveTag(layer);
    if (level) {
      const text = extractLayerText(layer);
      if (text) out.push({ level, text });
    }

    if (layer.children?.length) walk(layer.children, out);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract heading and text segments from the layer tree in DOM order.
 * Limited to `maxChars` total characters across all segments to keep the
 * AI payload bounded (~2 000 chars is enough for good suggestions).
 */
export function extractPageText(
  layers: Layer[],
  maxChars = 2000
): ExtractedSegment[] {
  const raw: ExtractedSegment[] = [];
  walk(layers, raw);

  const result: ExtractedSegment[] = [];
  let total = 0;

  for (const seg of raw) {
    if (total >= maxChars) break;
    const remaining = maxChars - total;
    const text = seg.text.length > remaining ? seg.text.slice(0, remaining) + '…' : seg.text;
    result.push({ level: seg.level, text });
    total += text.length;
  }

  return result;
}
