'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useFontsStore } from '@/stores/useFontsStore';
import { useColorVariablesStore } from '@/stores/useColorVariablesStore';

// ─── Minimal ZIP builder (no external deps) ──────────────────────────────────
function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (d: Uint8Array) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < d.length; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const u32 = (a: Uint8Array, o: number, v: number) => { a[o]=v&255; a[o+1]=(v>>8)&255; a[o+2]=(v>>16)&255; a[o+3]=(v>>24)&255; };
  const u16 = (a: Uint8Array, o: number, v: number) => { a[o]=v&255; a[o+1]=(v>>8)&255; };
  const enc = new TextEncoder();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc  = crc32(f.data);
    const sz   = f.data.length;

    const local = new Uint8Array(30 + name.length + sz);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0); u16(local, 8, 0);
    u16(local, 10, 0); u16(local, 12, 0);
    u32(local, 14, crc); u32(local, 18, sz); u32(local, 22, sz);
    u16(local, 26, name.length); u16(local, 28, 0);
    local.set(name, 30); local.set(f.data, 30 + name.length);
    locals.push(local);

    const cen = new Uint8Array(46 + name.length);
    u32(cen, 0, 0x02014b50); u16(cen, 4, 20); u16(cen, 6, 20); u16(cen, 8, 0); u16(cen, 10, 0);
    u16(cen, 12, 0); u16(cen, 14, 0);
    u32(cen, 16, crc); u32(cen, 20, sz); u32(cen, 24, sz);
    u16(cen, 28, name.length); u16(cen, 30, 0); u16(cen, 32, 0); u16(cen, 34, 0);
    u16(cen, 36, 0); u32(cen, 38, 0); u32(cen, 42, offset);
    cen.set(name, 46);
    centrals.push(cen);

    offset += local.length;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50); u16(eocd, 4, 0); u16(eocd, 6, 0);
  u16(eocd, 8, files.length); u16(eocd, 10, files.length);
  u32(eocd, 12, cdSize); u32(eocd, 16, offset); u16(eocd, 20, 0);

  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { zip.set(p, pos); pos += p.length; }
  return zip;
}

/** Resolve a CSS var() chain to a hex string. Returns '' if unresolvable. */
function resolveVarToHex(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 4 || !value) return '';
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const m = value.match(/^var\(--(.+?)\)$/);
  if (!m) return '';
  return resolveVarToHex(vars[m[1]] || '', vars, depth + 1);
}

/** Shared color scale steps — 900 → 50 */
const COLOR_SCALE_STEPS = [900, 800, 700, 600, 500, 400, 300, 200, 100, 50] as const;

// Debounce helper
function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}

export default function StudioThemeEditor() {
  const pathname = usePathname() || '';
  const isBuilder = pathname.includes('/ycode') || pathname.includes('/builder');
  
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [newColorName, setNewColorName] = useState('');
  const [newColorValue, setNewColorValue] = useState('#3b82f6');

  // Spacing system state
  const [spaceBase, setSpaceBase] = useState(16);       // base size in px
  const [spaceRatio, setSpaceRatio] = useState(1.25);   // scale multiplier
  const [spaceVpMin, setSpaceVpMin] = useState(375);    // min viewport px
  const [spaceVpMax, setSpaceVpMax] = useState(1366);   // max viewport px
  const [spaceSyncStatus, setSpaceSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const mountBridgeSyncDone = useRef(false);

  // Typography system state
  const [typographySyncStatus, setTypographySyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  // Import / Export state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');

  // Kill Switch (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStudioOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to the Ycode fonts store (source of truth for installed fonts)
  const usedFonts = useFontsStore((state) => state.fonts);

  // Access Ycode's color store to force a refresh after sync
  const loadColorVariables = useColorVariablesStore((state) => state.loadColorVariables);

  useEffect(() => {
    fetch('/api/studio')
      .then(res => res.json())
      .then(data => {
        if (data.variables) {
          const vars = { ...data.variables };
          const missingUpdates: Record<string, string> = {};

          // Inject Default Hardcoded Fallbacks for Typography if missing
          ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'].forEach(lvl => {
            if (!vars[`${lvl}-font-weight`]) missingUpdates[`${lvl}-font-weight`] = '600';
            if (!vars[`${lvl}-letter-spacing`]) missingUpdates[`${lvl}-letter-spacing`] = '0em';
            if (!vars[`${lvl}-margin-bottom`]) missingUpdates[`${lvl}-margin-bottom`] = '0rem';

            if (!vars[`${lvl}-line-height`]) {
              if (['display', 'h1', 'h2'].includes(lvl)) missingUpdates[`${lvl}-line-height`] = '1.2';
              else if (lvl === 'h3') missingUpdates[`${lvl}-line-height`] = '1.3';
              else if (['h4', 'h5'].includes(lvl)) missingUpdates[`${lvl}-line-height`] = '1.4';
              else missingUpdates[`${lvl}-line-height`] = '1.5';
            }
          });

          // Radius & border-width defaults
          if (!vars['radius--small'])      missingUpdates['radius--small']      = '0.5rem';
          if (!vars['radius--main'])       missingUpdates['radius--main']        = '1rem';
          if (!vars['radius--round'])      missingUpdates['radius--round']       = '9999px';
          if (!vars['border-width--main']) missingUpdates['border-width--main']  = '0.094rem';

          // Theme background-2 defaults
          if (!vars['theme-light--background-2']) missingUpdates['theme-light--background-2'] = '#f5f5f5';
          if (!vars['theme-dark--background-2'])  missingUpdates['theme-dark--background-2']  = '#2a2a2a';

          if (Object.keys(missingUpdates).length > 0) {
            Object.assign(vars, missingUpdates);
            fetch('/api/studio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: missingUpdates })
            }).catch(console.error);
          }

          setVariables(vars);

          // Hydrate spacing scale params from persisted CSS variables
          if (vars['space-base'])   setSpaceBase(Number(vars['space-base']));
          if (vars['space-ratio'])  setSpaceRatio(Number(vars['space-ratio']));
          if (vars['space-vp-min']) setSpaceVpMin(Number(vars['space-vp-min']));
          if (vars['space-vp-max']) setSpaceVpMax(Number(vars['space-vp-max']));
        }
      })
      .catch(err => console.error('Studio: Failed to load theme', err))
      .finally(() => setLoading(false));
  }, []);

  // One-shot: re-save the bridge to global-theme.css + custom_css after loading
  // Ensures the published site and canvas always have the latest bridge version
  useEffect(() => {
    if (loading || mountBridgeSyncDone.current) return;
    mountBridgeSyncDone.current = true;
    saveUpdates({ 'space-0': '0px' });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Push Studio color tokens into Ycode's color_variables store so they
   * appear in the native Style Panel as selectable CSS variables.
   * Dynamically scans ALL color-- keys — fixed tokens + user-added custom ones.
   */
  const syncToYcodePalette = async () => {
    setSyncStatus('syncing');

    try {
      // Fetch existing Ycode palette to detect entries by name (for upsert)
      const existing = await fetch('/ycode/api/color-variables').then(r => r.json());
      const existingByName: Record<string, string> = {};
      for (const v of (existing.data || [])) existingByName[v.name] = v.id;

      const upsert = (label: string, hexValue: string) => {
        if (existingByName[label]) {
          return fetch(`/ycode/api/color-variables/${existingByName[label]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: hexValue }),
          });
        }
        return fetch('/ycode/api/color-variables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: label, value: hexValue }),
        });
      };

      // ── 1. Color scale tokens (parallel) ──────────────────────────────────
      const colorTokens = Object.keys(variables)
        .filter(k => k.startsWith('color--') && variables[k]?.startsWith('#'))
        .map(key => {
          const slug = key
            .replace(/^color--custom--/, '')
            .replace(/^color--/, '')
            .replace(/-/g, ' ');
          const label = `Studio / ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
          return { key, label };
        });

      const colorRequests = colorTokens.map(({ key, label }) => {
        const hexValue = variables[key];
        // Legacy rename: Lumos / → Studio /
        const lumosLabel = label.replace(/^Studio \/ /, 'Lumos / ');
        if (existingByName[lumosLabel]) {
          return fetch(`/ycode/api/color-variables/${existingByName[lumosLabel]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: label, value: hexValue }),
          });
        }
        return upsert(label, hexValue);
      });
      await Promise.all(colorRequests);

      // ── 2. Theme tokens (sequential — appear last = most recent in Ycode) ──
      const themeTokens: { label: string; sourceKey: string }[] = [
        { label: 'Theme / BG',           sourceKey: 'theme-light--background'   },
        { label: 'Theme / Text Main',     sourceKey: 'theme-light--text-main'    },
        { label: 'Theme / Text Heading',  sourceKey: 'theme-light--text-heading' },
        { label: 'Theme / Text Muted',    sourceKey: 'theme-light--text-muted'   },
        { label: 'Theme / Accent',        sourceKey: 'theme-light--accent'       },
        { label: 'Theme / Border',        sourceKey: 'theme-light--border'       },
      ];
      for (const { label, sourceKey } of themeTokens) {
        const hexValue = resolveVarToHex(variables[sourceKey] || '', variables);
        await upsert(label, hexValue);
      }

      // ── 3. Fetch back UUIDs and persist them for the dark bridge ──────────
      const refreshed = await fetch('/ycode/api/color-variables').then(r => r.json());
      const uuidUpdates: Record<string, string> = {};
      for (const entry of (refreshed.data || [])) {
        if (entry.name?.startsWith('Theme / ') && entry.id) {
          uuidUpdates[labelToUuidKey(entry.name)] = entry.id;
        }
      }
      if (Object.keys(uuidUpdates).length > 0) {
        const mergedVars = { ...variables, ...uuidUpdates };
        setVariables(mergedVars);

        // Build the theme dark bridge with the fresh UUIDs (can't use stale closure)
        const darkOverrides: string[] = [];
        for (const { label, darkKey } of THEME_TOKENS_MAP) {
          const uuid = uuidUpdates[labelToUuidKey(label)] ?? variables[labelToUuidKey(label)];
          if (!uuid) continue;
          const darkHex = resolveVarToHex(mergedVars[darkKey] || '', mergedVars);
          if (darkHex) darkOverrides.push(`  --${uuid}: ${darkHex};`);
        }
        const freshThemeDarkCSS = darkOverrides.length
          ? `/* Studio Theme Dark Bridge */\n.u-theme-dark {\n${darkOverrides.join('\n')}\n}`
          : '';

        const bridges = [
          generateSpacingBridgeCSS(),
          generateTypographyBridgeCSS(),
          freshThemeDarkCSS,
        ].filter(Boolean).join('\n\n');

        // Collect all color scale variables (pending since last Sync)
        const colorVarUpdates = Object.fromEntries(
          Object.entries(mergedVars).filter(([k]) => k.startsWith('color--'))
        );

        await fetch('/api/studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: { ...colorVarUpdates, ...uuidUpdates }, bridges }),
        });

        triggerIframeCSSReload();
      }

      // ── 4. Typography tokens (reuse refreshed data) ──────────────────────────
      const existingByNameTypo: Record<string, string> = {};
      for (const v of (refreshed.data || [])) existingByNameTypo[v.name] = v.id;
      const typoRequests: Promise<unknown>[] = [];
      TYPOGRAPHY_LEVELS.forEach(level => {
        ['weight', 'line-height', 'letter-spacing', 'margin-bottom'].forEach(prop => {
          const cssVarKey = `${level.key}-${prop}`;
          const name = `Studio / ${cssVarKey}`;
          const value = variables[cssVarKey] || 'inherit';
          if (existingByNameTypo[name]) {
            typoRequests.push(fetch(`/ycode/api/color-variables/${existingByNameTypo[name]}`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, value }),
            }));
          } else {
            typoRequests.push(fetch('/ycode/api/color-variables', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, value }),
            }));
          }
        });
      });
      await Promise.all(typoRequests);

      // Force Ycode's Style Panel to refresh its list without a page reload
      await loadColorVariables();

      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Studio: Failed to sync palette to Ycode', e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  /** Add a new custom color token to the theme */
  const addCustomColor = () => {
    const trimmed = newColorName.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const key = `color--custom--${slug}`;
    handleChange(key, newColorValue);
    setNewColorName('');
    setNewColorValue('#3b82f6');
  };

  /** Remove a custom color token from the theme */
  const removeCustomColor = (key: string) => {
    setVariables(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { [key]: '__remove__' } }),
    }).catch(() => {});
  };

  // ─── TYPOGRAPHY ──────────────────────────────────────────────────────────
  
  const TYPOGRAPHY_LEVELS = [
    { key: 'display', label: 'Display' },
    { key: 'h1', label: 'H1' },
    { key: 'h2', label: 'H2' },
    { key: 'h3', label: 'H3' },
    { key: 'h4', label: 'H4' },
    { key: 'h5', label: 'H5' },
    { key: 'h6', label: 'H6' },
    { key: 'large', label: 'Large' },
    { key: 'body', label: 'Body' },
    { key: 'small', label: 'Small' },
  ];

  // ─── SPACING ──────────────────────────────────────────────────────────────

  /** Spacing token definitions (key, label, steps from base) */
  const SPACE_TOKENS = [
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

  /**
   * Generate a fluid clamp() value for a given size.
   * Formula: clamp(minPx, fluidMid, maxPx)
   * where minPx = size at spaceVpMin, maxPx = size at spaceVpMax
   */
  const generateClamp = (sizePx: number): string => {
    const minPx  = sizePx;
    const maxPx  = Math.round(sizePx * spaceRatio * 100) / 100;
    // Fluid slope: (maxPx - minPx) / (vpMax - vpMin) * 100vw
    const slope  = ((maxPx - minPx) / (spaceVpMax - spaceVpMin));
    const intercept = minPx - slope * spaceVpMin;
    const minRem  = (minPx / 16).toFixed(3);
    const maxRem  = (maxPx / 16).toFixed(3);
    const intRem  = (intercept / 16).toFixed(3);
    const slopeVw = (slope * 100).toFixed(3);
    return `clamp(${minRem}rem, ${intRem}rem + ${slopeVw}vw, ${maxRem}rem)`;
  };

  /**
   * Compute the px size of a token given its step index from the base.
   * Steps < 0 divide by ratio; steps > 0 multiply by ratio.
   */
  const tokenPx = (steps: number): number => {
    if (steps >= 0) return spaceBase * Math.pow(spaceRatio, steps);
    return spaceBase / Math.pow(spaceRatio, -steps);
  };

  // ─── RUNTIME BRIDGE (v7.0) ────────────────────────────────────────────────
  /**
   * Generate the complete CSS bridge as a string.
   *
   * v8.0 — Unique-token nomenclature.
   * The bridge now targets the FULL token name (`space-m`, `space-3xs`, …)
   * rather than short suffixes (`m`, `3xs`). This eliminates any
   * cross-match risk with unrelated class fragments (e.g. `mt-auto`,
   * `pt-0`, `gap-4`) and guarantees we only ever style classes that
   * were produced by a Studio token picked in Ycode's Style Panel.
   *
   * Ycode's Style Panel emits classes like `mt-space-m` (prefix + "-" + token name)
   * when a named CSS variable is applied to a spacing property, so the
   * selector `[class*="mt-space-m" i]` is an exact, guaranteed hit.
   *
   * Values are computed from the current scale state (not from the CSS file),
   * so the bridge is always in sync with the Studio panel controls.
   */
  const generateSpacingBridgeCSS = useCallback((): string => {
    const tokens: { token: string; cssVar: string }[] = [
      { token: 'space-3xs', cssVar: '--space-3xs' },
      { token: 'space-2xs', cssVar: '--space-2xs' },
      { token: 'space-xs',  cssVar: '--space-xs'  },
      { token: 'space-s',   cssVar: '--space-s'   },
      { token: 'space-m',   cssVar: '--space-m'   },
      { token: 'space-l',   cssVar: '--space-l'   },
      { token: 'space-xl',  cssVar: '--space-xl'  },
      { token: 'space-2xl', cssVar: '--space-2xl' },
      { token: 'space-3xl', cssVar: '--space-3xl' },
      { token: 'space-0',   cssVar: '--space-0'   },
    ];

    const props: { prefix: string; property: string }[] = [
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

    // Build one rule string for a given selector + property + value
    const rule = (sel: string, property: string, val: string): string => {
      if (property.includes(':VAR')) {
        const expanded = property.replace(':VAR', `:${val}`);
        return `${sel}{${expanded}:${val}!important}`;
      }
      return `${sel}{${property}:${val}!important}`;
    };

    // Desktop selector: matches the class token WITHOUT any responsive prefix.
    // Uses start-of-attribute OR space-preceded to avoid matching "max-lg:pt-space-m".
    const desktopSel = (cls: string) =>
      `:is(${scope} [class^="${cls}"],${scope} [class*=" ${cls}"])`;

    // Responsive selector: simple substring match is safe here because the
    // breakpoint prefix ("max-lg:", "md:", …) is unique enough.
    const respSel = (bpPrefix: string, cls: string) =>
      `${scope} [class*="${bpPrefix}${cls}"]`;

    const lines: string[] = [
      '/* Studio Runtime Bridge v9.1 — breakpoint-aware, auto-generated */',
      ':root{--space-0:0px}',
    ];

    // ── Desktop base rules ───────────────────────────────────────────────────
    for (const tok of tokens) {
      const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
      for (const prop of props) {
        const cls = `${prop.prefix}-${tok.token}`;
        lines.push(rule(desktopSel(cls), prop.property, val));
      }
    }

    // ── Tablet overrides (max-width: 1024px) ─────────────────────────────────
    lines.push('@media screen and (max-width:1024px){');
    for (const tok of tokens) {
      const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
      for (const prop of props) {
        const cls = `${prop.prefix}-${tok.token}`;
        const sel = `:is(${respSel('max-lg:', cls)},${respSel('md:', cls)})`;
        lines.push(rule(sel, prop.property, val));
      }
    }
    lines.push('}');

    // ── Mobile overrides (max-width: 767px) ──────────────────────────────────
    lines.push('@media screen and (max-width:767px){');
    for (const tok of tokens) {
      const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
      for (const prop of props) {
        const cls = `${prop.prefix}-${tok.token}`;
        const sel = `:is(${respSel('max-md:', cls)},${respSel('sm:', cls)})`;
        lines.push(rule(sel, prop.property, val));
      }
    }
    lines.push('}');

    return lines.join('\n');
  }, [spaceBase, spaceRatio, spaceVpMin, spaceVpMax]);

  // ─── TYPOGRAPHY RUNTIME BRIDGE (v9.0) ─────────────────────────────────────

  const generateTypographyBridgeCSS = useCallback((): string => {
    const scope = ':where(body)';
    const lines: string[] = ['/* Studio Runtime Typography Bridge v9.0 */'];

    const smoothing = variables['font-smoothing'] === 'antialiased';
    if (smoothing) {
      lines.push(`${scope} { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }`);
    }

    TYPOGRAPHY_LEVELS.forEach(lvl => {
      let selector = '';
      if (lvl.key === 'body') {
        selector = `${scope} p`;
      } else if (lvl.key === 'display') {
        selector = `${scope} .u-text-display`;
      } else if (lvl.key === 'large') {
        selector = `${scope} .u-text-large`;
      } else if (lvl.key === 'small') {
        selector = `${scope} .u-text-small`;
      } else {
        selector = `${scope} ${lvl.key}`;
      }

      const fw = variables[`${lvl.key}-font-weight`]   || '600';
      const lh = variables[`${lvl.key}-line-height`]   || '1.4';
      const ls = variables[`${lvl.key}-letter-spacing`] || '0em';
      const mb = variables[`${lvl.key}-margin-bottom`]  || '0rem';
      lines.push(`${selector}{font-weight:${fw}!important;line-height:${lh}!important;letter-spacing:${ls}!important;margin-bottom:${mb}!important}`);
    });

    return lines.join('\n');
  }, [variables]);

  // ─── THEME DARK BRIDGE ───────────────────────────────────────────────────
  // Ycode generates bg-[color:var(--uuid)] where --uuid has a fixed hex.
  // We override --uuid inside .u-theme-dark with the resolved dark value.

  const THEME_TOKENS_MAP = [
    { label: 'Theme / BG',           darkKey: 'theme-dark--background'   },
    { label: 'Theme / Text Main',     darkKey: 'theme-dark--text-main'    },
    { label: 'Theme / Text Heading',  darkKey: 'theme-dark--text-heading' },
    { label: 'Theme / Text Muted',    darkKey: 'theme-dark--text-muted'   },
    { label: 'Theme / Accent',        darkKey: 'theme-dark--accent'       },
    { label: 'Theme / Border',        darkKey: 'theme-dark--border'       },
  ] as const;

  const labelToUuidKey = (label: string) =>
    `__uuid--${label.replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-').toLowerCase()}`;

  const generateThemeDarkBridgeCSS = useCallback((): string => {
    const overrides: string[] = [];
    for (const { label, darkKey } of THEME_TOKENS_MAP) {
      const uuid = variables[labelToUuidKey(label)];
      if (!uuid) continue;
      const darkHex = resolveVarToHex(variables[darkKey] || '', variables);
      if (darkHex) overrides.push(`  --${uuid}: ${darkHex};`);
    }
    if (!overrides.length) return '';
    return `/* Studio Theme Dark Bridge */\n.u-theme-dark {\n${overrides.join('\n')}\n}`;
  }, [variables]);

  // Stable refs so triggerIframeCSSReload always calls the latest generator
  // even when invoked from a stale saveUpdates closure.
  const spacingBridgeRef   = useRef(generateSpacingBridgeCSS);
  const typoBridgeRef      = useRef(generateTypographyBridgeCSS);
  const themeDarkBridgeRef = useRef(generateThemeDarkBridgeCSS);
  useEffect(() => { spacingBridgeRef.current   = generateSpacingBridgeCSS;   }, [generateSpacingBridgeCSS]);
  useEffect(() => { typoBridgeRef.current      = generateTypographyBridgeCSS; }, [generateTypographyBridgeCSS]);
  useEffect(() => { themeDarkBridgeRef.current = generateThemeDarkBridgeCSS;  }, [generateThemeDarkBridgeCSS]);

  /**
   * Mount / update the runtime bridge in both the host document
   * and every canvas iframe. Runs whenever the scale parameters change.
   */
  useEffect(() => {
    const css = generateSpacingBridgeCSS();
    const TAG_ID = 'studio-runtime-bridge';

    const inject = (doc: Document | null | undefined) => {
      if (!doc || !doc.head) return;

      // Spacing Bridge
      let el = doc.getElementById(TAG_ID) as HTMLStyleElement | null;
      if (!el) {
        el = doc.createElement('style') as HTMLStyleElement;
        el.id = TAG_ID;
        doc.head.appendChild(el);
      }
      el.textContent = css;

      // Typography Bridge
      const typoCSS = generateTypographyBridgeCSS();
      let typoEl = doc.getElementById('studio-runtime-typography') as HTMLStyleElement | null;
      if (!typoEl) {
        typoEl = doc.createElement('style') as HTMLStyleElement;
        typoEl.id = 'studio-runtime-typography';
        doc.head.appendChild(typoEl);
      }
      typoEl.textContent = typoCSS;

      if (doc !== document) {
        console.log(`[Studio] Successfully injected Runtime Bridges into iframe`);
      }
    };

    // 1. Host document (builder UI / Style Panel preview)
    inject(document);

    // 2. Every canvas iframe that is ALREADY in the DOM
    const injectAllIframes = () => {
      document.querySelectorAll('iframe').forEach(iframe => {
        try { inject(iframe.contentDocument); } catch { /* cross-origin — skip */ }
      });
    };
    injectAllIframes();

    // 3. Iframes that (re)load later — hook their `load` event
    const loadHandlers = new WeakMap<HTMLIFrameElement, () => void>();
    const attachLoadHandler = (iframe: HTMLIFrameElement) => {
      if (loadHandlers.has(iframe)) return;
      const handler = () => {
        try { inject(iframe.contentDocument); } catch { /* cross-origin */ }
      };
      loadHandlers.set(iframe, handler);
      iframe.addEventListener('load', handler);
    };
    document.querySelectorAll('iframe').forEach(attachLoadHandler);

    // 4. Iframes that get INSERTED into the DOM after mount — watch with MutationObserver
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node instanceof HTMLIFrameElement) {
            attachLoadHandler(node);
            try { inject(node.contentDocument); } catch { /* cross-origin */ }
          } else if (node instanceof HTMLElement) {
            node.querySelectorAll?.('iframe').forEach(iframe => {
              attachLoadHandler(iframe as HTMLIFrameElement);
              try { inject((iframe as HTMLIFrameElement).contentDocument); } catch (e) { console.debug('StudioThemeEditor: cross-origin iframe ignored', e); }
            });
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      document.querySelectorAll('iframe').forEach(iframe => {
        const h = loadHandlers.get(iframe as HTMLIFrameElement);
        if (h) iframe.removeEventListener('load', h);
      });
    };
  }, [generateSpacingBridgeCSS, generateTypographyBridgeCSS]);

  /**
   * Push spacing tokens into Ycode's color_variables store.

   *
   * v8.1 — Categorized Nomenclature.
   * The variable NAME registered in Ycode uses the "Studio / " prefix followed
   * by the raw token key (e.g. `Studio / space-m`). This keeps all variables cleanly
   * grouped in the Ycode Style Panel under the Studio folder.
   * Because Ycode derives utility classes from the full slug (e.g. `mt-studio-space-m`),
   * our Runtime Bridge's substring selector `[class*="space-m" i]` expertly
   * intercepts it regardless of the prefix string.
   */
  // Remove all non-color tokens previously pushed to Ycode color-variables (spacing, typo, legacy Lumos)
  const cleanupSpacingFromYcode = async () => {
    const existing = await fetch('/ycode/api/color-variables').then(r => r.json());
    const toDelete = (existing.data || []).filter((v: { id: string; name: string }) => {
      const n = v.name;
      return (
        // Spacing tokens (current and legacy naming)
        n.startsWith('Studio / space-') ||
        n.startsWith('Studio / Space ') ||
        // Typography tokens
        n.startsWith('Studio / h1') || n.startsWith('Studio / h2') ||
        n.startsWith('Studio / h3') || n.startsWith('Studio / h4') ||
        n.startsWith('Studio / h5') || n.startsWith('Studio / h6') ||
        n.startsWith('Studio / display') || n.startsWith('Studio / large') ||
        n.startsWith('Studio / body') || n.startsWith('Studio / small') ||
        // All legacy Lumos-prefixed tokens
        n.startsWith('Lumos /') || n.startsWith('lumos /')
      );
    });
    await Promise.all(toDelete.map((v: { id: string }) =>
      fetch(`/ycode/api/color-variables/${v.id}`, { method: 'DELETE' })
    ));
    await loadColorVariables();
  };

  const syncSpacingToYcode = async () => {
    setSpaceSyncStatus('syncing');
    try {
      await cleanupSpacingFromYcode();
      setSpaceSyncStatus('done');
      setTimeout(() => setSpaceSyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Studio: Failed to clean spacing tokens', e);
      setSpaceSyncStatus('error');
      setTimeout(() => setSpaceSyncStatus('idle'), 3000);
    }
  };

  /**
   * Push typography tokens into Ycode's color_variables store.
   * Ex: `Studio / h1-line-height`, `Studio / h1-letter-spacing`
   */
  const syncTypographyToYcode = async () => {
    setTypographySyncStatus('syncing');
    try {
      const existing = await fetch('/ycode/api/color-variables').then(r => r.json());
      const existingByName: Record<string, string> = {};
      for (const v of (existing.data || [])) existingByName[v.name] = v.id;

      const requests: Promise<any>[] = [];
      
      TYPOGRAPHY_LEVELS.forEach(level => {
        ['weight', 'line-height', 'letter-spacing', 'margin-bottom'].forEach(prop => {
          const cssVarKey = `${level.key}-${prop}`; // e.g. "h1-line-height"
          const name = `Studio / ${cssVarKey}`;
          const value = variables[cssVarKey] || 'inherit'; 
          
          if (existingByName[name]) {
            requests.push(fetch(`/ycode/api/color-variables/${existingByName[name]}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, value }),
            }));
          } else {
            requests.push(fetch('/ycode/api/color-variables', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, value }),
            }));
          }
        });
      });

      await Promise.all(requests);
      await loadColorVariables();
      saveUpdates({});
      setTypographySyncStatus('done');
      setTimeout(() => setTypographySyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Studio: Failed to sync typography', e);
      setTypographySyncStatus('error');
      setTimeout(() => setTypographySyncStatus('idle'), 3000);
    }
  };

  /** Save spacing params to global-theme.css via saveUpdates (includes bridges + publish fix) */
  const saveSpacingToTheme = () => {
    // Persist the 4 scale params so they survive a browser reload
    const updates: Record<string, string> = {
      'space-base':   String(spaceBase),
      'space-ratio':  String(spaceRatio),
      'space-vp-min': String(spaceVpMin),
      'space-vp-max': String(spaceVpMax),
    };
    SPACE_TOKENS.forEach(token => {
      const px = tokenPx(token.steps);
      updates[token.key] = generateClamp(px);
    });
    saveUpdates(updates);
  };

  const triggerIframeCSSReload = useCallback(async () => {
    try {
      // Re-fetch the full CSS from the server (with cache buster)
      const response = await fetch(`/global-theme.css?v=${Date.now()}`);
      if (!response.ok) return;
      const css = await response.text();

      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc) return;

          // Update the runtime style block (the actual mechanism used by Canvas.tsx)
          const styleEl = iframeDoc.getElementById('studio-runtime-css') as HTMLStyleElement | null;
          if (styleEl) styleEl.textContent = css;

          // Re-inject bridges using refs — always fresh, never stale
          const bridgeCSS = spacingBridgeRef.current();
          let bridgeEl = iframeDoc.getElementById('studio-runtime-bridge') as HTMLStyleElement | null;
          if (!bridgeEl) {
            bridgeEl = iframeDoc.createElement('style') as HTMLStyleElement;
            bridgeEl.id = 'studio-runtime-bridge';
            iframeDoc.head.appendChild(bridgeEl);
          }
          bridgeEl.textContent = bridgeCSS;

          const typoCSS = typoBridgeRef.current();
          let typoEl = iframeDoc.getElementById('studio-runtime-typography') as HTMLStyleElement | null;
          if (!typoEl) {
            typoEl = iframeDoc.createElement('style') as HTMLStyleElement;
            typoEl.id = 'studio-runtime-typography';
            iframeDoc.head.appendChild(typoEl);
          }
          typoEl.textContent = typoCSS;

          const themeDarkCSS = themeDarkBridgeRef.current();
          if (themeDarkCSS) {
            let themeEl = iframeDoc.getElementById('studio-runtime-theme-dark') as HTMLStyleElement | null;
            if (!themeEl) {
              themeEl = iframeDoc.createElement('style') as HTMLStyleElement;
              themeEl.id = 'studio-runtime-theme-dark';
              iframeDoc.head.appendChild(themeEl);
            }
            themeEl.textContent = themeDarkCSS;
          }
        } catch (e) {
          // Ignore cross-origin iframe errors
        }
      });
    } catch (e) {
      console.warn('Studio: Failed to reload iframe CSS', e);
    }
    // Refs are stable — no deps needed; bridge generators accessed via refs
   
  }, []);

  const getCompleteBridgeCSS = useCallback(() => {
    const parts = [
      generateSpacingBridgeCSS(),
      generateTypographyBridgeCSS(),
    ];
    const themeDark = generateThemeDarkBridgeCSS();
    if (themeDark) parts.push(themeDark);
    return parts.join('\n\n');
  }, [generateSpacingBridgeCSS, generateTypographyBridgeCSS, generateThemeDarkBridgeCSS]);

  // ─── FIGMA / W3C DESIGN TOKENS — EXPORT + IMPORT ────────────────────────────
  //
  // Format : W3C Design Tokens Community Group spec (utilisé par Figma Variables)
  //   { "variable-name": { "$type": "color"|"number"|"string", "$value": ... } }
  //
  // Figma couleur export :  $value = { hex: "#...", components: [...], ... }
  // Notre export (import Figma) :  $value = "#hex" (Figma accepte les strings hex)
  //
  // Conversions :
  //   font-size  rem → px   (Studio: "2" = 2rem → Figma: 32)
  //   letter-spacing strip "em"  ("-0.02em" → -0.02)
  //   color var() → hex résolu
  //   exclus : colonnes, gutter, clamp, margin-bottom

  const TYPO_LEVELS   = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'] as const;
  const TYPO_SIZE_IDS = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'text-large', 'text-main', 'text-small'] as const;

  const remToPx   = (v: string) => String(Math.round(parseFloat(v) * 16));
  const pxToRem   = (v: string) => String(parseFloat(v) / 16);
  // Convert a CSS length (rem or px) to raw pixels for Figma export (unitless number)
  const cssValToPx = (v: string): number => {
    const n = parseFloat(v);
    return v.trim().endsWith('rem') ? Math.round(n * 16 * 1000) / 1000 : n;
  };
  const stripEm   = (v: string) => v.replace(/em$/i, '');
  const addEm     = (v: string) => `${parseFloat(v)}em`;
  const firstFont = (v: string) => v.split(',')[0].trim().replace(/['"]/g, '');

  // Bidirectional map: token name in JSON ↔ CSS variable key in Studio
  const FIELD_MAP: Record<string, { css: string; type: 'number' | 'string'; out?: (v: string) => string; in?: (v: string) => string }> = {
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

  // Reverse map: CSS key → token name (for parsing Figma imports)
  const CSS_TO_TOKEN: Record<string, string> = Object.fromEntries(
    Object.entries(FIELD_MAP).map(([token, { css }]) => [css, token])
  );

  // ── EXPORT — ZIP multi-collections ──────────────────────────────────────────
  const exportCollections = () => {
    const enc   = new TextEncoder();
    const tok   = (type: 'color' | 'number' | 'string', value: string | number) => ({ $type: type, $value: value });
    const hex   = (k: string) => { const r = variables[k] || ''; return r.startsWith('#') ? r : resolveVarToHex(r, variables); };
    const num   = (v: string | number) => parseFloat(String(v));
    const json  = (obj: unknown) => enc.encode(JSON.stringify(obj, null, 2));

    // ── 1. Swatch — palette couleurs ─────────────────────────────────────────
    const swatch: Record<string, unknown> = {};
    for (const k of Object.keys(variables).filter(k => k.startsWith('color--'))) {
      const h = hex(k); if (h) swatch[k] = tok('color', h);
    }
    swatch['$extensions'] = { 'com.figma.modeName': 'Value' };

    // ── 2. Sizes Desktop — font-size max, spacing desktop, radius, border ────
    const sizeFnDesktop = (lvl: string) => {
      const raw = variables[`_typography---font-size--${lvl}-max`];
      return raw ? Math.round(parseFloat(raw) * 16) : undefined;
    };
    const sizeFnMobile = (lvl: string) => {
      const raw = variables[`_typography---font-size--${lvl}-min`];
      return raw ? Math.round(parseFloat(raw) * 16) : undefined;
    };
    const buildFontSizes = (fn: (l: string) => number | undefined) =>
      Object.fromEntries(
        TYPO_SIZE_IDS.map(lvl => [lvl, tok('number', fn(lvl) ?? 16)]).filter(([, v]) => (v as any).$value)
      );
    const buildSpacing = (desktop: boolean) => {
      const out: Record<string, unknown> = {};
      SPACE_TOKENS.forEach(({ key, steps }) => {
        const base = spaceBase * Math.pow(spaceRatio, Math.abs(steps)) * (steps < 0 ? 1 / Math.pow(spaceRatio, Math.abs(steps)) : 1);
        const px = Math.round(desktop ? base * spaceRatio : base);
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

    // ── 3. Typography ────────────────────────────────────────────────────────
    const typography: Record<string, unknown> = {
      'primary-family': tok('string', firstFont(variables['_typography---font-family-headings'] || 'inherit')),
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

    // ── 4. Theme Light & Dark ────────────────────────────────────────────────
    const themeFile = (mode: 'light' | 'dark', figmaMode: string) => {
      const pre = `theme-${mode}--`;
      const slot = (k: string) => { const h = hex(pre + k); return h ? tok('color', h) : undefined; };
      const theme: Record<string, unknown> = {};
      const themeSlots: Record<string, unknown> = {};
      for (const [figmaKey, cssKey] of [
        ['background',   'background'],
        ['background-2', 'background-2'],
        ['text',         'text-main'],
        ['text-heading', 'text-heading'],
        ['text-muted',   'text-muted'],
        ['border',       'border'],
        ['accent',       'accent'],
      ] as [string, string][]) {
        const t = slot(cssKey); if (t) themeSlots[figmaKey] = t;
      }
      theme['theme'] = themeSlots;
      theme['$extensions'] = { 'com.figma.modeName': figmaMode };
      return theme;
    };

    // ── Assemble ZIP ─────────────────────────────────────────────────────────
    const files = [
      { name: 'Swatch.tokens.json',          data: json(swatch)       },
      { name: 'Sizes.Desktop.tokens.json',   data: json(sizesDesktop) },
      { name: 'Sizes.Mobile.tokens.json',    data: json(sizesMobile)  },
      { name: 'Typography.tokens.json',      data: json(typography)   },
      { name: 'Theme.Light.tokens.json',     data: json(themeFile('light', 'Light')) },
      { name: 'Theme.Dark.tokens.json',      data: json(themeFile('dark',  'Dark'))  },
    ];

    const zip  = buildZip(files);
    const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'ycode-studio-theme.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── IMPORT — handles single-file Figma W3C token collections ────────────────
  // Each file carries $extensions.com.figma.modeName to identify its collection:
  //   "Value"     → Swatch (color-- tokens)
  //   "Desktop"   → font-size → *-max, radius, border-width
  //   "Mobile"    → font-size → *-min
  //   "Base mode" → Typography (weights, line-heights, letter-spacings, families)
  //   "Light"     → theme-light-- tokens
  //   "Dark"      → theme-dark-- tokens
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImportStatus('importing');
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;

      const cssUpdates: Record<string, string> = {};

      // Detect collection mode
      const ext = raw['$extensions'] as Record<string, unknown> | undefined;
      const mode = ext?.['com.figma.modeName'] as string | undefined;

      // Extract hex from color $value (string "#hex" or Figma object {hex, components, alpha})
      const extractHex = (val: unknown): string | null => {
        if (typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val)) return val;
        if (typeof val === 'object' && val !== null) {
          const v = val as Record<string, unknown>;
          if (typeof v.hex === 'string') return v.hex;
        }
        return null;
      };

      // Map weight string names to numeric values
      const weightToNum = (v: string): string => {
        const map: Record<string, string> = {
          'thin': '100', 'extralight': '200', 'light': '300', 'regular': '400',
          'medium': '500', 'semibold': '600', 'semi bold': '600',
          'bold': '700', 'extrabold': '800', 'extra bold': '800', 'black': '900',
        };
        const n = parseFloat(v);
        if (!isNaN(n)) return String(n);
        return map[v.toLowerCase().trim()] || v;
      };

      // Recursively flatten nested token objects into { path, type, value } entries.
      // Stops at nodes that have a $type field (W3C leaf tokens).
      const flattenTokens = (
        obj: Record<string, unknown>,
        prefix = ''
      ): Array<{ path: string; type: string; value: unknown }> => {
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

      // ── Swatch (Value) ──────────────────────────────────────────────────────
      if (!mode || mode === 'Value') {
        for (const { path, type, value } of tokens) {
          if (type !== 'color') continue;
          if (typeof value === 'string' && value.startsWith('{')) continue; // alias → skip
          const h = extractHex(value);
          if (h) cssUpdates[path] = h; // path == CSS key (e.g. "color--primary-900")
        }
      }

      // ── Sizes Desktop ───────────────────────────────────────────────────────
      if (mode === 'Desktop') {
        for (const { path, type, value } of tokens) {
          if (type !== 'number' || typeof value !== 'number') continue;
          const parts = path.split('.');
          if (parts[0] === 'font-size' && parts[1]) {
            cssUpdates[`_typography---font-size--${parts[1]}-max`] = String(value / 16);
          } else if (parts[0] === 'radius' && parts[1]) {
            cssUpdates[`radius--${parts[1]}`] = parts[1] === 'round' ? '9999px' : `${value / 16}rem`;
          } else if (parts[0] === 'border-width' && parts[1]) {
            cssUpdates[`border-width--${parts[1]}`] = `${Math.round(value / 16 * 10000) / 10000}rem`;
          }
          // space.* intentionally skipped — Studio keeps ratio system
        }
      }

      // ── Sizes Mobile ────────────────────────────────────────────────────────
      if (mode === 'Mobile') {
        for (const { path, type, value } of tokens) {
          if (type !== 'number' || typeof value !== 'number') continue;
          const parts = path.split('.');
          if (parts[0] === 'font-size' && parts[1]) {
            cssUpdates[`_typography---font-size--${parts[1]}-min`] = String(value / 16);
          }
        }
      }

      // ── Typography (Base mode) ──────────────────────────────────────────────
      if (mode === 'Base mode') {
        for (const { path, value } of tokens) {
          const v = String(value);
          if (path === 'primary-family') {
            cssUpdates['_typography---font-family-headings'] = v;
          } else if (path === 'secondary-family') {
            cssUpdates['_typography---font-family-body'] = v;
          } else {
            const wm = path.match(/^(.+)-weight$/);
            const lm = path.match(/^(.+)-line-height$/);
            const sm = path.match(/^(.+)-letter-spacing$/);
            if (wm)      cssUpdates[`${wm[1]}-font-weight`]    = weightToNum(v);
            else if (lm) cssUpdates[`${lm[1]}-line-height`]    = v;
            else if (sm) cssUpdates[`${sm[1]}-letter-spacing`] = addEm(v);
          }
        }
      }

      // ── Theme Light / Dark ──────────────────────────────────────────────────
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
          const key = path.split('.').pop()!; // last path segment
          const cssKey = themeMap[key];
          if (cssKey) cssUpdates[`${pre}${cssKey}`] = h;
        }
      }

      if (Object.keys(cssUpdates).length === 0) throw new Error('Aucun token reconnu');

      if (cssUpdates['space-base'])  setSpaceBase(Number(cssUpdates['space-base']));
      if (cssUpdates['space-ratio']) setSpaceRatio(Number(cssUpdates['space-ratio']));

      setVariables(prev => ({ ...prev, ...cssUpdates }));
      await saveUpdates(cssUpdates);

      setImportStatus('done');
      setTimeout(() => setImportStatus('idle'), 3000);
    } catch (err) {
      console.error('Studio: import failed', err);
      setImportStatus('error');
      setTimeout(() => setImportStatus('idle'), 3000);
    }
  };

  const saveUpdates = useCallback(async (updates: Record<string, string>) => {
    try {
      const combinedBridges = getCompleteBridgeCSS();

      await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, bridges: combinedBridges })
      });
      triggerIframeCSSReload();

      // Safari sync block for Ycode DB
      try {
        const settingsRes = await fetch('/ycode/api/settings/custom_css');
        if (settingsRes.ok) {
          const json = await settingsRes.json();
          const currentCustomCss = json.data || '';
          
          const startMarker = '/* STUDIO_RUNTIME_BRIDGES_START */';
          const endMarker = '/* STUDIO_RUNTIME_BRIDGES_END */';
          const varBlock = `:root {\n${Object.entries(variables).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}`;
          const bridgeBlock = `\n${startMarker}\n${varBlock}\n\n${combinedBridges}\n${endMarker}\n`;
          
          let newCss = currentCustomCss;
          if (newCss.includes(startMarker) && newCss.includes(endMarker)) {
            const startIdx = newCss.indexOf(startMarker);
            const endIdx = newCss.indexOf(endMarker) + endMarker.length;
            newCss = newCss.substring(0, startIdx) + bridgeBlock + newCss.substring(endIdx);
          } else {
            newCss = newCss.trimEnd() + bridgeBlock;
          }
          
          await fetch('/ycode/api/settings/custom_css', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: newCss })
          });
        }
      } catch (err) {
        console.warn('Studio: Failed to auto-sync with custom_css', err);
      }
    } catch (e) {
      console.error('Failed to save Studio variables', e);
    }
  }, [triggerIframeCSSReload, getCompleteBridgeCSS, variables]);

  const debouncedSave = useDebounce(saveUpdates, 300);

  const handleChange = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
    debouncedSave({ [key]: value });
  };

  const resetTypographyToDefaults = () => {
    const updates: Record<string, string> = {};
    ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'].forEach(lvl => {
      updates[`${lvl}-font-weight`] = '600';
      updates[`${lvl}-letter-spacing`] = '0em';
      updates[`${lvl}-margin-bottom`] = '0rem';

      if (['display', 'h1', 'h2'].includes(lvl)) updates[`${lvl}-line-height`] = '1.2';
      else if (lvl === 'h3') updates[`${lvl}-line-height`] = '1.3';
      else if (['h4', 'h5'].includes(lvl)) updates[`${lvl}-line-height`] = '1.4';
      else updates[`${lvl}-line-height`] = '1.5';
    });
    setVariables(prev => ({ ...prev, ...updates }));
    saveUpdates(updates);
  };

  const [openSection, setOpenSection] = useState<string>('general');

  if (!isBuilder) return null;
  if (loading) return null;

  const renderNumberInput = (label: string, key: string, step = '0.1') => (
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-xs text-muted-foreground w-1/2">{label}</label>
      <input
        type="number"
        step={step}
        className="w-1/2 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
        value={variables[key] || ''}
        onChange={(e) => handleChange(key, e.target.value)}
      />
    </div>
  );

  const renderTextInput = (label: string, key: string) => (
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-xs text-muted-foreground w-1/2">{label}</label>
      <input
        type="text"
        className="w-1/2 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
        value={variables[key] || ''}
        onChange={(e) => handleChange(key, e.target.value)}
      />
    </div>
  );

  const renderRoleSelector = (label: string, key: string) => {
    const googleAndCustomFonts = usedFonts.filter(f => f.type !== 'default');

    // Map raw CSS value back to a select-friendly value (strip quotes and fallbacks)
    const currentRaw = variables[key] || 'inherit';
    const currentSelected = currentRaw
      .split(',')[0]           // take first family only
      .replace(/^['"]|['"]$/g, '') // strip quotes
      .trim() || 'inherit';

    // Map a family name to a safe CSS font-family value with generic fallback
    const getFontFamilyCSS = (familyName: string): string => {
      if (['inherit', 'sans-serif', 'serif', 'monospace'].includes(familyName)) {
        return familyName;
      }
      // Determine generic family from project fonts store
      const font = googleAndCustomFonts.find(f => f.family === familyName);
      const genericFamily = font?.category || 'sans-serif';
      return `'${familyName}', ${genericFamily}`;
    };

    return (
      <div className="flex flex-col gap-1 mb-4">
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
        <select
          className="w-full bg-muted border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          value={currentSelected}
          onChange={(e) => {
            const cssValue = getFontFamilyCSS(e.target.value);
            handleChange(key, cssValue);
          }}
        >
          <option value="inherit">— Default (Inherit) —</option>
          <optgroup label="System Fonts">
            <option value="sans-serif">Sans Serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
          </optgroup>
          {googleAndCustomFonts.length > 0 && (
            <optgroup label="Your Fonts">
              {googleAndCustomFonts.map(f => (
                <option key={f.id} value={f.family}>{f.family}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  };

  // ─── COLOR SCALE GENERATION ──────────────────────────────────────────────

  const hexToHsl = (hex: string): [number, number, number] | null => {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    const r = parseInt(m[1].slice(0, 2), 16) / 255;
    const g = parseInt(m[1].slice(2, 4), 16) / 255;
    const b = parseInt(m[1].slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l * 100];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    h /= 360; s /= 100; l /= 100;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let r: number, g: number, b: number;
    if (s === 0) { r = g = b = l; } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    const toHex = (x: number) => Math.round(Math.min(255, Math.max(0, x * 255))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const generateColorScale = (baseHex: string, prefix: string): Record<string, string> => {
    const hsl = hexToHsl(baseHex);
    if (!hsl) return {};
    const [h, s, baseLightness] = hsl;
    const result: Record<string, string> = { [`color--${prefix}-500`]: baseHex };
    const darkerSteps = [600, 700, 800, 900] as const;
    darkerSteps.forEach((step, idx) => {
      const t = (idx + 1) / darkerSteps.length;
      const lightness = baseLightness * (1 - t) + 10 * t;
      const saturation = s * (1 - t * 0.25);
      result[`color--${prefix}-${step}`] = hslToHex(h, Math.min(100, saturation), Math.max(0, lightness));
    });
    const lighterSteps = [400, 300, 200, 100, 50] as const;
    lighterSteps.forEach((step, idx) => {
      const t = (idx + 1) / lighterSteps.length;
      const lightness = baseLightness + (97 - baseLightness) * t;
      const saturation = s * (1 - t * 0.65);
      result[`color--${prefix}-${step}`] = hslToHex(h, Math.max(0, saturation), Math.min(100, lightness));
    });
    return result;
  };

  const applyColorScale = (baseHex: string, prefix: string) => {
    const scale = generateColorScale(baseHex, prefix);
    if (!Object.keys(scale).length) return;
    setVariables(prev => ({ ...prev, ...scale }));
    // Canvas updates on Sync only — no saveUpdates here
  };

  const renderColorScaleSection = (title: string, prefix: string) => {
    const baseHex = variables[`color--${prefix}-500`] || '#5465FF';
    const hexVal = baseHex.startsWith('#') && baseHex.length >= 7 ? baseHex.substring(0, 7) : '#5465FF';
    return (
      <div>
        <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3 flex justify-between items-center">
          <h4 className="text-xs font-semibold">{title}</h4>
          <span className="text-[10px] text-muted-foreground">auto scale</span>
        </div>
        {/* Base color picker */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <label className="text-xs text-muted-foreground w-1/3 truncate">Base (500)</label>
          <div className="flex items-center gap-2 w-2/3">
            <input
              type="color"
              className="w-6 h-6 p-0 border-border rounded cursor-pointer shrink-0"
              value={hexVal}
              onChange={(e) => applyColorScale(e.target.value, prefix)}
            />
            <input
              type="text"
              className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
              value={variables[`color--${prefix}-500`] || ''}
              onChange={(e) => {
                const v = e.target.value;
                handleChange(`color--${prefix}-500`, v);
                if (/^#[0-9a-f]{6}$/i.test(v)) applyColorScale(v, prefix);
              }}
            />
          </div>
        </div>
        {/* Swatch preview strip */}
        <div className="flex gap-0.5 mb-3 rounded overflow-hidden h-6">
          {COLOR_SCALE_STEPS.map(step => {
            const color = variables[`color--${prefix}-${step}`] || '#ccc';
            return (
              <div
                key={step}
                className="flex-1 cursor-pointer hover:scale-y-110 transition-transform origin-bottom"
                style={{ backgroundColor: color }}
                title={`${step}: ${color}`}
              />
            );
          })}
        </div>
        {/* Individual fine-tune inputs */}
        <details className="group">
          <summary className="text-[10px] text-muted-foreground cursor-pointer select-none mb-2 flex items-center gap-1">
            <svg
              className="w-3 h-3 group-open:rotate-90 transition-transform" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="2"
            ><path d="m9 18 6-6-6-6" /></svg>
            Adjust individually
          </summary>
          <div className="mt-1">
            {COLOR_SCALE_STEPS.map(step => renderColorInput(String(step), `color--${prefix}-${step}`))}
          </div>
        </details>
      </div>
    );
  };

  // ─── THEME SLOT (picks from color scale variables) ───────────────────────

  const COLOR_GROUPS = [
    { label: 'Primary',   prefix: 'primary'   },
    { label: 'Secondary', prefix: 'secondary' },
    { label: 'Grey',      prefix: 'grey'       },
  ] as const;

  const renderThemeSlot = (label: string, key: string) => {
    const storedValue = variables[key] || '';
    const swatchColor = resolveVarToHex(storedValue, variables) || '#000000';
    const isVar = storedValue.startsWith('var(');
    const selectedKey = isVar ? storedValue.match(/^var\(--(.+?)\)$/)?.[1] ?? '' : '__custom__';
    const customHex = !isVar && storedValue.startsWith('#') ? storedValue.substring(0, 7) : '#000000';

    const customColors = Object.keys(variables)
      .filter(k => k.startsWith('color--custom--') && variables[k]?.startsWith('#'));

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="text-xs text-muted-foreground w-1/3 truncate">{label}</label>
          <div className="flex items-center gap-2 w-2/3">
            <div
              className="w-6 h-6 rounded border border-border shrink-0"
              style={{ backgroundColor: swatchColor }}
            />
            <select
              className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
              value={selectedKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') {
                  handleChange(key, customHex);
                } else {
                  handleChange(key, `var(--${v})`);
                }
              }}
            >
              <option value="__custom__">Custom…</option>
              {COLOR_GROUPS.map(({ label: gLabel, prefix }) => (
                <optgroup key={prefix} label={gLabel}>
                  {COLOR_SCALE_STEPS.map(step => {
                    const k = `color--${prefix}-${step}`;
                    return variables[k] ? (
                      <option key={k} value={k}>{gLabel} {step}</option>
                    ) : null;
                  })}
                </optgroup>
              ))}
              {customColors.length > 0 && (
                <optgroup label="Custom">
                  {customColors.map(k => (
                    <option key={k} value={k}>{k.replace('color--custom--', '')}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
        {selectedKey === '__custom__' && (
          <div className="flex items-center gap-2 pl-[calc(33%+0.5rem)]">
            <input
              type="color"
              className="w-6 h-6 p-0 border-border rounded cursor-pointer shrink-0"
              value={customHex}
              onChange={(e) => handleChange(key, e.target.value)}
            />
            <input
              type="text"
              className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
              value={storedValue}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  const renderColorInput = (label: string, key: string) => {
    // Basic fix to extract hex from potential var() fallback or raw string 
    // Usually <input type="color"> requires 6-digit hex
    const rawVal = variables[key] || '#000000';
    const hexVal = rawVal.startsWith('#') && rawVal.length >= 7 ? rawVal.substring(0, 7) : '#000000';

    return (
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs text-muted-foreground w-1/3 truncate">{label}</label>
        <div className="flex items-center gap-2 w-2/3">
          <input
            type="color"
            className="w-6 h-6 p-0 border-border rounded cursor-pointer shrink-0"
            value={hexVal}
            onChange={(e) => handleChange(key, e.target.value)}
          />
          <input
            type="text"
            className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
            value={rawVal}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderAccordion = (title: string, id: string, children: React.ReactNode) => (
    <div className="border border-border rounded-md mb-2">
      <button
        className="w-full flex items-center justify-between px-3 py-3 bg-white dark:bg-zinc-900 border-b border-border hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold transition-colors sticky top-0 z-[100] rounded-t-md shadow-sm"
        onClick={() => setOpenSection(openSection === id ? '' : id)}
      >
        {title}
        <svg
          xmlns="http://www.w3.org/2000/svg" width="16"
          height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" className={`transition-transform text-muted-foreground ${openSection === id ? 'rotate-180' : ''}`}
        ><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {openSection === id && (
        <div className="p-4 bg-background rounded-b-md">
          {children}
        </div>
      )}
    </div>
  );

  const renderPairGroups = (pairs: {label: string, minKey: string, maxKey: string}[]) => (
    <div>
      {pairs.map(pair => (
        <div key={pair.label} className="mb-4 last:mb-0">
          <div className="text-xs font-semibold mb-2">{pair.label}</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Min</label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={variables[pair.minKey] || ''}
                onChange={(e) => handleChange(pair.minKey, e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Max</label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={variables[pair.maxKey] || ''}
                onChange={(e) => handleChange(pair.maxKey, e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const typographyPairs = [
    { label: 'Display', minKey: '_typography---font-size--display-min', maxKey: '_typography---font-size--display-max' },
    { label: 'Heading 1', minKey: '_typography---font-size--h1-min', maxKey: '_typography---font-size--h1-max' },
    { label: 'Heading 2', minKey: '_typography---font-size--h2-min', maxKey: '_typography---font-size--h2-max' },
    { label: 'Heading 3', minKey: '_typography---font-size--h3-min', maxKey: '_typography---font-size--h3-max' },
    { label: 'Heading 4', minKey: '_typography---font-size--h4-min', maxKey: '_typography---font-size--h4-max' },
    { label: 'Heading 5', minKey: '_typography---font-size--h5-min', maxKey: '_typography---font-size--h5-max' },
    { label: 'Heading 6', minKey: '_typography---font-size--h6-min', maxKey: '_typography---font-size--h6-max' },
    { label: 'Text Large', minKey: '_typography---font-size--text-large-min', maxKey: '_typography---font-size--text-large-max' },
    { label: 'Paragraph (Main)', minKey: '_typography---font-size--text-main-min', maxKey: '_typography---font-size--text-main-max' },
    { label: 'Text Small', minKey: '_typography---font-size--text-small-min', maxKey: '_typography---font-size--text-small-max' },
  ];

  const content = (
    <div className="flex flex-col w-full pb-8 pr-1 overflow-visible">
      {renderAccordion('General', 'general', (
        <>
          <div className="mb-4">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
              <h4 className="text-xs font-semibold">Viewport (Unitless)</h4>
            </div>
            {renderNumberInput('Max Width', 'site--viewport-max', '1')}
            {renderNumberInput('Min Width', 'site--viewport-min', '1')}
          </div>
          <div className="mb-4">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
              <h4 className="text-xs font-semibold">Grid & Layout</h4>
            </div>
            {renderNumberInput('Columns', 'site--column-count', '1')}
            {renderTextInput('Gutter', 'site--gutter')}
          </div>
          <div>
            {renderPairGroups([{ label: 'Site Margin (REM)', minKey: 'site--margin-min', maxKey: 'site--margin-max' }])}
          </div>
        </>
      ))}

      {renderAccordion('Type Size', 'typesize', renderPairGroups(typographyPairs))}

      {renderAccordion('Typography', 'typography', (
        <>
          {/* Font Roles — primary controls */}
          <div className="mb-4">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
              <h4 className="text-xs font-semibold">Font Roles</h4>
            </div>
            {renderRoleSelector('Primary (Headings & Display)', '_typography---font-family-headings')}
            {renderRoleSelector('Secondary (Body & Text)', '_typography---font-family-body')}
          </div>

          <div className="pt-4 border-t border-border">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3 flex items-center justify-between">
              <h4 className="text-xs font-semibold">Typography Levels</h4>
              <label className="flex items-center gap-2 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={variables['font-smoothing'] === 'antialiased'}
                  onChange={(e) => handleChange('font-smoothing', e.target.checked ? 'antialiased' : 'auto')}
                />
                Font Smoothing
              </label>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[580px] space-y-3">
                <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/50">
                  <div>Level</div>
                  <div>Weight</div>
                  <div>Line-H (%)</div>
                  <div>Tracking (em)</div>
                  <div>Margin-B (rem)</div>
                </div>
                {TYPOGRAPHY_LEVELS.map(level => (
                  <div key={level.key} className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-3 items-center">
                    <div className="text-xs font-semibold shrink-0">{level.label}</div>
                    <input
                      type="number" step="100"
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:bg-background transition-colors"
                      value={variables[`${level.key}-font-weight`] || ''}
                      onChange={e => handleChange(`${level.key}-font-weight`, e.target.value)}
                    />
                    <input
                      type="number" step="1"
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:bg-background transition-colors"
                      value={variables[`${level.key}-line-height`] ? Math.round(parseFloat(variables[`${level.key}-line-height`]) * 100) : ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleChange(`${level.key}-line-height`, (val / 100).toString());
                        } else if (e.target.value === '') {
                          handleChange(`${level.key}-line-height`, '');
                        }
                      }}
                    />
                    <input
                      type="number" step="0.01"
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:bg-background transition-colors"
                      value={variables[`${level.key}-letter-spacing`] ? variables[`${level.key}-letter-spacing`].replace('em', '') : ''}
                      onChange={e => handleChange(`${level.key}-letter-spacing`, e.target.value ? `${e.target.value}em` : '0em')}
                    />
                    <input
                      type="number" step="0.1"
                      className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-ring focus:bg-background transition-colors"
                      value={variables[`${level.key}-margin-bottom`] ? variables[`${level.key}-margin-bottom`].replace(/em|rem/, '') : ''}
                      onChange={e => handleChange(`${level.key}-margin-bottom`, e.target.value ? `${e.target.value}rem` : '0rem')}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={resetTypographyToDefaults}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                bg-background border border-border hover:bg-muted"
            >
              ↺ Reset to System Defaults
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold mb-2">Text Trim (Capsize)</h4>
            {renderTextInput('Trim Top (em)', '_text-style---trim-top')}
            {renderTextInput('Trim Bottom (em)', '_text-style---trim-bottom')}
            {renderTextInput('Optical Offset (em)', '_text-style---optical-offset')}
          </div>
        </>
      ))}

      {renderAccordion('Colors', 'colors', (
        <>

          {renderColorScaleSection('Primary', 'primary')}

          <div className="mt-4 pt-2 border-t border-border">
            {renderColorScaleSection('Secondary', 'secondary')}
          </div>

          <div className="mt-4 pt-2 border-t border-border">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3 flex justify-between items-center">
              <h4 className="text-xs font-semibold">Grey Scale</h4>
              <span className="text-[10px] text-muted-foreground">900 → 50</span>
            </div>
            {renderColorInput('900', 'color--grey-900')}
            {renderColorInput('800', 'color--grey-800')}
            {renderColorInput('700', 'color--grey-700')}
            {renderColorInput('600', 'color--grey-600')}
            {renderColorInput('500', 'color--grey-500')}
            {renderColorInput('400', 'color--grey-400')}
            {renderColorInput('300', 'color--grey-300')}
            {renderColorInput('200', 'color--grey-200')}
            {renderColorInput('100', 'color--grey-100')}
            {renderColorInput('50', 'color--grey-50')}
          </div>

          {/* Custom Colors — user-defined tokens */}
          <div className="mt-4 pt-2 border-t border-border">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3 flex justify-between items-center">
              <h4 className="text-xs font-semibold">Custom Colors</h4>
              <span className="text-[10px] text-muted-foreground">
                {Object.keys(variables).filter(k => k.startsWith('color--custom--')).length} tokens
              </span>
            </div>

            {/* Existing custom tokens */}
            {Object.keys(variables)
              .filter(k => k.startsWith('color--custom--'))
              .map(key => {
                const label = key
                  .replace('color--custom--', '')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase());
                const rawVal = variables[key] || '#000000';
                const hexVal = rawVal.startsWith('#') && rawVal.length >= 7 ? rawVal.substring(0, 7) : '#000000';
                return (
                  <div key={key} className="flex items-center gap-2 mb-2 group">
                    <input
                      type="color"
                      className="w-6 h-6 p-0 border-border rounded cursor-pointer shrink-0"
                      value={hexVal}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                    <span className="flex-1 text-xs truncate capitalize" title={label}>{label}</span>
                    <button
                      onClick={() => removeCustomColor(key)}
                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 text-[10px] transition-opacity shrink-0"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            }

            {/* Inline add form */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
              <input
                type="color"
                className="w-7 h-7 p-0 border-border rounded cursor-pointer shrink-0"
                value={newColorValue}
                onChange={(e) => setNewColorValue(e.target.value)}
              />
              <input
                type="text"
                placeholder="Token name (e.g. Accent)"
                className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={newColorName}
                onChange={(e) => setNewColorName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomColor()}
              />
              <button
                onClick={addCustomColor}
                disabled={!newColorName.trim()}
                className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                +
              </button>
            </div>
          </div>
        </>
      ))}

      {renderAccordion('Theme', 'theme', (
        <>
          <div className="mb-4">
            <h4 className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 mb-2 border border-zinc-200">LIGHT</h4>
            {renderThemeSlot('Background', 'theme-light--background')}
            {renderThemeSlot('Background 2', 'theme-light--background-2')}
            {renderThemeSlot('Text Main', 'theme-light--text-main')}
            {renderThemeSlot('Text Heading', 'theme-light--text-heading')}
            {renderThemeSlot('Text Muted', 'theme-light--text-muted')}
            {renderThemeSlot('Border', 'theme-light--border')}
            {renderThemeSlot('Accent', 'theme-light--accent')}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-zinc-100 mb-2 border border-zinc-700">DARK</h4>
            {renderThemeSlot('Background', 'theme-dark--background')}
            {renderThemeSlot('Background 2', 'theme-dark--background-2')}
            {renderThemeSlot('Text Main', 'theme-dark--text-main')}
            {renderThemeSlot('Text Heading', 'theme-dark--text-heading')}
            {renderThemeSlot('Text Muted', 'theme-dark--text-muted')}
            {renderThemeSlot('Border', 'theme-dark--border')}
            {renderThemeSlot('Accent', 'theme-dark--accent')}
          </div>
        </>
      ))}

      {renderAccordion('Radius & Borders', 'radius', (
        <>
          <div className="mb-4">
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
              <h4 className="text-xs font-semibold">Border Radius</h4>
            </div>
            {renderTextInput('Small', 'radius--small')}
            {renderTextInput('Main', 'radius--main')}
            {renderTextInput('Round', 'radius--round')}
          </div>
          <div>
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
              <h4 className="text-xs font-semibold">Border Width</h4>
            </div>
            {renderTextInput('Main', 'border-width--main')}
          </div>
        </>
      ))}

      {renderAccordion('Layout Utilities', 'layout-utils', (
        <div className="space-y-4 text-xs">
          {/* Breakpoint cascade reminder */}
          <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm">
            <h4 className="text-xs font-semibold">Prefixes responsifs</h4>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-1">
            {[
              { bp: 'Desktop', prefix: '—', sub: 'aucun préfixe' },
              { bp: 'Tablette', prefix: 'max-lg:', sub: 'ou md:' },
              { bp: 'Mobile', prefix: 'max-md:', sub: 'ou sm:' },
            ].map(({ bp, prefix, sub }) => (
              <div key={bp} className="bg-muted rounded-md p-2 text-center">
                <div className="font-semibold text-[10px] text-muted-foreground mb-1">{bp}</div>
                <code className="block text-[11px] font-mono font-bold text-foreground">{prefix}</code>
                <div className="text-[9px] text-muted-foreground mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Mobile hérite de la tablette si aucune classe mobile n&apos;est définie. Tablette hérite du desktop.
          </p>

          {/* u-grid-outset */}
          <div>
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-2">
              <h4 className="text-xs font-semibold">u-grid-outset — Débord de gouttière</h4>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">Dépasse la gouttière de la grille <code>(--site--gutter)</code> sans sortir de la marge site.</p>
            <div className="space-y-1">
              {[
                { cls: 'u-grid-outset',       desc: 'Déborde des deux gouttières (gauche + droite)' },
                { cls: 'u-grid-outset-left',  desc: 'Déborde uniquement de la gouttière gauche' },
                { cls: 'u-grid-outset-right', desc: 'Déborde uniquement de la gouttière droite' },
              ].map(({ cls, desc }) => (
                <div key={cls} className="flex items-start gap-2">
                  <code className="shrink-0 bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold">{cls}</code>
                  <span className="text-[10px] text-muted-foreground pt-0.5">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* u-break */}
          <div>
            <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-2">
              <h4 className="text-xs font-semibold">u-break — Débord de marge site</h4>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">Sort de la marge du site <code>(--site--margin-fluid)</code>. Cascade depuis tablette vers mobile.</p>
            <div className="space-y-1">
              {[
                { cls: 'u-break-left',  desc: 'Sort jusqu\'au bord gauche du viewport' },
                { cls: 'u-break-right', desc: 'Sort jusqu\'au bord droit du viewport' },
                { cls: 'u-break-full',  desc: 'Sort des deux côtés (gauche + droite)' },
                { cls: 'u-full-bleed',  desc: 'Pleine largeur viewport (margin: 50% - 50vw)' },
                { cls: 'u-break-none',  desc: 'Annule un break — reset à 100%' },
              ].map(({ cls, desc }) => (
                <div key={cls} className="flex items-start gap-2">
                  <code className="shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold">{cls}</code>
                  <span className="text-[10px] text-muted-foreground pt-0.5">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Example */}
          <div className="bg-muted/40 rounded-md p-3 border border-border">
            <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Exemple combiné</div>
            <code className="block text-[10px] font-mono text-foreground leading-relaxed">
              u-break-right<br />
              <span className="text-primary">max-lg:</span>u-break-full<br />
              <span className="text-muted-foreground">{/* mobile hérite max-lg: → u-break-full */}</span>
            </code>
          </div>
        </div>
      ))}

      {renderAccordion('Spacing', 'spacing', (
        <>
          {/* Scale Controls */}
          <div className="bg-muted/60 -mx-4 px-4 py-2 border-b border-border rounded-sm mb-3">
            <h4 className="text-xs font-semibold">Scale Parameters</h4>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Base (px)</label>
              <input
                type="number" min={8}
                max={32} step={1}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={spaceBase}
                onChange={e => setSpaceBase(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Ratio</label>
              <select
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={spaceRatio}
                onChange={e => setSpaceRatio(Number(e.target.value))}
              >
                <option value={1.125}>1.125 — Major Second</option>
                <option value={1.25}>1.250 — Major Third</option>
                <option value={1.333}>1.333 — Perfect Fourth</option>
                <option value={1.5}>1.500 — Perfect Fifth</option>
                <option value={2}>2.000 — Octave</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Viewport min (px)</label>
              <input
                type="number" min={320}
                max={640} step={1}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={spaceVpMin}
                onChange={e => setSpaceVpMin(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Viewport max (px)</label>
              <input
                type="number" min={1024}
                max={2560} step={1}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={spaceVpMax}
                onChange={e => setSpaceVpMax(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Apply button */}
          <button
            onClick={saveSpacingToTheme}
            className="w-full mb-4 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted/70 border border-border transition-colors"
          >
            ↻ Apply Scale to Canvas
          </button>

          {/* Visual token preview */}
          <div className="space-y-1.5 mb-4">
            <div className="text-[10px] text-muted-foreground bg-muted/40 p-2 rounded mb-3 border border-border">
              <strong className="block mb-1 text-foreground">💡 Usage Hint</strong>
              Use these exact lowercase token names in Ycode variables to match the automatic spacing bridge (e.g. <code>space-3xs</code>, <code>space-m</code>).
            </div>
            {SPACE_TOKENS.map(token => {
              const px  = tokenPx(token.steps);
              const maxBarPx = tokenPx(5); // 3XL is the widest
              const barPct   = Math.min((px / maxBarPx) * 100, 100);
              const minRem   = (px / 16).toFixed(2);
              const maxRem   = ((px * spaceRatio) / 16).toFixed(2);
              return (
                <div key={token.key} className="flex items-center gap-2">
                  <span className="w-16 text-[10px] font-mono font-bold text-muted-foreground text-right shrink-0">{token.key.toLowerCase()}</span>
                  <div className="flex-1 bg-muted rounded-sm overflow-hidden h-4">
                    <div
                      className="h-full bg-primary/40 rounded-sm transition-all duration-300"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-24 shrink-0">
                    {minRem}→{maxRem}rem
                  </span>
                </div>
              );
            })}
          </div>

          {/* Cleanup stale tokens — one-time utility */}
          <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Supprimer les anciens tokens spacing / typo de la palette Ycode.
            </p>
            <button
              onClick={syncSpacingToYcode}
              disabled={spaceSyncStatus === 'syncing'}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors
                border border-border text-muted-foreground hover:text-destructive hover:border-destructive disabled:opacity-40"
            >
              {spaceSyncStatus === 'idle'    && '🧹 Purge'}
              {spaceSyncStatus === 'syncing' && '…'}
              {spaceSyncStatus === 'done'    && '✓ Ok'}
              {spaceSyncStatus === 'error'   && '✗'}
            </button>
          </div>
        </>
      ))}
    </div>
  );

  return (
    <div className="relative w-full h-full overflow-y-auto isolate">
      <div className="px-1 pt-2 pb-8 overflow-visible">
        <div className="mb-4">
          <button
            onClick={() => setIsStudioOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-md font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm text-sm"
          >
            ⛶ Ouvrir le Studio
          </button>
        </div>

        {content}
      </div>

      {isStudioOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto pointer-events-auto cursor-pointer"
          onClick={() => setIsStudioOpen(false)}
        >

          <div
            className="w-[92vw] h-[90vh] max-w-none bg-background border border-border rounded-xl shadow-2xl flex flex-col relative pointer-events-auto cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-none flex justify-between items-center px-6 py-4 border-b border-border bg-card">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold">Studio Design</h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Hidden file input for import */}
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImport}
                />

                {/* Export template */}
                <button
                  onClick={exportCollections}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Télécharger un ZIP avec toutes les collections Figma (W3C Design Tokens)"
                >
                  ↓ Export ZIP
                </button>

                {/* Import filled JSON */}
                <button
                  onClick={() => importFileRef.current?.click()}
                  disabled={importStatus === 'importing'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                  title="Importer un JSON rempli pour appliquer toutes les valeurs"
                >
                  {importStatus === 'idle'      && '↑ Import'}
                  {importStatus === 'importing' && '…'}
                  {importStatus === 'done'      && '✓ Importé'}
                  {importStatus === 'error'     && '✗ Erreur'}
                </button>

                <button
                  onClick={syncToYcodePalette}
                  disabled={syncStatus === 'syncing'}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors
                    bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncStatus === 'syncing' && (
                    <svg
                      className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25" cx="12"
                        cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"
                      />
                      <path
                        className="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                  )}
                  {syncStatus === 'idle'    && '⇄ Sync → Ycode'}
                  {syncStatus === 'syncing' && 'Syncing…'}
                  {syncStatus === 'done'    && '✓ Synced!'}
                  {syncStatus === 'error'   && '✗ Erreur'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsStudioOpen(false); }}
                  className="relative z-[100000] cursor-pointer w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full text-lg font-medium transition-colors border border-border"
                  title="Fermer le Design Studio"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-6 isolate">
              <div className="max-w-5xl mx-auto pt-6 overflow-visible">
                {content}
              </div>
            </div>
          </div>
        </div>
        , document.body)}
    </div>
  );
}
