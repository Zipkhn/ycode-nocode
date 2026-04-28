import { buildZip } from './zip-utils';
import { resolveVarToHex } from './color-utils';
import { SPACE_TOKENS } from './bridge-generators';

const TYPO_LEVELS   = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'] as const;
const TYPO_SIZE_IDS = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'text-large', 'text-main', 'text-small'] as const;

const remToPx   = (v: string) => String(Math.round(parseFloat(v) * 16));
const pxToRem   = (v: string) => String(parseFloat(v) / 16);
const cssValToPx = (v: string): number => {
  const n = parseFloat(v);
  return v.trim().endsWith('rem') ? Math.round(n * 16 * 1000) / 1000 : n;
};
const stripEm   = (v: string) => v.replace(/em$/i, '');
const addEm     = (v: string) => `${parseFloat(v)}em`;
const firstFont = (v: string) => v.split(',')[0].trim().replace(/['"]/g, '');

export const FIELD_MAP: Record<string, { css: string; type: 'number' | 'string'; out?: (v: string) => string; in?: (v: string) => string }> = {
  'font-heading':    { css: '_typography---font-family-headings', type: 'string', out: firstFont },
  'font-body':       { css: '_typography---font-family-body',     type: 'string', out: firstFont },
  'spacing-base-px': { css: 'space-base',  type: 'number', out: (v) => String(parseFloat(v) * 16), in: (v) => String(parseFloat(v) / 16) },
  'spacing-ratio':   { css: 'space-ratio', type: 'number' },
  ...Object.fromEntries(
    TYPO_SIZE_IDS.flatMap(lvl => [
      [`${lvl}-size-min`, { css: `_typography---font-size--${lvl}-min`, type: 'number', out: remToPx, in: pxToRem }],
      [`${lvl}-size-max`, { css: `_typography---font-size--${lvl}-max`, type: 'number', out: remToPx, in: pxToRem }],
    ])
  ),
  ...Object.fromEntries(
    TYPO_LEVELS.flatMap(lvl => [
      [`${lvl}-weight`,         { css: `${lvl}-font-weight`,    type: 'number' as const }],
      [`${lvl}-line-height`,    { css: `${lvl}-line-height`,    type: 'number' as const }],
      [`${lvl}-letter-spacing`, { css: `${lvl}-letter-spacing`, type: 'number' as const, out: stripEm, in: addEm }],
    ])
  ),
};

export const CSS_TO_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([token, { css }]) => [css, token])
);

// ── Export ────────────────────────────────────────────────────────────────────

interface SpacingParams { spaceBase: number; spaceRatio: number }

export function exportCollections(variables: Record<string, string>, spacing: SpacingParams): void {
  const enc  = new TextEncoder();
  const tok  = (type: 'color' | 'number' | 'string', value: string | number) => ({ $type: type, $value: value });
  const hex  = (k: string) => { const r = variables[k] || ''; return r.startsWith('#') ? r : resolveVarToHex(r, variables); };
  const num  = (v: string | number) => parseFloat(String(v));
  const json = (obj: unknown) => enc.encode(JSON.stringify(obj, null, 2));

  const swatch: Record<string, unknown> = {};
  for (const k of Object.keys(variables).filter(k => k.startsWith('color--'))) {
    const h = hex(k); if (h) swatch[k] = tok('color', h);
  }
  swatch['$extensions'] = { 'com.figma.modeName': 'Value' };

  const sizeFnDesktop = (lvl: string) => {
    const raw = variables[`_typography---font-size--${lvl}-max`];
    return raw ? Math.round(parseFloat(raw) * 16) : undefined;
  };
  const sizeFnMobile = (lvl: string) => {
    const raw = variables[`_typography---font-size--${lvl}-min`];
    return raw ? Math.round(parseFloat(raw) * 16) : undefined;
  };
  const buildFontSizes = (fn: (l: string) => number | undefined) =>
    Object.fromEntries(TYPO_SIZE_IDS.map(lvl => [lvl, tok('number', fn(lvl) ?? 16)]).filter(([, v]) => (v as any).$value));

  const buildSpacing = (desktop: boolean) => {
    const out: Record<string, unknown> = {};
    SPACE_TOKENS.forEach(({ key, steps }) => {
      const base = spacing.spaceBase * Math.pow(spacing.spaceRatio, Math.abs(steps)) * (steps < 0 ? 1 / Math.pow(spacing.spaceRatio, Math.abs(steps)) : 1);
      const px = Math.round(desktop ? base * spacing.spaceRatio : base);
      out[key.replace('space-', '')] = tok('number', px);
    });
    return out;
  };

  const sizesDesktop: Record<string, unknown> = {
    'font-size':    buildFontSizes(sizeFnDesktop),
    'space':        buildSpacing(true),
    'radius':       { small: tok('number', cssValToPx(variables['radius--small'] ?? '0.5rem')), main: tok('number', cssValToPx(variables['radius--main'] ?? '1rem')), round: tok('number', 9999) },
    'border-width': { main: tok('number', cssValToPx(variables['border-width--main'] ?? '0.094rem')) },
    '$extensions':  { 'com.figma.modeName': 'Desktop' },
  };
  const sizesMobile: Record<string, unknown> = {
    'font-size':   buildFontSizes(sizeFnMobile),
    'space':       buildSpacing(false),
    '$extensions': { 'com.figma.modeName': 'Mobile' },
  };

  const typography: Record<string, unknown> = {
    'primary-family':   tok('string', firstFont(variables['_typography---font-family-headings'] || 'inherit')),
    'secondary-family': tok('string', firstFont(variables['_typography---font-family-body'] || 'inherit')),
    ...Object.fromEntries(
      TYPO_LEVELS.flatMap(lvl => [
        [`${lvl}-weight`,         tok('number', num(variables[`${lvl}-font-weight`] || '400'))],
        [`${lvl}-line-height`,    tok('number', num(variables[`${lvl}-line-height`] || '1.5'))],
        [`${lvl}-letter-spacing`, tok('number', num(stripEm(variables[`${lvl}-letter-spacing`] || '0em')))],
      ])
    ),
    '$extensions': { 'com.figma.modeName': 'Base mode' },
  };

  const themeFile = (mode: 'light' | 'dark', figmaMode: string) => {
    const pre = `theme-${mode}--`;
    const slot = (k: string) => { const h = hex(pre + k); return h ? tok('color', h) : undefined; };
    const themeSlots: Record<string, unknown> = {};
    for (const [figmaKey, cssKey] of [
      ['background', 'background'], ['background-2', 'background-2'],
      ['text', 'text-main'], ['text-heading', 'text-heading'],
      ['text-muted', 'text-muted'], ['border', 'border'], ['accent', 'accent'],
    ] as [string, string][]) {
      const t = slot(cssKey); if (t) themeSlots[figmaKey] = t;
    }
    return { theme: themeSlots, '$extensions': { 'com.figma.modeName': figmaMode } };
  };

  const files = [
    { name: 'Swatch.tokens.json',        data: json(swatch)                       },
    { name: 'Sizes.Desktop.tokens.json', data: json(sizesDesktop)                 },
    { name: 'Sizes.Mobile.tokens.json',  data: json(sizesMobile)                  },
    { name: 'Typography.tokens.json',    data: json(typography)                   },
    { name: 'Theme.Light.tokens.json',   data: json(themeFile('light', 'Light'))  },
    { name: 'Theme.Dark.tokens.json',    data: json(themeFile('dark',  'Dark'))   },
  ];

  const zip  = buildZip(files);
  const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'ycode-studio-theme.zip'; a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export function parseImportFile(text: string): Record<string, string> {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const cssUpdates: Record<string, string> = {};

  const ext  = raw['$extensions'] as Record<string, unknown> | undefined;
  const mode = ext?.['com.figma.modeName'] as string | undefined;

  const extractHex = (val: unknown): string | null => {
    if (typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val)) return val;
    if (typeof val === 'object' && val !== null) {
      const v = val as Record<string, unknown>;
      if (typeof v.hex === 'string') return v.hex;
    }
    return null;
  };
  const weightToNum = (v: string): string => {
    const map: Record<string, string> = {
      'thin': '100', 'extralight': '200', 'light': '300', 'regular': '400',
      'medium': '500', 'semibold': '600', 'semi bold': '600',
      'bold': '700', 'extrabold': '800', 'extra bold': '800', 'black': '900',
    };
    const n = parseFloat(v); if (!isNaN(n)) return String(n);
    return map[v.toLowerCase().trim()] || v;
  };
  const flattenTokens = (obj: Record<string, unknown>, prefix = ''): Array<{ path: string; type: string; value: unknown }> => {
    const results: Array<{ path: string; type: string; value: unknown }> = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue;
      if (typeof v === 'object' && v !== null) {
        const node = v as Record<string, unknown>;
        if (node.$type !== undefined) {
          results.push({ path: prefix ? `${prefix}.${k}` : k, type: String(node.$type), value: node.$value });
        } else {
          results.push(...flattenTokens(node, prefix ? `${prefix}.${k}` : k));
        }
      }
    }
    return results;
  };

  const tokens = flattenTokens(raw);

  if (!mode || mode === 'Value') {
    for (const { path, type, value } of tokens) {
      if (type !== 'color') continue;
      if (typeof value === 'string' && value.startsWith('{')) continue;
      const h = extractHex(value);
      if (h) cssUpdates[path] = h;
    }
  }
  if (mode === 'Desktop') {
    for (const { path, type, value } of tokens) {
      if (type !== 'number' || typeof value !== 'number') continue;
      const parts = path.split('.');
      if (parts[0] === 'font-size' && parts[1]) cssUpdates[`_typography---font-size--${parts[1]}-max`] = String(value / 16);
      else if (parts[0] === 'radius' && parts[1]) cssUpdates[`radius--${parts[1]}`] = parts[1] === 'round' ? '9999px' : `${value / 16}rem`;
      else if (parts[0] === 'border-width' && parts[1]) cssUpdates[`border-width--${parts[1]}`] = `${Math.round(value / 16 * 10000) / 10000}rem`;
    }
  }
  if (mode === 'Mobile') {
    for (const { path, type, value } of tokens) {
      if (type !== 'number' || typeof value !== 'number') continue;
      const parts = path.split('.');
      if (parts[0] === 'font-size' && parts[1]) cssUpdates[`_typography---font-size--${parts[1]}-min`] = String(value / 16);
    }
  }
  if (mode === 'Base mode') {
    for (const { path, value } of tokens) {
      const v = String(value);
      if (path === 'primary-family') cssUpdates['_typography---font-family-headings'] = v;
      else if (path === 'secondary-family') cssUpdates['_typography---font-family-body'] = v;
      else {
        const wm = path.match(/^(.+)-weight$/);
        const lm = path.match(/^(.+)-line-height$/);
        const sm = path.match(/^(.+)-letter-spacing$/);
        if (wm)      cssUpdates[`${wm[1]}-font-weight`]    = weightToNum(v);
        else if (lm) cssUpdates[`${lm[1]}-line-height`]    = v;
        else if (sm) cssUpdates[`${sm[1]}-letter-spacing`] = addEm(v);
      }
    }
  }
  if (mode === 'Light' || mode === 'Dark') {
    const pre = mode === 'Light' ? 'theme-light--' : 'theme-dark--';
    const themeMap: Record<string, string> = {
      'background': 'background', 'background-2': 'background-2',
      'text': 'text-main', 'text-heading': 'text-heading',
      'text-muted': 'text-muted', 'border': 'border', 'accent': 'accent',
    };
    for (const { path, type, value } of tokens) {
      if (type !== 'color') continue;
      if (typeof value === 'string' && value.startsWith('{')) continue;
      const h = extractHex(value);
      if (!h) continue;
      const key = path.split('.').pop()!;
      const cssKey = themeMap[key];
      if (cssKey) cssUpdates[`${pre}${cssKey}`] = h;
    }
  }

  if (Object.keys(cssUpdates).length === 0) throw new Error('Aucun token reconnu');
  return cssUpdates;
}
