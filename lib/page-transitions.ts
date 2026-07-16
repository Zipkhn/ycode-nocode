/**
 * Page transitions — a single cross-browser "curtain" engine.
 *
 * Every preset animates a full-screen overlay (`#ycode-curtain`) that COVERS the
 * outgoing page, then (after the real navigation) REVEALS the incoming page. This
 * spans the document boundary, so it works on any browser with plain <a> navigation
 * — unlike the native View Transitions API (Chrome/Edge only).
 *
 * CSS presets (fade/slide/zoom/reveal/rgb_split) paint the overlay with CSS.
 * Shader presets (shader_*) paint it with a WebGL canvas (@paper-design/shaders-react),
 * mounted by the client engine; here we only emit the opacity cover/reveal keyframes.
 *
 * The client engine (components/PageCurtain.tsx) drives the phases; this module is
 * pure (SSR-safe, unit-tested) and only produces the injectable CSS.
 */

export type PageTransitionType =
  | 'fade'
  | 'rgb_split'
  | 'slide'
  | 'zoom'
  | 'reveal'
  | 'shader_dither'
  | 'shader_warp'
  | 'shader_smoke';

export const PAGE_TRANSITION_TYPES: PageTransitionType[] = [
  'fade', 'rgb_split', 'slide', 'zoom', 'reveal',
  'shader_dither', 'shader_warp', 'shader_smoke',
];

/** Presets whose overlay is painted by a WebGL shader canvas rather than CSS. */
export function isShaderTransition(type: PageTransitionType): boolean {
  return type.startsWith('shader_');
}

export interface PageTransitionConfig {
  enabled: boolean;
  type: PageTransitionType;
  /** Per-phase animation duration in ms (cover on the old page, reveal on the new one). */
  duration: number;
  /** CSS timing function. */
  easing: string;
  /** 0–100 — scales displacement / zoom (CSS) or shader speed·scale. */
  intensity: number;
  /** Foreground / primary colour (CSS overlay fill, shader main colour). */
  colorPrimary: string;
  /** Background colour (rgb_split stripes, shader backdrop). */
  colorBack: string;
}

export const DEFAULT_PAGE_TRANSITION: PageTransitionConfig = {
  enabled: true,
  type: 'shader_smoke',
  duration: 600,
  easing: 'cubic-bezier(.4,0,.2,1)',
  intensity: 50,
  colorPrimary: '#111111',
  colorBack: '#000000',
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Coerce a stored (untrusted) settings value into a valid config. */
export function normalizePageTransition(raw: unknown): PageTransitionConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<PageTransitionConfig>;
  const d = DEFAULT_PAGE_TRANSITION;
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : d.enabled,
    type: PAGE_TRANSITION_TYPES.includes(c.type as PageTransitionType) ? (c.type as PageTransitionType) : d.type,
    duration: Math.round(clampNum(c.duration, 100, 2000, d.duration)),
    easing: typeof c.easing === 'string' && c.easing.trim() ? c.easing : d.easing,
    intensity: Math.round(clampNum(c.intensity, 0, 100, d.intensity)),
    colorPrimary: isHexColor(c.colorPrimary) ? c.colorPrimary.trim() : d.colorPrimary,
    colorBack: isHexColor(c.colorBack) ? c.colorBack.trim() : d.colorBack,
  };
}

/** The overlay CSS `id` and phase attribute shared with the client engine. */
export const CURTAIN_ID = 'ycode-curtain';
/** Persistent layout wrapper around the routed content — the CSS-preset animation target.
 * It survives the RSC subtree swap (unlike the per-page `#ybody`), so the client engine
 * can animate it continuously across a `router.push`. */
export const ROUTE_ID = 'yc-route';
export const CURTAIN_PHASE_ATTR = 'data-yc-phase';

/** Opacity-only overlay keyframes for shader presets (the shader itself provides motion). */
const SHADER_FRAMES = { cover: 'from{opacity:0}to{opacity:1}', reveal: 'from{opacity:1}to{opacity:0}' };

/**
 * Leave/enter @keyframes applied to the persistent `#yc-route` wrapper for CSS presets.
 * The effect lands on the real outgoing/incoming page — e.g. rgb_split splits the real
 * previous page — not on a colour overlay. The cover animation's `both` fill-mode holds
 * the wrapper at its leave-end frame while `router.push` swaps the subtree, so the
 * incoming content never flashes (no separate hold-state needed — single document).
 */
function cssPagePresetFrames(c: PageTransitionConfig): { leave: string; enter: string } {
  switch (c.type) {
    case 'slide': {
      const p = Math.round(20 + c.intensity * 0.8); // 20–100 %
      return {
        leave: `to{opacity:0;transform:translateX(-${p}%)}`,
        enter: `from{opacity:0;transform:translateX(${p}%)}`,
      };
    }
    case 'zoom': {
      const s = c.intensity / 250; // 0–0.4
      return {
        leave: `to{opacity:0;transform:scale(${(1 + s).toFixed(3)})}`,
        enter: `from{opacity:0;transform:scale(${(1 - s).toFixed(3)})}`,
      };
    }
    case 'reveal':
      return {
        leave: 'to{opacity:0}',
        enter: 'from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0 0 0 0)}',
      };
    case 'rgb_split': {
      const p = (c.intensity / 10).toFixed(1); // 0–10 %
      return {
        leave:
          '0%{opacity:1;filter:none;transform:translateX(0)}' +
          '35%{filter:url(#ycode-rgb-split)}' +
          `100%{opacity:0;filter:url(#ycode-rgb-split);transform:translateX(-${p}%)}`,
        enter:
          `0%{opacity:0;filter:url(#ycode-rgb-split);transform:translateX(${p}%)}` +
          '65%{filter:url(#ycode-rgb-split)}' +
          '100%{opacity:1;filter:none;transform:translateX(0)}',
      };
    }
    case 'fade':
    default:
      return { leave: 'to{opacity:0}', enter: 'from{opacity:0}' };
  }
}

/**
 * Build the injectable transition CSS for a config.
 *
 * - Shader presets paint an overlay (`#ycode-curtain`) — they need a surface + colours.
 * - CSS presets animate the persistent `#yc-route` wrapper (real page) — no overlay.
 *
 * `rgbFilterDx` is the SVG chromatic-offset (px) when the rgb_split preset is active
 * (the caller renders the `#ycode-rgb-split` filter only then), else null.
 */
export function generatePageTransitionCss(c: PageTransitionConfig): { css: string; rgbFilterDx: number | null } {
  if (!c.enabled) return { css: '', rgbFilterDx: null };

  const d = c.duration;
  const e = c.easing;

  if (isShaderTransition(c.type)) {
    // Overlay curtain: shader canvas over a solid colorBack fallback (opaque at first
    // paint before the WebGL canvas mounts).
    const base =
      `#${CURTAIN_ID}{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;` +
      `background:${c.colorBack};will-change:opacity}` +
      `#${CURTAIN_ID}>*{position:absolute;inset:0;width:100%;height:100%;display:block}`;
    const phases =
      `#${CURTAIN_ID}[${CURTAIN_PHASE_ATTR}=cover]{pointer-events:auto;animation:${d}ms ${e} both yc-curtain-cover}` +
      `#${CURTAIN_ID}[${CURTAIN_PHASE_ATTR}=reveal]{pointer-events:auto;animation:${d}ms ${e} both yc-curtain-reveal}` +
      `@keyframes yc-curtain-cover{${SHADER_FRAMES.cover}}@keyframes yc-curtain-reveal{${SHADER_FRAMES.reveal}}`;
    const reduced = `@media(prefers-reduced-motion:reduce){#${CURTAIN_ID}{display:none!important}}`;
    return { css: base + phases + reduced, rgbFilterDx: null };
  }

  // CSS presets: animate the real page content via the persistent wrapper.
  const rgbFilterDx = c.type === 'rgb_split' ? Math.max(1, Math.round(c.intensity / 8)) : null;
  const { leave, enter } = cssPagePresetFrames(c);
  // Clip page scroll during the animation so a translated wrapper can't spawn a scrollbar.
  const base = `html:has(#${ROUTE_ID}[${CURTAIN_PHASE_ATTR}]){overflow:hidden}`;
  const phases =
    `#${ROUTE_ID}[${CURTAIN_PHASE_ATTR}=cover]{will-change:opacity,transform,clip-path,filter;animation:${d}ms ${e} both yc-page-leave}` +
    `#${ROUTE_ID}[${CURTAIN_PHASE_ATTR}=reveal]{will-change:opacity,transform,clip-path,filter;animation:${d}ms ${e} both yc-page-enter}` +
    `@keyframes yc-page-leave{${leave}}@keyframes yc-page-enter{${enter}}`;
  const reduced = `@media(prefers-reduced-motion:reduce){#${ROUTE_ID}[${CURTAIN_PHASE_ATTR}]{animation:none!important}}`;
  return { css: base + phases + reduced, rgbFilterDx };
}
