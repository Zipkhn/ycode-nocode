'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useColorVariablesStore } from '@/stores/useColorVariablesStore';
import {
  getCompleteBridgeCSS,
  generateSpacingBridgeCSS,
  generateTypographyBridgeCSS,
  generateThemeDarkBridgeCSS,
  generateRadiusBridgeCSS,
  generateCustomVarsBridgeCSS,
  generateCustomThemeColorsBridgeCSS,
  TYPOGRAPHY_LEVELS,
  type CustomVarsConfig,
} from '../utils/bridge-generators';
import { syncBridgesToCustomCss } from '../utils/bridge-sync';

export type StudioStatus = 'idle' | 'saving' | 'done' | 'error';

export interface SpacingParams {
  spaceBase: number;
  spaceRatio: number;
  spaceVpMin: number;
  spaceVpMax: number;
}

export type { CustomVarsConfig };

export interface StudioVariablesHook {
  variables: Record<string, string>;
  loading: boolean;
  status: StudioStatus;
  spacingParams: SpacingParams;
  setSpacingParams: (p: Partial<SpacingParams>) => void;
  setVar: (key: string, value: string) => void;
  setVars: (updates: Record<string, string>) => void;
  removeVar: (key: string) => void;
  saveUpdates: (updates: Record<string, string>) => Promise<void>;
  triggerIframeCSSReload: () => Promise<void>;
  customVarsConfig: CustomVarsConfig;
  saveCustomVars: (config: CustomVarsConfig) => Promise<void>;
}

function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
}

const DEFAULT_CUSTOM_VARS_CONFIG: CustomVarsConfig = {
  modes: [{ id: 'default', name: 'Default', selector: ':root' }],
  variables: [],
};

export function useStudioVariables(): StudioVariablesHook {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(true);
  const [status, setStatus]       = useState<StudioStatus>('idle');
  const [spacingParams, _setSpacingParams] = useState<SpacingParams>({
    spaceBase: 16, spaceRatio: 1.25, spaceVpMin: 375, spaceVpMax: 1366,
  });
  const [customVarsConfig, setCustomVarsConfig] = useState<CustomVarsConfig>(DEFAULT_CUSTOM_VARS_CONFIG);
  const customVarsConfigRef = useRef<CustomVarsConfig>(DEFAULT_CUSTOM_VARS_CONFIG);

  const loadColorVariables = useColorVariablesStore((s) => s.loadColorVariables);
  const mountBridgeSyncDone = useRef(false);

  // Stable refs for bridge generators (prevents stale closure in triggerIframeCSSReload)
  const variablesRef      = useRef(variables);
  const spacingParamsRef  = useRef(spacingParams);
  useEffect(() => { variablesRef.current = variables; }, [variables]);
  useEffect(() => { spacingParamsRef.current = spacingParams; }, [spacingParams]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/studio')
      .then(r => r.json())
      .then(data => {
        if (!data.variables) return;
        const vars = { ...data.variables };
        const defaults: Record<string, string> = {};

        ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'].forEach(lvl => {
          if (!vars[`${lvl}-font-weight`])    defaults[`${lvl}-font-weight`]    = '600';
          if (!vars[`${lvl}-letter-spacing`]) defaults[`${lvl}-letter-spacing`] = '0em';
          if (!vars[`${lvl}-margin-bottom`])  defaults[`${lvl}-margin-bottom`]  = '0rem';
          if (!vars[`${lvl}-line-height`]) {
            if (['display', 'h1', 'h2'].includes(lvl)) defaults[`${lvl}-line-height`] = '1.2';
            else if (lvl === 'h3')                      defaults[`${lvl}-line-height`] = '1.3';
            else if (['h4', 'h5'].includes(lvl))        defaults[`${lvl}-line-height`] = '1.4';
            else                                        defaults[`${lvl}-line-height`] = '1.5';
          }
        });
        if (!vars['radius--small'])      defaults['radius--small']      = '0.5rem';
        if (!vars['radius--main'])       defaults['radius--main']        = '1rem';
        if (!vars['radius--round'])      defaults['radius--round']       = '9999px';
        if (!vars['border-width--main']) defaults['border-width--main']  = '0.094rem';
        if (!vars['theme-light--background-2']) defaults['theme-light--background-2'] = '#f5f5f5';
        if (!vars['theme-dark--background-2'])  defaults['theme-dark--background-2']  = '#2a2a2a';

        if (Object.keys(defaults).length > 0) {
          Object.assign(vars, defaults);
          fetch('/api/studio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: defaults }),
          }).catch(console.error);
        }

        if (data.customVarsConfig) {
          setCustomVarsConfig(data.customVarsConfig);
          customVarsConfigRef.current = data.customVarsConfig;
        }

        setVariables(vars);
        _setSpacingParams(prev => ({
          spaceBase:   vars['space-base']   ? Number(vars['space-base'])   : prev.spaceBase,
          spaceRatio:  vars['space-ratio']  ? Number(vars['space-ratio'])  : prev.spaceRatio,
          spaceVpMin:  vars['space-vp-min'] ? Number(vars['space-vp-min']) : prev.spaceVpMin,
          spaceVpMax:  vars['space-vp-max'] ? Number(vars['space-vp-max']) : prev.spaceVpMax,
        }));
      })
      .catch(e => console.error('Studio: load failed', e))
      .finally(() => setLoading(false));
  }, []);

  // ── Iframe bridge injection (spacing + typo) on param/var changes ─────────

  useEffect(() => {
    const spacingCSS = generateSpacingBridgeCSS(spacingParams);
    const typoCSS    = generateTypographyBridgeCSS(variables);
    const TAG_SPACING = 'studio-runtime-bridge';
    const TAG_TYPO    = 'studio-runtime-typography';

    const customVarsCSS = generateCustomVarsBridgeCSS(customVarsConfig);
    const TAG_CUSTOM = 'studio-runtime-custom-vars';

    const themeColorsCSS = generateCustomThemeColorsBridgeCSS(variables);
    const TAG_THEME_COLORS = 'studio-runtime-theme-colors';

    const inject = (doc: Document | null | undefined) => {
      if (!doc?.head) return;
      let el = doc.getElementById(TAG_SPACING) as HTMLStyleElement | null;
      if (!el) { el = doc.createElement('style') as HTMLStyleElement; el.id = TAG_SPACING; doc.head.appendChild(el); }
      el.textContent = spacingCSS;
      let typoEl = doc.getElementById(TAG_TYPO) as HTMLStyleElement | null;
      if (!typoEl) { typoEl = doc.createElement('style') as HTMLStyleElement; typoEl.id = TAG_TYPO; doc.head.appendChild(typoEl); }
      typoEl.textContent = typoCSS;
      let customEl = doc.getElementById(TAG_CUSTOM) as HTMLStyleElement | null;
      if (!customEl) { customEl = doc.createElement('style') as HTMLStyleElement; customEl.id = TAG_CUSTOM; doc.head.appendChild(customEl); }
      customEl.textContent = customVarsCSS;
      let themeColorsEl = doc.getElementById(TAG_THEME_COLORS) as HTMLStyleElement | null;
      if (!themeColorsEl) { themeColorsEl = doc.createElement('style') as HTMLStyleElement; themeColorsEl.id = TAG_THEME_COLORS; doc.head.appendChild(themeColorsEl); }
      themeColorsEl.textContent = themeColorsCSS;
    };

    inject(document);
    document.querySelectorAll('iframe').forEach(f => { try { inject(f.contentDocument); } catch { /* cross-origin */ } });

    const loadHandlers = new WeakMap<HTMLIFrameElement, () => void>();
    const attach = (iframe: HTMLIFrameElement) => {
      if (loadHandlers.has(iframe)) return;
      const h = () => { try { inject(iframe.contentDocument); } catch { /* cross-origin */ } };
      loadHandlers.set(iframe, h);
      iframe.addEventListener('load', h);
    };
    document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(attach);

    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node instanceof HTMLIFrameElement) { attach(node); try { inject(node.contentDocument); } catch { /* cross-origin */ } }
          else if (node instanceof HTMLElement) {
            node.querySelectorAll<HTMLIFrameElement>('iframe').forEach(f => { attach(f); try { inject(f.contentDocument); } catch { /* cross-origin */ } });
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(f => {
        const h = loadHandlers.get(f); if (h) f.removeEventListener('load', h);
      });
    };
  }, [spacingParams, variables, customVarsConfig]);

  // ── triggerIframeCSSReload ────────────────────────────────────────────────

  const triggerIframeCSSReload = useCallback(async () => {
    try {
      const res = await fetch(`/api/studio/css?v=${Date.now()}`);
      if (!res.ok) return;
      const css = await res.text();
      const vars    = variablesRef.current;
      const sParams = spacingParamsRef.current;

      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return;

          const styleEl = doc.getElementById('studio-runtime-css') as HTMLStyleElement | null;
          if (styleEl) styleEl.textContent = css;

          const setOrCreate = (id: string, content: string) => {
            let el = doc.getElementById(id) as HTMLStyleElement | null;
            if (!el) { el = doc.createElement('style') as HTMLStyleElement; el.id = id; doc.head.appendChild(el); }
            el.textContent = content;
          };
          setOrCreate('studio-runtime-bridge',      generateSpacingBridgeCSS(sParams));
          setOrCreate('studio-runtime-typography',  generateTypographyBridgeCSS(vars));
          const dark = generateThemeDarkBridgeCSS(vars);
          if (dark) setOrCreate('studio-runtime-theme-dark', dark);
          setOrCreate('studio-runtime-radius', generateRadiusBridgeCSS());
          setOrCreate('studio-runtime-theme-colors', generateCustomThemeColorsBridgeCSS(vars));
        } catch { /* cross-origin */ }
      });
    } catch (e) {
      console.warn('Studio: iframe CSS reload failed', e);
    }
  }, []);

  // ── saveUpdates (single source of truth) ─────────────────────────────────

  const performSave = useCallback(async (updates: Record<string, string>) => {
    const vars    = variablesRef.current;
    const sParams = spacingParamsRef.current;
    const bridges = getCompleteBridgeCSS(vars, sParams);

    const res = await fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, bridges }),
    });
    if (!res.ok) throw new Error(`POST /api/studio ${res.status}`);

    // Sync bridge block to Ycode custom_css (publish mirror)
    try {
      await syncBridgesToCustomCss(vars, bridges);
    } catch (e) {
      console.warn('Studio: custom_css sync failed', e);
    }

    triggerIframeCSSReload();
  }, [triggerIframeCSSReload]);

  // Serialize saves: custom_css is a read-modify-write, so concurrent saves
  // (mount sync vs. a fast edit) must not interleave their GET/PUT and clobber each other.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveUpdatesInternal = useCallback((updates: Record<string, string>) => {
    const next = saveChainRef.current.then(() => performSave(updates), () => performSave(updates));
    saveChainRef.current = next.catch(() => {}); // keep the chain alive without unhandled rejection
    return next;
  }, [performSave]);

  // ── One-shot bridge sync after load ──────────────────────────────────────

  useEffect(() => {
    if (loading || mountBridgeSyncDone.current) return;
    mountBridgeSyncDone.current = true;
    saveUpdatesInternal({ 'space-0': '0px' }).catch(() => {}); // self-heals on next edit
  }, [loading, saveUpdatesInternal]);

  const saveUpdates = useCallback(async (updates: Record<string, string>) => {
    setStatus('saving');
    try {
      await saveUpdatesInternal(updates);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      console.error('Studio: save failed', e);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [saveUpdatesInternal]);

  // Debounce the status-wrapped saveUpdates (not the raw internal) so a failed
  // keystroke save surfaces as status='error' instead of an unhandled rejection.
  const debouncedSave = useDebounce(saveUpdates, 300);

  // ── Public setters ────────────────────────────────────────────────────────

  const setVar = useCallback((key: string, value: string) => {
    setVariables(prev => {
      const next = { ...prev, [key]: value };
      variablesRef.current = next;
      debouncedSave({ [key]: value });
      return next;
    });
  }, [debouncedSave]);

  const setVars = useCallback((updates: Record<string, string>) => {
    setVariables(prev => {
      const next = { ...prev, ...updates };
      variablesRef.current = next;
      debouncedSave(updates);
      return next;
    });
  }, [debouncedSave]);

  const removeVar = useCallback((key: string) => {
    setVariables(prev => {
      const next = { ...prev };
      delete next[key];
      variablesRef.current = next;
      return next;
    });
    fetch('/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: { [key]: '__remove__' } }),
    }).catch(() => {});
  }, []);

  const setSpacingParams = useCallback((p: Partial<SpacingParams>) => {
    _setSpacingParams(prev => {
      const next = { ...prev, ...p };
      spacingParamsRef.current = next;
      return next;
    });
  }, []);

  const saveCustomVars = useCallback(async (config: CustomVarsConfig) => {
    setCustomVarsConfig(config);
    customVarsConfigRef.current = config;
    setStatus('saving');
    try {
      await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customVarsConfig: config }),
      });
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
      triggerIframeCSSReload();
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [triggerIframeCSSReload]);

  return {
    variables,
    loading,
    status,
    spacingParams,
    setSpacingParams,
    setVar,
    setVars,
    removeVar,
    saveUpdates,
    triggerIframeCSSReload,
    customVarsConfig,
    saveCustomVars,
  };
}
