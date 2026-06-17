// Studio gradient model + CSS round-trip (serialize ↔ parse).
// Pure — no React, independently testable.

export interface GradientStop {
  color: string;
  position: number; // 0–100
}

export interface GradientDef {
  angle: number;
  stops: GradientStop[];
}

export const DEFAULT_GRADIENT: GradientDef = {
  angle: 135,
  stops: [
    { color: '#3b82f6', position: 0 },
    { color: '#8b5cf6', position: 100 },
  ],
};

/** Serialize a gradient definition to a `linear-gradient(...)` CSS string. */
export function gradientToCss(def: GradientDef): string {
  const sorted = [...def.stops].sort((a, b) => a.position - b.position);
  const stops = sorted.map(s => `${s.color} ${s.position}%`).join(', ');
  return `linear-gradient(${def.angle}deg, ${stops})`;
}

/** Parse a `linear-gradient(...)` CSS string back into a definition (falls back to DEFAULT). */
export function cssToGradient(css: string): GradientDef {
  const m = css.match(/linear-gradient\(\s*(\d+)deg\s*,\s*([\s\S]+)\s*\)/);
  if (!m) return DEFAULT_GRADIENT;
  const angle = parseInt(m[1]);
  const rawStops = m[2];
  // split on commas not inside parens
  const stopTokens = rawStops.split(/,(?![^(]*\))/).map(s => s.trim());
  const stops: GradientStop[] = stopTokens.map(token => {
    const parts = token.match(/^(#[0-9a-fA-F]{3,8})\s+(\d+(?:\.\d+)?)%$/);
    if (parts) return { color: parts[1], position: parseFloat(parts[2]) };
    return null;
  }).filter(Boolean) as GradientStop[];
  return {
    angle,
    stops: stops.length >= 2 ? stops : DEFAULT_GRADIENT.stops,
  };
}
