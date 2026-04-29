'use client';

import React, { useState, useId } from 'react';
import { resolveVarToHex } from '../utils/color-utils';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

// ── Color rows ────────────────────────────────────────────────────────────────

const COLOR_ROWS = [
  { key: 'background',   label: 'Background'   },
  { key: 'background-2', label: 'Background 2' },
  { key: 'text-main',    label: 'Text'          },
  { key: 'text-heading', label: 'Text Heading'  },
  { key: 'text-muted',   label: 'Text Muted'    },
  { key: 'border',       label: 'Border'        },
  { key: 'accent',       label: 'Accent'        },
];

const MODES = ['light', 'dark'] as const;
type Mode = typeof MODES[number];

function ColorCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className="flex items-center gap-1.5 w-full">
      <label
        htmlFor={id}
        className="relative w-5 h-5 rounded cursor-pointer shrink-0 border border-white/10"
        style={{ background: hex }}
      >
        <input
          id={id} type="color"
          value={hex}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      <input
        type="text" value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
        maxLength={9} spellCheck={false}
      />
    </div>
  );
}

// ── Gradient rows ─────────────────────────────────────────────────────────────

interface GradientOption {
  varKey: string;
  label: string;
  css: string;
}

const STATIC_GRADIENT_TOKENS = ['gradient-primary', 'gradient-secondary'];

function getGradientOptions(variables: Record<string, string>): GradientOption[] {
  return Object.keys(variables)
    .filter(k => k.startsWith('gradient--'))
    .map(k => ({
      varKey: k,
      label: k.replace('gradient--', '').replace(/-/g, ' '),
      css: variables[k] || '',
    }));
}

function getDynamicGradientTokens(variables: Record<string, string>): string[] {
  const extra = new Set<string>();
  for (const key of Object.keys(variables)) {
    for (const mode of MODES) {
      const prefix = `theme-${mode}--gradient-`;
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length);
        if (!STATIC_GRADIENT_TOKENS.includes(name)) extra.add(name);
      }
    }
  }
  return [...extra];
}

function GradientSelect({
  value, options, onChange,
}: {
  value: string;
  options: GradientOption[];
  onChange: (v: string) => void;
}) {
  const resolvedCss = (() => {
    const m = value.match(/^var\(--(.+)\)$/);
    if (!m) return '';
    return options.find(o => o.varKey === m[1])?.css || '';
  })();

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div
        className="w-6 h-5 rounded shrink-0 border border-white/10"
        style={{ background: resolvedCss || 'transparent' }}
      />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-[#1a1a1a] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-white/20 cursor-pointer"
      >
        <option value="">— none —</option>
        {options.map(opt => (
          <option key={opt.varKey} value={`var(--${opt.varKey})`}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ThemeSection({ hook }: Props) {
  const { variables, setVar, removeVar } = hook;
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const gradientOptions = getGradientOptions(variables);
  const dynamicGradientTokens = getDynamicGradientTokens(variables);
  const allGradientTokens = [...STATIC_GRADIENT_TOKENS, ...dynamicGradientTokens];

  const getColorVal = (rowKey: string, mode: Mode) => {
    const raw = variables[`theme-${mode}--${rowKey}`] ?? '';
    return raw.startsWith('var(') ? resolveVarToHex(raw, variables) || raw : raw;
  };

  const getGradientVal = (tokenName: string, mode: Mode) =>
    variables[`theme-${mode}--gradient-${tokenName}`] ?? '';

  const addGradientToken = () => {
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug || allGradientTokens.includes(slug)) return;
    const first = gradientOptions[0] ? `var(--${gradientOptions[0].varKey})` : '';
    setVar(`theme-light--gradient-${slug}`, first);
    setVar(`theme-dark--gradient-${slug}`, first);
    setNewName('');
    setAdding(false);
  };

  const removeGradientToken = (name: string) => {
    removeVar(`theme-light--gradient-${name}`);
    removeVar(`theme-dark--gradient-${name}`);
  };

  return (
    <div className="h-full overflow-auto text-[11px]">

      {/* ── Colors ── */}
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-[#111]">
          <tr className="border-b border-white/10">
            <th className="text-left px-3 py-1.5 font-medium text-white/50 w-[180px]">Name</th>
            {MODES.map(m => (
              <th key={m} className="text-left px-2 py-1.5 font-medium text-white/50 border-l border-white/5 min-w-[120px] capitalize">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COLOR_ROWS.map(row => (
            <tr key={row.key} className="border-b border-white/5 hover:bg-white/[0.04]">
              <td className="px-3 py-0.5 text-white/80">{row.label}</td>
              {MODES.map(mode => (
                <td key={mode} className="border-l border-white/5 px-2 py-0.5">
                  <ColorCell
                    value={getColorVal(row.key, mode)}
                    onChange={v => setVar(`theme-${mode}--${row.key}`, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Gradients ── */}
      <div className="mt-2">
        {/* Section header */}
        <div className="flex items-center px-3 py-1 bg-white/[0.03] border-y border-white/5 sticky top-[34px] z-10">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex-1">
            Gradients
          </span>
          <button
            onClick={() => setAdding(a => !a)}
            className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
          >
            + Add
          </button>
        </div>

        {/* Add row */}
        {adding && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
            <input
              type="text" placeholder="Token name (e.g. hero)"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGradientToken()}
              autoFocus
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-white/20"
            />
            <button onClick={addGradientToken} className="px-2 py-1 rounded border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/5 transition-colors">
              Create
            </button>
            <button onClick={() => { setAdding(false); setNewName(''); }} className="text-white/30 hover:text-white/60 text-[10px]">
              ✕
            </button>
          </div>
        )}

        {/* Column labels */}
        <div className="flex items-center border-b border-white/10 bg-white/[0.02] text-[10px] text-white/30">
          <div className="w-[180px] shrink-0 px-3 py-1">Name</div>
          <div className="flex-1 border-l border-white/5 px-2 py-1">Light</div>
          <div className="flex-1 border-l border-white/5 px-2 py-1">Dark</div>
          <div className="w-7 shrink-0" />
        </div>

        {/* No gradients in Colors */}
        {gradientOptions.length === 0 && (
          <div className="px-3 py-3 text-white/25 italic">
            No gradients defined in Colors yet.
          </div>
        )}

        {/* Token rows */}
        {allGradientTokens.map(name => (
          <div key={name} className="flex items-center border-b border-white/5 hover:bg-white/[0.03] group">
            <div className="w-[180px] shrink-0 px-3 py-1.5 text-white/70 capitalize truncate">
              {name.replace('gradient-', '').replace(/-/g, ' ')}
            </div>
            <div className="flex-1 border-l border-white/5 px-2 py-1">
              <GradientSelect
                value={getGradientVal(name, 'light')}
                options={gradientOptions}
                onChange={v => setVar(`theme-light--gradient-${name}`, v)}
              />
            </div>
            <div className="flex-1 border-l border-white/5 px-2 py-1">
              <GradientSelect
                value={getGradientVal(name, 'dark')}
                options={gradientOptions}
                onChange={v => setVar(`theme-dark--gradient-${name}`, v)}
              />
            </div>
            <div className="w-7 shrink-0 flex items-center justify-center">
              {!STATIC_GRADIENT_TOKENS.includes(name) && (
                <button
                  onClick={() => removeGradientToken(name)}
                  className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 transition-all text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
