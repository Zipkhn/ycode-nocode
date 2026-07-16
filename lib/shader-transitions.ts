/**
 * Registry mapping shader page-transition presets to their @paper-design/shaders-react
 * component + resolved props. Kept data-only (no React / no shader lib import) so it is
 * SSR-safe and unit-testable; the client engine (components/PageCurtain.tsx) maps the
 * `component` name to the real component and spreads `props` onto it.
 */

import type { PageTransitionConfig, PageTransitionType } from './page-transitions';

export type ShaderComponentName = 'Dithering' | 'Warp' | 'SmokeRing';

export interface ShaderTransitionDef {
  component: ShaderComponentName;
  buildProps: (c: PageTransitionConfig) => Record<string, unknown>;
}

/** Map 0–100 intensity onto a sensible [min,max] range. */
function lerp(intensity: number, min: number, max: number): number {
  return +(min + (max - min) * (Math.min(100, Math.max(0, intensity)) / 100)).toFixed(3);
}

/** Props common to every Paper shader: fill the overlay, animate continuously. */
function commonProps(c: PageTransitionConfig) {
  return {
    style: { width: '100%', height: '100%' },
    speed: lerp(c.intensity, 0.3, 1.6),
    scale: lerp(c.intensity, 0.7, 1.4),
  };
}

export const SHADER_TRANSITIONS: Record<string, ShaderTransitionDef> = {
  shader_dither: {
    component: 'Dithering',
    buildProps: (c) => ({
      ...commonProps(c),
      colorBack: c.colorBack,
      colorFront: c.colorPrimary,
      shape: 'warp',
      type: '4x4',
      size: 2,
    }),
  },
  shader_warp: {
    component: 'Warp',
    buildProps: (c) => ({
      ...commonProps(c),
      colors: [c.colorPrimary, c.colorBack],
      proportion: 0.5,
      softness: 1,
      distortion: lerp(c.intensity, 0.1, 0.6),
      swirl: lerp(c.intensity, 0.2, 0.9),
    }),
  },
  shader_smoke: {
    component: 'SmokeRing',
    buildProps: (c) => ({
      ...commonProps(c),
      colorBack: c.colorBack,
      colors: [c.colorPrimary],
      thickness: 0.5,
      radius: 0.5,
      noiseScale: lerp(c.intensity, 0.8, 2),
    }),
  },
};

/** Resolve the shader component + props for a config, or null for CSS presets. */
export function resolveShaderTransition(
  c: PageTransitionConfig,
): { component: ShaderComponentName; props: Record<string, unknown> } | null {
  const def = SHADER_TRANSITIONS[c.type as PageTransitionType];
  if (!def) return null;
  return { component: def.component, props: def.buildProps(c) };
}
