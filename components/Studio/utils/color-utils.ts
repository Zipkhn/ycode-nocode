export const COLOR_SCALE_STEPS = [900, 800, 700, 600, 500, 400, 300, 200, 100, 50] as const;

function oklchToRgb(l: number, c: number, h: number): { r: number; g: number; b: number } {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b_ = c * Math.sin(hRad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b_;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b_;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b_;
  const lc = l_ * l_ * l_, mc = m_ * m_ * m_, sc = s_ * s_ * s_;
  const toSrgb = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
  return {
    r: Math.round(toSrgb(+4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc) * 255),
    g: Math.round(toSrgb(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc) * 255),
    b: Math.round(toSrgb(-0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc) * 255),
  };
}

export function resolveVarToHex(value: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 4 || !value) return '';
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const oklchMatch = value.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (oklchMatch) {
    let l = parseFloat(oklchMatch[1]);
    if (oklchMatch[1].endsWith('%')) l /= 100;
    const { r, g, b } = oklchToRgb(l, parseFloat(oklchMatch[2]), parseFloat(oklchMatch[3]));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  const m = value.match(/^var\(--(.+?)\)$/);
  if (!m) return '';
  return resolveVarToHex(vars[m[1]] || '', vars, depth + 1);
}

export function hexToHsl(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1/3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1/3);
  }
  const toHex = (x: number) => Math.round(Math.min(255, Math.max(0, x * 255))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function generateColorScale(baseHex: string, prefix: string): Record<string, string> {
  const hsl = hexToHsl(baseHex);
  if (!hsl) return {};
  const [h, s, baseLightness] = hsl;
  const result: Record<string, string> = { [`color--${prefix}-500`]: baseHex };
  const darkerSteps = [600, 700, 800, 900] as const;
  darkerSteps.forEach((step, idx) => {
    const t = (idx + 1) / darkerSteps.length;
    const lightness = baseLightness * (1 - t) + 10 * t;
    const saturation = s * (1 - t * 0.25);
    result[`color--${prefix}-${step}`] = hslToHex(h, saturation, lightness);
  });
  const lighterSteps = [400, 300, 200, 100, 50] as const;
  lighterSteps.forEach((step, idx) => {
    const t = (idx + 1) / lighterSteps.length;
    const lightness = baseLightness + (97 - baseLightness) * t;
    const saturation = s * (1 - t * 0.65);
    result[`color--${prefix}-${step}`] = hslToHex(h, saturation, lightness);
  });
  return result;
}
