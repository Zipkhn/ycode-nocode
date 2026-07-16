'use client';

/**
 * WebGL shader fill for the page-transition curtain. Split into its own module so the
 * @paper-design/shaders-react library is only fetched (via next/dynamic in PageCurtain)
 * when a shader preset is actually active — CSS presets ship zero WebGL.
 */

import { Dithering, Warp, SmokeRing } from '@paper-design/shaders-react';
import { resolveShaderTransition } from '@/lib/shader-transitions';
import type { PageTransitionConfig } from '@/lib/page-transitions';

const COMPONENTS = { Dithering, Warp, SmokeRing } as const;

export default function ShaderCurtainCanvas({ config }: { config: PageTransitionConfig }) {
  const resolved = resolveShaderTransition(config);
  if (!resolved) return null;
  const Comp = COMPONENTS[resolved.component] as React.ComponentType<Record<string, unknown>>;
  return <Comp {...resolved.props} />;
}
