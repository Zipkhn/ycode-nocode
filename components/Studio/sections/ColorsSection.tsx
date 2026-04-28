'use client';

import React, { useState } from 'react';
import { COLOR_SCALE_STEPS, generateColorScale } from '../utils/color-utils';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

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

export function ColorsSection({ hook }: Props) {
  const { variables, setVar, setVars, removeVar } = hook;
  const [newName, setNewName] = useState('');
  const [newHex, setNewHex]   = useState('#3b82f6');

  const customColors = Object.keys(variables).filter(k => k.startsWith('color--custom--'));

  const addColor = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setVar(`color--custom--${slug}`, newHex);
    setNewName(''); setNewHex('#3b82f6');
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

        {/* Custom */}
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
                className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-destructive transition-all text-[10px] ml-1"
              >
                ✕
              </button>
            </div>
          );
        })}
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
