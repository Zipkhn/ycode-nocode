import { resolveVarToHex } from './color-utils';

export const TYPOGRAPHY_LEVELS = [
  { key: 'display', label: 'Display' },
  { key: 'h1',      label: 'H1'      },
  { key: 'h2',      label: 'H2'      },
  { key: 'h3',      label: 'H3'      },
  { key: 'h4',      label: 'H4'      },
  { key: 'h5',      label: 'H5'      },
  { key: 'h6',      label: 'H6'      },
  { key: 'large',   label: 'Large'   },
  { key: 'body',    label: 'Body'    },
  { key: 'small',   label: 'Small'   },
] as const;

export const SPACE_TOKENS = [
  { key: 'space-3xs', label: '3XS', steps: -3 },
  { key: 'space-2xs', label: '2XS', steps: -2 },
  { key: 'space-xs',  label: 'XS',  steps: -1 },
  { key: 'space-s',   label: 'S',   steps:  0 },
  { key: 'space-m',   label: 'M',   steps:  1 },
  { key: 'space-l',   label: 'L',   steps:  2 },
  { key: 'space-xl',  label: 'XL',  steps:  3 },
  { key: 'space-2xl', label: '2XL', steps:  4 },
  { key: 'space-3xl', label: '3XL', steps:  5 },
] as const;

export const THEME_TOKENS_MAP = [
  { label: 'Theme / BG',           lightKey: 'theme-light--background',   darkKey: 'theme-dark--background'   },
  { label: 'Theme / Text Main',     lightKey: 'theme-light--text-main',    darkKey: 'theme-dark--text-main'    },
  { label: 'Theme / Text Heading',  lightKey: 'theme-light--text-heading', darkKey: 'theme-dark--text-heading' },
  { label: 'Theme / Text Muted',    lightKey: 'theme-light--text-muted',   darkKey: 'theme-dark--text-muted'   },
  { label: 'Theme / Accent',        lightKey: 'theme-light--accent',       darkKey: 'theme-dark--accent'       },
  { label: 'Theme / Border',        lightKey: 'theme-light--border',       darkKey: 'theme-dark--border'       },
] as const;

export function labelToUuidKey(label: string): string {
  return `__uuid--${label.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-').toLowerCase()}`;
}

// ── Custom typography levels (user-added text styles) ───────────────────────────

/** Level keys reserved by built-in typography — custom levels cannot reuse them. */
export const RESERVED_LEVEL_KEYS = new Set<string>([
  'display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'large', 'body', 'small', 'text-large', 'text-main', 'text-small',
]);

export interface CustomLevel { key: string; label: string; }

export function slugifyLevel(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCaseLevel(slug: string): string {
  return slug.split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Derive custom text-style levels from the variable map. A custom level exists
 * iff `_typography---font-size--{slug}-max` is present and {slug} isn't reserved.
 * No separate registry is stored — keeps the persisted CSS free of JSON-in-a-var.
 */
export function parseCustomLevels(variables: Record<string, string>): CustomLevel[] {
  const out: CustomLevel[] = [];
  const seen = new Set<string>();
  for (const k of Object.keys(variables)) {
    const m = k.match(/^_typography---font-size--(.+)-max$/);
    if (!m) continue;
    const key = m[1];
    if (RESERVED_LEVEL_KEYS.has(key) || seen.has(key)) continue;
    if (!/^[a-z0-9-]+$/.test(key)) continue;
    seen.add(key);
    out.push({ key, label: titleCaseLevel(key) });
  }
  return out;
}

// ── Custom theme colors (user-added theme tokens) ───────────────────────────────

/** Theme token keys reserved by built-in colors — custom tokens cannot reuse them. */
export const RESERVED_THEME_KEYS = new Set<string>([
  'background', 'background-2', 'text-main', 'text-heading', 'text-muted', 'border', 'accent',
]);

/** Derive custom theme color tokens from `theme-light--{slug}` keys (excl. built-ins & gradients). */
export function parseCustomThemeColors(variables: Record<string, string>): CustomLevel[] {
  const out: CustomLevel[] = [];
  const seen = new Set<string>();
  for (const k of Object.keys(variables)) {
    const m = k.match(/^theme-light--(.+)$/);
    if (!m) continue;
    const key = m[1];
    if (key.startsWith('gradient-')) continue;
    if (RESERVED_THEME_KEYS.has(key) || seen.has(key)) continue;
    if (!/^[a-z0-9-]+$/.test(key)) continue;
    seen.add(key);
    out.push({ key, label: titleCaseLevel(key) });
  }
  return out;
}

/**
 * Emit a light/dark-aware `--theme--{slug}` variable + `.u-bg/-text-color/-border-color`
 * utilities for each custom theme color. Independent of Ycode color variables.
 */
export function generateCustomThemeColorsBridgeCSS(variables: Record<string, string>): string {
  const tokens = parseCustomThemeColors(variables);
  if (!tokens.length) return '';
  const scope = ':where(body)';
  const lightDecls: string[] = [];
  const darkDecls: string[] = [];
  const utils: string[] = [];
  for (const { key } of tokens) {
    const lightRaw = variables[`theme-light--${key}`] || '';
    const darkRaw  = variables[`theme-dark--${key}`]  || '';
    const light = resolveVarToHex(lightRaw, variables) || lightRaw;
    const dark  = resolveVarToHex(darkRaw, variables)  || darkRaw;
    if (light) lightDecls.push(`  --theme--${key}: ${light};`);
    if (dark)  darkDecls.push(`  --theme--${key}: ${dark};`);
    utils.push(
      `${scope} .u-bg-${key}{background-color:var(--theme--${key})!important}`,
      `${scope} .u-text-color-${key}{color:var(--theme--${key})!important}`,
      `${scope} .u-border-color-${key}{border-color:var(--theme--${key})!important}`,
    );
  }
  const lines: string[] = ['/* Studio Custom Theme Colors Bridge */'];
  if (lightDecls.length) lines.push(`${scope}{`, ...lightDecls, '}');
  if (darkDecls.length)  lines.push('.u-theme-dark,.dark{', ...darkDecls, '}');
  lines.push(...utils);
  return lines.join('\n');
}

// ── Spacing Bridge ────────────────────────────────────────────────────────────

interface SpacingParams {
  spaceBase: number;
  spaceRatio: number;
  spaceVpMin: number;
  spaceVpMax: number;
}

export function generateSpacingBridgeCSS(params: SpacingParams): string {
  const tokens = [
    ...SPACE_TOKENS.map(t => ({ token: t.key, cssVar: `--${t.key}` })),
    { token: 'space-0', cssVar: '--space-0' },
  ];
  const props = [
    { prefix: 'pt',  property: 'padding-top' },
    { prefix: 'pb',  property: 'padding-bottom' },
    { prefix: 'pl',  property: 'padding-left' },
    { prefix: 'pr',  property: 'padding-right' },
    { prefix: 'px',  property: 'padding-left:VAR!important;padding-right' },
    { prefix: 'py',  property: 'padding-top:VAR!important;padding-bottom' },
    { prefix: 'mt',  property: 'margin-top' },
    { prefix: 'mb',  property: 'margin-bottom' },
    { prefix: 'ml',  property: 'margin-left' },
    { prefix: 'mr',  property: 'margin-right' },
    { prefix: 'mx',  property: 'margin-left:VAR!important;margin-right' },
    { prefix: 'my',  property: 'margin-top:VAR!important;margin-bottom' },
    { prefix: 'gap', property: 'gap' },
  ];
  const scope = ':where(body)';
  const rule = (sel: string, property: string, val: string): string => {
    if (property.includes(':VAR')) {
      const expanded = property.replace(':VAR', `:${val}`);
      return `${sel}{${expanded}:${val}!important}`;
    }
    return `${sel}{${property}:${val}!important}`;
  };
  const desktopSel = (cls: string) => `:is(${scope} [class^="${cls}"],${scope} [class*=" ${cls}"])`;
  const respSel = (bpPrefix: string, cls: string) => `${scope} [class*="${bpPrefix}${cls}"]`;

  const lines: string[] = ['/* Studio Runtime Bridge v9.1 — breakpoint-aware, auto-generated */', ':root{--space-0:0px}'];
  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      lines.push(rule(desktopSel(cls), prop.property, val));
    }
  }
  lines.push('@media screen and (max-width:1024px){');
  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      lines.push(rule(`:is(${respSel('max-lg:', cls)},${respSel('md:', cls)})`, prop.property, val));
    }
  }
  lines.push('}');
  lines.push('@media screen and (max-width:767px){');
  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      lines.push(rule(`:is(${respSel('max-md:', cls)},${respSel('sm:', cls)})`, prop.property, val));
    }
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Typography Bridge ─────────────────────────────────────────────────────────

export function generateTypographyBridgeCSS(variables: Record<string, string>): string {
  const scope = ':where(body)';
  const lines: string[] = ['/* Studio Runtime Typography Bridge v9.0 */'];
  if (variables['font-smoothing'] === 'antialiased') {
    lines.push(`${scope} { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`);
  }
  for (const lvl of TYPOGRAPHY_LEVELS) {
    let selector = '';
    if (lvl.key === 'body')    selector = `${scope} p`;
    else if (lvl.key === 'display') selector = `${scope} .u-text-display`;
    else if (lvl.key === 'large')   selector = `${scope} .u-text-large`;
    else if (lvl.key === 'small')   selector = `${scope} .u-text-small`;
    else selector = `${scope} ${lvl.key}`;
    const fw = variables[`${lvl.key}-font-weight`]    || '600';
    const lh = variables[`${lvl.key}-line-height`]    || '1.4';
    const ls = variables[`${lvl.key}-letter-spacing`] || '0em';
    const mb = variables[`${lvl.key}-margin-bottom`]  || '0rem';
    const tw = variables[`${lvl.key}-text-wrap`];
    const twPart = tw ? `;text-wrap:${tw}!important` : '';
    lines.push(`${selector}{font-weight:${fw}!important;line-height:${lh}!important;letter-spacing:${ls}!important;margin-bottom:${mb}!important${twPart}}`);
  }
  // Custom levels → `.u-text-{slug}` with the same fluid clamp as built-ins.
  for (const lvl of parseCustomLevels(variables)) {
    const k = lvl.key;
    const minV = `var(--_typography---font-size--${k}-min, 1)`;
    const maxV = `var(--_typography---font-size--${k}-max, 1.25)`;
    const vMin = 'var(--site--viewport-min, 20)';
    const vMax = 'var(--site--viewport-max, 90)';
    const fs = `clamp(calc(${minV} * 1rem), calc(${minV} * 1rem + (${maxV} - ${minV}) * (100vw - ${vMin} * 1rem) / (${vMax} - ${vMin})), calc(${maxV} * 1rem))`;
    const fw = variables[`${k}-font-weight`]    || '400';
    const lh = variables[`${k}-line-height`]     || '1.5';
    const ls = variables[`${k}-letter-spacing`]  || '0em';
    const mb = variables[`${k}-margin-bottom`]   || '0rem';
    const tw = variables[`${k}-text-wrap`];
    const ff = variables[`${k}-font-family`];
    const twPart = tw ? `;text-wrap:${tw}!important` : '';
    const ffPart = ff ? `;font-family:${ff}!important` : '';
    lines.push(`${scope} .u-text-${k}{font-size:${fs}!important;font-weight:${fw}!important;line-height:${lh}!important;letter-spacing:${ls}!important;margin-bottom:${mb}!important${twPart}${ffPart}}`);
  }
  return lines.join('\n');
}

// ── Radius Bridge ─────────────────────────────────────────────────────────────

export function generateRadiusBridgeCSS(): string {
  const scope = ':where(body)';
  const lines: string[] = ['/* Studio Radius Bridge */'];
  const tokens = [
    { cls: 'radius-small', var: '--radius--small' },
    { cls: 'radius-main',  var: '--radius--main'  },
    { cls: 'radius-round', var: '--radius--round' },
  ];
  for (const { cls, var: cssVar } of tokens) {
    lines.push(`${scope} [class*="rounded-${cls}"]{border-radius:var(${cssVar})!important}`);
  }
  return lines.join('\n');
}

// ── Theme Dark Bridge ─────────────────────────────────────────────────────────

export function generateThemeDarkBridgeCSS(variables: Record<string, string>): string {
  const overrides: string[] = [];
  for (const { label, darkKey } of THEME_TOKENS_MAP) {
    const uuid = variables[labelToUuidKey(label)];
    if (!uuid) continue;
    const darkHex = resolveVarToHex(variables[darkKey] || '', variables);
    if (darkHex) overrides.push(`  --${uuid}: ${darkHex};`);
  }
  if (!overrides.length) return '';
  return `/* Studio Theme Dark Bridge */\n.u-theme-dark {\n${overrides.join('\n')}\n}`;
}

// ── Custom Variables Bridge ───────────────────────────────────────────────────

export interface CustomMode     { id: string; name: string; selector: string; }
export interface CustomVariable { id: string; name: string; type: 'color' | 'size' | 'text'; values: Record<string, string>; }
export interface CustomVarsConfig { modes: CustomMode[]; variables: CustomVariable[]; }

export function generateCustomVarsBridgeCSS(config: CustomVarsConfig): string {
  if (!config.variables.length) return '';
  const lines: string[] = [];
  for (const mode of config.modes) {
    const vars = config.variables
      .map(v => { const val = v.values[mode.id] ?? ''; return val ? `  --custom--${v.name}: ${val};` : null; })
      .filter(Boolean) as string[];
    if (!vars.length) continue;
    lines.push(`${mode.selector} {`, ...vars, '}');
  }
  return lines.length ? `/* Studio Custom Variables Bridge */\n${lines.join('\n')}` : '';
}

// ── Complete Bridge ───────────────────────────────────────────────────────────

export function getCompleteBridgeCSS(
  variables: Record<string, string>,
  spacingParams: SpacingParams
): string {
  const parts = [
    generateSpacingBridgeCSS(spacingParams),
    generateTypographyBridgeCSS(variables),
    generateRadiusBridgeCSS(),
  ];
  const themeDark = generateThemeDarkBridgeCSS(variables);
  if (themeDark) parts.push(themeDark);
  const themeColors = generateCustomThemeColorsBridgeCSS(variables);
  if (themeColors) parts.push(themeColors);
  return parts.join('\n\n');
}
