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
  const mountSyncDone = useRef(false);

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

  // Silent one-shot sync: register spacing tokens in Ycode DB after hydration
  useEffect(() => {
    if (loading || mountSyncDone.current) return;
    mountSyncDone.current = true;
    upsertSpacingTokens();
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

      // Fire all create/update requests in parallel
      const requests = colorTokens.map(({ key, label }) => {
        const hexValue = variables[key];
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
    // Unique full-name tokens → CSS variable.
    // IMPORTANT: ordered most-specific → least-specific so that, if
    // rules ever tied, the longer token still wins.
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
    ];

    // CSS utility prefix → CSS property (or shorthand).
    // Use the special marker `:VAR` to splice the value into shorthand rules.
    const props: { prefix: string; property: string }[] = [
      { prefix: 'pt',  property: 'padding-top' },
      { prefix: 'pb',  property: 'padding-bottom' },
      { prefix: 'pl',  property: 'padding-left' },
      { prefix: 'pr',  property: 'padding-right' },
      { prefix: 'px',  property: 'padding-left:VAR!important;padding-right' },  // shorthand trick
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
    const lines: string[] = [
      '/* Studio Runtime Bridge v8.0 — auto-generated, do not edit */',
      '/* Unique-token selectors: [class*="prop-space-X" i] — case-insensitive substring match */',
    ];

    for (const tok of tokens) {
      lines.push(`/* ── ${tok.token.toUpperCase()} ── */`);
      const val = `var(${tok.cssVar})`;

      // 1. Bare token fallback: [class*="space-m" i] — catches ANY class
      //    containing the token name, even if Ycode adopts a new prefix
      //    convention in the future. Applies to every common box property
      //    so we never miss a hit.
      lines.push(
        `${scope} [class*="${tok.token}" i]{` +
        `--studio-${tok.token}:${val}!important` +
        `}`
      );

      // 2. Prefixed combinations: [class*="mt-space-m" i] { margin-top: var(--space-m) !important }
      //    These are the authoritative rules — they map each Ycode utility
      //    prefix to its exact CSS property.
      for (const prop of props) {
        const selector = `${scope} [class*="${prop.prefix}-${tok.token}" i]`;
        if (prop.property.includes(':VAR')) {
          const expanded = prop.property.replace(':VAR', `:${val}`);
          lines.push(`${selector}{${expanded}:${val}!important}`);
        } else {
          lines.push(`${selector}{${prop.property}:${val}!important}`);
        }
      }
    }

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

      lines.push(`${selector} {`);
      lines.push(`  font-weight: var(--${lvl.key}-font-weight) !important;`);
      lines.push(`  line-height: var(--${lvl.key}-line-height) !important;`);
      lines.push(`  letter-spacing: var(--${lvl.key}-letter-spacing) !important;`);
      lines.push(`  margin-bottom: var(--${lvl.key}-margin-bottom) !important;`);
      lines.push(`}`);
    });

    return lines.join('\n');
  }, [variables]);

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
  // Core upsert logic — no UI status, safe to call silently (mount, auto-sync)
  const upsertSpacingTokens = async () => {
    const existing = await fetch('/ycode/api/color-variables').then(r => r.json());
    const existingByName: Record<string, string> = {};
    for (const v of (existing.data || [])) existingByName[v.name] = v.id;

    const requests = SPACE_TOKENS.filter(token => token.key).map(token => {
      const name       = `Studio / ${token.key}`;
      const legacyName = `Studio / Space ${token.label}`;
      const value      = `var(--${token.key})`;

      if (existingByName[name]) {
        return fetch(`/ycode/api/color-variables/${existingByName[name]}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, value }),
        });
      }
      if (existingByName[legacyName]) {
        return fetch(`/ycode/api/color-variables/${existingByName[legacyName]}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, value }),
        });
      }
      if (existingByName[token.key]) {
        return fetch(`/ycode/api/color-variables/${existingByName[token.key]}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, value }),
        });
      }
      return fetch('/ycode/api/color-variables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value }),
      });
    });

    await Promise.all(requests);
    await loadColorVariables();
  };

  const syncSpacingToYcode = async () => {
    setSpaceSyncStatus('syncing');
    try {
      await upsertSpacingTokens();
      setSpaceSyncStatus('done');
      setTimeout(() => setSpaceSyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Studio: Failed to sync spacing', e);
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
    // Auto-upsert all spacing tokens into Ycode's color-variables DB
    syncSpacingToYcode();
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
          if (styleEl) {
            styleEl.textContent = css;
          }

          // Also re-inject the runtime spacing bridge so it survives iframe reloads
          const bridgeCSS = generateSpacingBridgeCSS();
          let bridgeEl = iframeDoc.getElementById('studio-runtime-bridge') as HTMLStyleElement | null;
          if (!bridgeEl) {
            bridgeEl = iframeDoc.createElement('style') as HTMLStyleElement;
            bridgeEl.id = 'studio-runtime-bridge';
            iframeDoc.head.appendChild(bridgeEl);
          }
          bridgeEl.textContent = bridgeCSS;

          // Re-inject the runtime typography bridge
          const typoCSS = generateTypographyBridgeCSS();
          let typoEl = iframeDoc.getElementById('studio-runtime-typography') as HTMLStyleElement | null;
          if (!typoEl) {
            typoEl = iframeDoc.createElement('style') as HTMLStyleElement;
            typoEl.id = 'studio-runtime-typography';
            iframeDoc.head.appendChild(typoEl);
          }
          typoEl.textContent = typoCSS;
          
          console.log(`[Studio] Successfully injected Runtime Bridges into iframe (trigger reload)`);

          // Also set CSS variables directly on #ybody for instant rendering
          // without waiting for a full style sheet reload
          const ybody = iframeDoc.getElementById('ybody');
          if (ybody) {
            const style = ybody.style;
            Object.entries(variables).forEach(([key, val]) => {
              if (val) style.setProperty(`--${key}`, val);
            });
          }
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

          {renderColorInput('Primary', 'color--primary')}
          {renderColorInput('Primary Dark', 'color--primary-dark')}
          {renderColorInput('Secondary', 'color--secondary')}
          
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

          {/* Sync to Ycode */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Register spacing tokens as CSS variables in the Ycode Style Panel.
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
              {spaceSyncStatus === 'idle'    && '⇄ Sync → Ycode Variables'}
              {spaceSyncStatus === 'syncing' && 'Syncing…'}
              {spaceSyncStatus === 'done'    && '✓ Tokens registered!'}
              {spaceSyncStatus === 'error'   && '✗ Error — check console'}
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
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(getCompleteBridgeCSS());
                    const btn = e.currentTarget;
                    const orig = btn.innerText;
                    btn.innerText = '✓ Copied!';
                    setTimeout(() => { btn.innerText = orig; }, 2000);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-border hover:bg-muted text-muted-foreground transition-all"
                  title="Copier le code Bridge complet pour Porduction (Publish)"
                >
                  📋 Copy Bridge CSS
                </button>
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
