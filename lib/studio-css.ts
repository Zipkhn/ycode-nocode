import { getCompleteBridgeCSS, generateCustomVarsBridgeCSS } from '@/components/Studio/utils/bridge-generators';
import type { CustomVarsConfig } from '@/components/Studio/utils/bridge-generators';

/**
 * Studio CSS — pure parsing / mutation / rendering (no fs, no DB).
 *
 * The big static parts of global-theme.css (utilities, grids, fluid clamps) live
 * in the committed file and never change at runtime. The Studio-managed sections
 * (core variables, custom-vars block, runtime bridges) are spliced from data so
 * the design system reflects live edits without writing to a read-only FS.
 *
 * IO (file read/write, Supabase) lives in lib/studio-theme-store.
 */

const CUSTOM_VARS_START = '/* STUDIO_CUSTOM_VARS_START */';
const CUSTOM_VARS_END   = '/* STUDIO_CUSTOM_VARS_END */';

export const DEFAULT_CUSTOM_VARS_CONFIG: CustomVarsConfig = {
  modes: [{ id: 'default', name: 'Default', selector: ':root' }],
  variables: [],
};

export interface StudioThemeData {
  variables: Record<string, string>;
  customVarsConfig: CustomVarsConfig | null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────────

/**
 * Local custom-property aliases declared INSIDE utility rules (skeleton §14:
 * `.u-text-* { --min: …; --max: …; --v-min/--v-max }`). They sit within the
 * parsed CORE region but are NOT theme tokens. Harvesting them stores the
 * last-seen value (`.u-text-small`) under bare keys `min`/`max`, and the global
 * replace in applyStudioMutations then rewrites EVERY level's `--min`/`--max`
 * to text-small → all typographic levels collapse to ~13px. Never treat as vars.
 */
export const RESERVED_LOCAL_PROPS = new Set(['min', 'max', 'v-min', 'v-max']);

/** Parse the Studio-managed variable map from the STUDIO_CORE section. Null if markers absent. */
export function parseStudioVariablesFromCss(css: string): Record<string, string> | null {
  const startIdx = css.indexOf('/* STUDIO_CORE_START */');
  const endIdx   = css.indexOf('/* STUDIO_CORE_END */');
  if (startIdx === -1 || endIdx === -1) return null;

  const coreSection = css.substring(startIdx, endIdx);
  const variables: Record<string, string> = {};
  const regex = /--([a-zA-Z0-9_-]+):\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(coreSection)) !== null) {
    // Skip scoped/responsive overrides (always `!important`) so the canonical
    // :root token wins — e.g. --site--column-count reads 12, not the @media 4.
    if (match[2].includes('!important')) continue;
    if (RESERVED_LOCAL_PROPS.has(match[1])) continue; // §14 utility-rule locals, not theme tokens
    variables[match[1]] = match[2];
  }
  return variables;
}

export function parseCustomVarsConfig(css: string): CustomVarsConfig {
  const start = css.indexOf(CUSTOM_VARS_START);
  const end   = css.indexOf(CUSTOM_VARS_END);
  if (start === -1 || end === -1) return DEFAULT_CUSTOM_VARS_CONFIG;

  const block = css.substring(start, end);
  const match = block.match(/\/\* CONFIG: (.+) \*\//);
  if (!match) return DEFAULT_CUSTOM_VARS_CONFIG;

  try {
    return JSON.parse(match[1]) as CustomVarsConfig;
  } catch {
    return DEFAULT_CUSTOM_VARS_CONFIG;
  }
}

// ── Custom vars block ─────────────────────────────────────────────────────────

function generateCustomVarsCSS(config: CustomVarsConfig): string {
  if (!config.variables.length) return '';

  const lines: string[] = [];
  for (const mode of config.modes) {
    const vars = config.variables
      .map(v => {
        const val = v.values[mode.id] ?? '';
        if (!val) return null;
        return `  --custom--${v.name}: ${val};`;
      })
      .filter(Boolean);
    if (!vars.length) continue;
    lines.push(`${mode.selector} {`);
    lines.push(...(vars as string[]));
    lines.push('}');
  }
  return lines.join('\n');
}

function buildCustomVarsBlock(config: CustomVarsConfig): string {
  const configJson = JSON.stringify(config);
  const css = generateCustomVarsCSS(config);
  return `${CUSTOM_VARS_START}\n/* CONFIG: ${configJson} */\n${css ? css + '\n' : ''}${CUSTOM_VARS_END}`;
}

function writeCustomVarsBlock(css: string, config: CustomVarsConfig): string {
  const block = buildCustomVarsBlock(config);
  if (css.includes(CUSTOM_VARS_START) && css.includes(CUSTOM_VARS_END)) {
    const start = css.indexOf(CUSTOM_VARS_START);
    const end   = css.indexOf(CUSTOM_VARS_END) + CUSTOM_VARS_END.length;
    return css.substring(0, start) + block + css.substring(end);
  }
  // Fallback: insert before STUDIO_RUNTIME_BRIDGES_START
  return css.replace('/* STUDIO_RUNTIME_BRIDGES_START */', `${block}\n\n/* STUDIO_RUNTIME_BRIDGES_START */`);
}

// ── Mutation ──────────────────────────────────────────────────────────────────

/**
 * Apply Studio updates onto a base CSS string (pure). Used both to persist the
 * file (best-effort, local) and to render the served stylesheet from the DB.
 *
 * Variable replacement skips `!important` declarations so scoped/responsive
 * overrides (e.g. the @media `--site--column-count: 8 !important`) survive.
 */
export function applyStudioMutations(
  baseCss: string,
  updates: Record<string, unknown> | undefined,
  bridges: string | undefined,
  customVarsConfig: CustomVarsConfig | undefined,
): string {
  let css = baseCss;

  // 1. Variable updates
  if (updates && typeof updates === 'object') {
    for (const [key, value] of Object.entries(updates)) {
      // Never let §14 utility-rule local aliases mutate the CSS: a bare `--min`/
      // `--max` replace is global and would collapse every typographic level.
      if (RESERVED_LOCAL_PROPS.has(key)) continue;
      if (value === '__remove__') {
        css = css.replace(new RegExp(`\\s*--${key}:[^;]+;`, 'g'), '');
      } else if (new RegExp(`--${key}:`).test(css)) {
        css = css.replace(
          new RegExp(`(--${key}:\\s*)([^;]+)(;)`, 'g'),
          (m, p1, p2, p3) => (p2.includes('!important') ? m : `${p1}${value}${p3}`),
        );
      } else {
        if (css.includes('/* STUDIO_THEME_END */')) {
          css = css.replace('/* STUDIO_THEME_END */', `  --${key}: ${value};\n/* STUDIO_THEME_END */`);
        } else {
          css = css.replace('/* STUDIO_CORE_END */', `:root {\n  --${key}: ${value};\n}\n/* STUDIO_CORE_END */`);
        }
      }
    }
  }

  // 2. Custom vars block
  if (customVarsConfig) {
    css = writeCustomVarsBlock(css, customVarsConfig);
  }

  // 3. Runtime bridges
  if (bridges && typeof bridges === 'string') {
    const bridgeStart = '/* STUDIO_RUNTIME_BRIDGES_START */';
    const bridgeEnd   = '/* STUDIO_RUNTIME_BRIDGES_END */';

    let finalBridges = bridges;
    if (!bridges.includes('Studio Theme Dark Bridge')) {
      const existingMatch = css.match(
        /\/\* STUDIO_RUNTIME_BRIDGES_START \*\/([\s\S]*?)\/\* STUDIO_RUNTIME_BRIDGES_END \*\//
      );
      if (existingMatch) {
        const themeDarkMatch = existingMatch[1].match(
          /\/\* Studio Theme Dark Bridge \*\/[\s\S]*?\.u-theme-dark\s*\{[\s\S]*?\}/
        );
        if (themeDarkMatch) finalBridges = bridges + '\n\n' + themeDarkMatch[0];
      }
    }

    const bridgeBlock = `${bridgeStart}\n${finalBridges}\n${bridgeEnd}`;
    if (css.includes(bridgeStart) && css.includes(bridgeEnd)) {
      const startIdx = css.indexOf(bridgeStart);
      const endIdx   = css.indexOf(bridgeEnd) + bridgeEnd.length;
      css = css.substring(0, startIdx).trimEnd() + '\n\n' + bridgeBlock + '\n';
    } else {
      css = css.trimEnd() + '\n\n' + bridgeBlock + '\n';
    }
  }

  return css;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/** Spacing params derived from the variable map (mirrors the Studio hook defaults). */
export function deriveSpacingParams(vars: Record<string, string>) {
  return {
    spaceBase:  vars['space-base']   ? Number(vars['space-base'])   : 16,
    spaceRatio: vars['space-ratio']  ? Number(vars['space-ratio'])  : 1.25,
    spaceVpMin: vars['space-vp-min'] ? Number(vars['space-vp-min']) : 375,
    spaceVpMax: vars['space-vp-max'] ? Number(vars['space-vp-max']) : 1366,
  };
}

/**
 * Render the full global-theme.css equivalent from a base skeleton + theme data.
 * Bridges are regenerated from the variables (deterministic).
 * Used by the builder (/api/studio/css) which has no other source of static utilities.
 */
export function renderFullStudioCss(baseCss: string, theme: StudioThemeData): string {
  const bridges = getCompleteBridgeCSS(theme.variables, deriveSpacingParams(theme.variables));
  return applyStudioMutations(baseCss, theme.variables, bridges, theme.customVarsConfig ?? undefined);
}

/**
 * Render ONLY the dynamic Studio CSS (variables + custom-vars + bridges) — no
 * static skeleton. Injected into the published site's <head> to override the
 * build-time bundle with the live DB values.
 */
export function renderStudioDynamicCss(theme: StudioThemeData): string {
  const vars = theme.variables;
  const parts: string[] = [];

  const varLines = Object.entries(vars)
    .filter(([k]) => !RESERVED_LOCAL_PROPS.has(k))
    .map(([k, v]) => `  --${k}: ${v};`);
  if (varLines.length) parts.push(`/* Studio Theme Variables (DB) */\n:root {\n${varLines.join('\n')}\n}`);

  const customVars = theme.customVarsConfig ? generateCustomVarsBridgeCSS(theme.customVarsConfig) : '';
  if (customVars) parts.push(customVars);

  parts.push(getCompleteBridgeCSS(vars, deriveSpacingParams(vars)));

  return parts.join('\n\n');
}
