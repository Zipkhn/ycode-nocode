'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useFontsStore } from '@/stores/useFontsStore';
import { useColorVariablesStore } from '@/stores/useColorVariablesStore';
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

      // Dynamically build token list from ALL color-- keys in the theme
      const colorTokens = Object.keys(variables)
        .filter(k => k.startsWith('color--') && variables[k]?.startsWith('#'))
        .map(key => {
          // Build a human-readable label: "color--primary" → "Studio / Primary"
          //                               "color--custom--brand-blue" → "Studio / Brand Blue"
          const slug = key
            .replace(/^color--custom--/, '')
            .replace(/^color--/, '')
            .replace(/-/g, ' ');
          const label = `Studio / ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
          return { key, label };
        });

      // Fire all create/update/rename requests in parallel
      const requests = colorTokens.map(({ key, label }) => {
        const hexValue = variables[key];

        // 1. Entry already has the correct Studio / name → update value only
        if (existingByName[label]) {
          return fetch(`/ycode/api/color-variables/${existingByName[label]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: hexValue }),
          });
        }

        // 2. Legacy Lumos / name exists → rename to Studio / and update value
        const lumosLabel = label.replace(/^Studio \/ /, 'Lumos / ');
        if (existingByName[lumosLabel]) {
          return fetch(`/ycode/api/color-variables/${existingByName[lumosLabel]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: label, value: hexValue }),
          });
        }

        // 3. No existing entry → create
        return fetch('/ycode/api/color-variables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: label, value: hexValue }),
        });
      });

      await Promise.all(requests);

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

  // Stable refs so triggerIframeCSSReload always calls the latest generator
  // even when invoked from a stale saveUpdates closure.
  const spacingBridgeRef = useRef(generateSpacingBridgeCSS);
  const typoBridgeRef    = useRef(generateTypographyBridgeCSS);
  useEffect(() => { spacingBridgeRef.current = generateSpacingBridgeCSS; }, [generateSpacingBridgeCSS]);
  useEffect(() => { typoBridgeRef.current    = generateTypographyBridgeCSS; }, [generateTypographyBridgeCSS]);

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

  const triggerIframeCSSReload = async () => {
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
        } catch (e) {
          // Ignore cross-origin iframe errors
        }
      });
    } catch (e) {
      console.warn('Studio: Failed to reload iframe CSS', e);
    }
  };

  const getCompleteBridgeCSS = useCallback(() => {
    return [
      generateSpacingBridgeCSS(),
      generateTypographyBridgeCSS()
    ].join('\n\n');
  }, [generateSpacingBridgeCSS, generateTypographyBridgeCSS]);

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
    saveUpdates(scale);
  };

  const SCALE_STEPS = [900, 800, 700, 600, 500, 400, 300, 200, 100, 50] as const;

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
          {SCALE_STEPS.map(step => {
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
            {SCALE_STEPS.map(step => renderColorInput(String(step), `color--${prefix}-${step}`))}
          </div>
        </details>
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
          
          <div className="mt-4 pt-4 border-t border-border flex gap-2">
            <button
              onClick={resetTypographyToDefaults}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                bg-background border border-border hover:bg-muted"
            >
              ↺ Reset to System Defaults
            </button>
            <button
              onClick={syncTypographyToYcode}
              disabled={typographySyncStatus === 'syncing'}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {typographySyncStatus === 'syncing' && (
                <svg
                  className="animate-spin w-3 h-3" viewBox="0 0 24 24"
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
              {typographySyncStatus === 'idle' && '⇄ Sync Typo → Ycode'}
              {typographySyncStatus === 'syncing' && 'Syncing…'}
              {typographySyncStatus === 'done' && '✓ Synced'}
              {typographySyncStatus === 'error' && 'Failed'}
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
          {/* Sync button to push Studio tokens into Ycode's native color palette */}
          <div className="mb-4 pb-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Push Studio tokens to the Ycode palette so they appear as CSS variables in the Style Panel.
            </p>
            <button
              onClick={syncToYcodePalette}
              disabled={syncStatus === 'syncing'}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncStatus === 'syncing' && (
                <svg
                  className="animate-spin w-3 h-3" viewBox="0 0 24 24"
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
              {syncStatus === 'idle' && '⇄ Sync → Ycode Palette'}
              {syncStatus === 'syncing' && 'Syncing…'}
              {syncStatus === 'done' && '✓ Synced!'}
              {syncStatus === 'error' && '✗ Error — check console'}
            </button>
          </div>

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
            {renderColorInput('Background', 'theme-light--background')}
            {renderColorInput('Text Main', 'theme-light--text-main')}
            {renderColorInput('Text Muted', 'theme-light--text-muted')}
            {renderColorInput('Border', 'theme-light--border')}
            {renderColorInput('Accent', 'theme-light--accent')}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-zinc-100 mb-2 border border-zinc-700">DARK</h4>
            {renderColorInput('Background', 'theme-dark--background')}
            {renderColorInput('Text Main', 'theme-dark--text-main')}
            {renderColorInput('Text Muted', 'theme-dark--text-muted')}
            {renderColorInput('Border', 'theme-dark--border')}
            {renderColorInput('Accent', 'theme-dark--accent')}
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

          {/* Cleanup stale spacing tokens from Ycode color-variables */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Purge les tokens spacing, typographie et Lumos de la palette Ycode (nettoyage unique).
            </p>
            <button
              onClick={syncSpacingToYcode}
              disabled={spaceSyncStatus === 'syncing'}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {spaceSyncStatus === 'syncing' && (
                <svg
                  className="animate-spin w-3 h-3" viewBox="0 0 24 24"
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
              {spaceSyncStatus === 'idle'    && '🧹 Purger tokens non-couleur Ycode'}
              {spaceSyncStatus === 'syncing' && 'Suppression…'}
              {spaceSyncStatus === 'done'    && '✓ Palette nettoyée'}
              {spaceSyncStatus === 'error'   && '✗ Erreur — voir console'}
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
              <button 
                onClick={(e) => { e.stopPropagation(); setIsStudioOpen(false); }}
                className="relative z-[100000] cursor-pointer w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full text-lg font-medium transition-colors border border-border"
                title="Fermer le Design Studio"
              >
                ✕
              </button>
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
