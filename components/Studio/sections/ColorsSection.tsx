'use client';

import React, { useState, useCallback } from 'react';
import { COLOR_SCALE_STEPS, generateColorScale } from '../utils/color-utils';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

// ── Palette blocks ────────────────────────────────────────────────────────────

const PALETTES = [
  { prefix: 'primary',   label: 'Primary'   },
  { prefix: 'secondary', label: 'Secondary' },
] as const;

function SwatchStrip({ prefix, vars }: { prefix: string; vars: Record<string, string> }) {
  return (
    <div className="flex gap-px h-4 rounded overflow-hidden">
      {COLOR_SCALE_STEPS.map(step => (
        <div
          key={step} className="flex-1"
          style={{ background: vars[`color--${prefix}-${step}`] || '#888' }}
          title={`${step}: ${vars[`color--${prefix}-${step}`] || ''}`}
        />
      ))}
    </div>
  );
}

function PaletteBlock({ prefix, label, vars, setVars, setVar }: {
  prefix: string; label: string; vars: Record<string, string>;
  setVars: (u: Record<string, string>) => void; setVar: (k: string, v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const base = vars[`color--${prefix}-500`] || '#5465FF';

  const applyScale = (hex: string) => {
    const scale = generateColorScale(hex, prefix);
    if (Object.keys(scale).length) setVars(scale);
  };

  return (
    <div className="border-b border-white/5">
      <div
        className="flex items-center gap-3 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <SwatchStrip prefix={prefix} vars={vars} />
        <span className="text-[11px] text-white/80 w-20 shrink-0">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          <label
            className="w-5 h-5 rounded border border-white/10 cursor-pointer shrink-0"
            style={{ background: base }} onClick={e => e.stopPropagation()}
          >
            <input
              type="color" value={base.length === 7 ? base : '#5465ff'}
              onChange={e => { setVar(`color--${prefix}-500`, e.target.value); applyScale(e.target.value); }}
              className="opacity-0 absolute w-0 h-0"
            />
          </label>
          <input
            type="text" value={base}
            onChange={e => { setVar(`color--${prefix}-500`, e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) applyScale(e.target.value); }}
            className="w-20 bg-transparent text-white text-[11px] font-mono outline-none"
            maxLength={7} onClick={e => e.stopPropagation()}
          />
        </div>
      </div>
      {open && (
        <div className="px-3 pb-2">
          {COLOR_SCALE_STEPS.map(step => {
            const k = `color--${prefix}-${step}`;
            const v = vars[k] || '';
            return (
              <div key={step} className="flex items-center gap-2 py-0.5 hover:bg-white/[0.04]">
                <span className="w-8 text-[10px] text-white/40 font-mono shrink-0">{step}</span>
                <label className="w-4 h-4 rounded border border-white/10 cursor-pointer shrink-0" style={{ background: v }}>
                  <input
                    type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'}
                    onChange={e => setVar(k, e.target.value)}
                    className="opacity-0 absolute w-0 h-0"
                  />
                </label>
                <input
                  type="text" value={v}
                  onChange={e => setVar(k, e.target.value)}
                  className="flex-1 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1"
                  maxLength={7}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Gradient types + helpers ──────────────────────────────────────────────────

interface GradientStop {
  color: string;
  position: number; // 0–100
}

interface GradientDef {
  angle: number;
  stops: GradientStop[];
}

const DEFAULT_GRADIENT: GradientDef = {
  angle: 135,
  stops: [
    { color: '#3b82f6', position: 0 },
    { color: '#8b5cf6', position: 100 },
  ],
};

const ANGLE_PRESETS = [0, 45, 90, 135, 180, 270] as const;

function gradientToCss(def: GradientDef): string {
  const sorted = [...def.stops].sort((a, b) => a.position - b.position);
  const stops = sorted.map(s => `${s.color} ${s.position}%`).join(', ');
  return `linear-gradient(${def.angle}deg, ${stops})`;
}

function cssToGradient(css: string): GradientDef {
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

// ── Gradient editor ───────────────────────────────────────────────────────────

function GradientEditor({ def, onChange }: { def: GradientDef; onChange: (d: GradientDef) => void }) {
  const css = gradientToCss(def);

  const setAngle = (angle: number) => onChange({ ...def, angle });

  const setStop = (i: number, partial: Partial<GradientStop>) => {
    const stops = def.stops.map((s, idx) => idx === i ? { ...s, ...partial } : s);
    onChange({ ...def, stops });
  };

  const addStop = () => {
    // Insert a stop at the midpoint of the largest gap
    const sorted = [...def.stops].sort((a, b) => a.position - b.position);
    let maxGap = 0, insertAt = 50;
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].position - sorted[i].position;
      if (gap > maxGap) { maxGap = gap; insertAt = (sorted[i].position + sorted[i + 1].position) / 2; }
    }
    onChange({ ...def, stops: [...def.stops, { color: '#ffffff', position: Math.round(insertAt) }] });
  };

  const removeStop = (i: number) => {
    if (def.stops.length <= 2) return;
    onChange({ ...def, stops: def.stops.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="px-3 pb-3 space-y-2">
      {/* Preview */}
      <div className="h-6 rounded" style={{ background: css }} />

      {/* Angle */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/40 w-10 shrink-0">Angle</span>
        <input
          type="number" value={def.angle}
          min={0} max={359}
          onChange={e => setAngle(((parseInt(e.target.value) % 360) + 360) % 360)}
          className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white font-mono outline-none focus:border-white/20 text-center"
        />
        <span className="text-[10px] text-white/40">°</span>
        <div className="flex gap-1 ml-1">
          {ANGLE_PRESETS.map(a => (
            <button
              key={a}
              onClick={() => setAngle(a)}
              className={`w-7 py-0.5 rounded text-[10px] font-mono transition-colors ${def.angle === a ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/10'}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-1">
        {def.stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="w-4 h-4 rounded border border-white/10 cursor-pointer shrink-0" style={{ background: stop.color }}>
              <input
                type="color" value={/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : '#000000'}
                onChange={e => setStop(i, { color: e.target.value })}
                className="opacity-0 absolute w-0 h-0"
              />
            </label>
            <input
              type="text" value={stop.color}
              onChange={e => setStop(i, { color: e.target.value })}
              className="w-20 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1"
              maxLength={7}
            />
            <input
              type="number" value={stop.position}
              min={0} max={100}
              onChange={e => setStop(i, { position: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
              className="w-12 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white font-mono outline-none focus:border-white/20 text-center"
            />
            <span className="text-[10px] text-white/40">%</span>
            <button
              onClick={() => removeStop(i)}
              disabled={def.stops.length <= 2}
              className="text-white/30 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-[10px] ml-auto"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addStop}
        className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
      >
        + Add stop
      </button>
    </div>
  );
}

// ── Gradient row ──────────────────────────────────────────────────────────────

function GradientRow({ varKey, css, setVar, removeVar }: {
  varKey: string;
  css: string;
  setVar: (k: string, v: string) => void;
  removeVar: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = varKey.replace('gradient--', '').replace(/-/g, ' ');
  const def = cssToGradient(css);

  const handleChange = useCallback((d: GradientDef) => {
    setVar(varKey, gradientToCss(d));
  }, [varKey, setVar]);

  return (
    <div className="border-b border-white/5">
      <div
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer group"
        onClick={() => setOpen(o => !o)}
      >
        {/* Preview strip */}
        <div className="w-16 h-4 rounded shrink-0" style={{ background: css }} />
        <span className="text-[11px] text-white/70 flex-1 truncate capitalize">{label}</span>
        <button
          onClick={e => { e.stopPropagation(); removeVar(varKey); }}
          className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-red-400 transition-all text-[10px]"
        >
          ✕
        </button>
      </div>
      {open && (
        <GradientEditor def={def} onChange={handleChange} />
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ColorsSection({ hook }: Props) {
  const { variables, setVar, setVars, removeVar } = hook;
  const [newName, setNewName] = useState('');
  const [newHex, setNewHex]   = useState('#3b82f6');
  const [newGradientName, setNewGradientName] = useState('');
  const [showGradientAdd, setShowGradientAdd] = useState(false);

  const customColors    = Object.keys(variables).filter(k => k.startsWith('color--custom--'));
  const gradientVarKeys = Object.keys(variables).filter(k => k.startsWith('gradient--'));

  const addColor = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setVar(`color--custom--${slug}`, newHex);
    setNewName(''); setNewHex('#3b82f6');
  };

  const addGradient = () => {
    const trimmed = newGradientName.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setVar(`gradient--${slug}`, gradientToCss(DEFAULT_GRADIENT));
    setNewGradientName('');
    setShowGradientAdd(false);
  };

  // Grey scale — individual swatches (no auto-scale)
  const greySteps = [900, 800, 700, 600, 500, 400, 300, 200, 100, 50] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">

        {/* Palettes */}
        <div className="px-3 py-1 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Palettes
        </div>
        {PALETTES.map(({ prefix, label }) => (
          <PaletteBlock
            key={prefix} prefix={prefix}
            label={label}
            vars={variables} setVars={setVars}
            setVar={setVar}
          />
        ))}

        {/* Grey */}
        <div className="px-3 py-1 mt-2 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Grey
        </div>
        {greySteps.map(step => {
          const k = `color--grey-${step}`;
          const v = variables[k] || '';
          return (
            <div key={step} className="flex items-center gap-2 px-3 py-0.5 border-b border-white/5 hover:bg-white/[0.04]">
              <span className="w-8 text-[10px] text-white/40 font-mono shrink-0">{step}</span>
              <label className="w-4 h-4 rounded border border-white/10 cursor-pointer shrink-0" style={{ background: v }}>
                <input
                  type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'}
                  onChange={e => setVar(k, e.target.value)} className="opacity-0 absolute w-0 h-0"
                />
              </label>
              <input
                type="text" value={v}
                onChange={e => setVar(k, e.target.value)}
                className="flex-1 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1"
                maxLength={7}
              />
            </div>
          );
        })}

        {/* Custom colors */}
        <div className="px-3 py-1 mt-2 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Custom
        </div>
        {customColors.map(k => {
          const v = variables[k] || '';
          const label = k.replace('color--custom--', '').replace(/-/g, ' ');
          return (
            <div key={k} className="flex items-center gap-2 px-3 py-0.5 border-b border-white/5 hover:bg-white/[0.04] group">
              <label className="w-4 h-4 rounded border border-white/10 cursor-pointer shrink-0" style={{ background: v }}>
                <input
                  type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'}
                  onChange={e => setVar(k, e.target.value)} className="opacity-0 absolute w-0 h-0"
                />
              </label>
              <span className="text-[11px] text-white/70 flex-1 truncate">{label}</span>
              <input
                type="text" value={v}
                onChange={e => setVar(k, e.target.value)}
                className="w-20 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 text-right"
                maxLength={7}
              />
              <button
                onClick={() => removeVar(k)}
                className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-red-400 transition-all text-[10px] ml-1"
              >
                ✕
              </button>
            </div>
          );
        })}

        {/* Gradients */}
        <div className="flex items-center px-3 py-1 mt-2 bg-white/[0.03]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex-1">
            Gradients
          </span>
          <button
            onClick={() => setShowGradientAdd(a => !a)}
            className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
          >
            + Add
          </button>
        </div>

        {showGradientAdd && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
            <input
              type="text" placeholder="Gradient name"
              value={newGradientName} onChange={e => setNewGradientName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGradient()}
              autoFocus
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
            <button
              onClick={addGradient}
              className="px-2 py-1 rounded border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setShowGradientAdd(false); setNewGradientName(''); }}
              className="text-white/30 hover:text-white/60 text-[10px] transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {gradientVarKeys.length === 0 && !showGradientAdd && (
          <div className="px-3 py-2 text-[11px] text-white/25 italic">
            No gradients yet
          </div>
        )}

        {gradientVarKeys.map(k => (
          <GradientRow
            key={k}
            varKey={k}
            css={variables[k] || gradientToCss(DEFAULT_GRADIENT)}
            setVar={setVar}
            removeVar={removeVar}
          />
        ))}

      </div>

      {/* Footer — add custom color */}
      <div className="shrink-0 border-t border-white/10 px-3 py-2 flex items-center gap-2">
        <label className="w-5 h-5 rounded border border-white/10 cursor-pointer shrink-0" style={{ background: newHex }}>
          <input
            type="color" value={newHex}
            onChange={e => setNewHex(e.target.value)}
            className="opacity-0 absolute w-0 h-0"
          />
        </label>
        <input
          type="text" placeholder="Color name"
          value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addColor()}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-white/20"
        />
        <input
          type="text" placeholder="#hex"
          value={newHex} onChange={e => setNewHex(e.target.value)}
          className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono placeholder:text-white/30 outline-none focus:border-white/20"
          maxLength={7}
        />
        <button
          onClick={addColor}
          className="px-2 py-1 rounded border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
