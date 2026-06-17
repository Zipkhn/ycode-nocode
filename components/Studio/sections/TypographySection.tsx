'use client';

import React, { useState } from 'react';
import { StudioTable, type StudioRow, type StudioMode } from '../StudioTable';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';
import { useFontsStore } from '@/stores/useFontsStore';
import { parseCustomLevels, slugifyLevel, RESERVED_LEVEL_KEYS } from '../utils/bridge-generators';

interface Props { hook: StudioVariablesHook }

const TYPO_LEVELS = [
  { key: 'display',   label: 'Display'   },
  { key: 'h1',        label: 'H1'        },
  { key: 'h2',        label: 'H2'        },
  { key: 'h3',        label: 'H3'        },
  { key: 'h4',        label: 'H4'        },
  { key: 'h5',        label: 'H5'        },
  { key: 'h6',        label: 'H6'        },
  { key: 'text-large', label: 'Large' },
  { key: 'text-main',  label: 'Main'  },
  { key: 'text-small', label: 'Small' },
];

const SIZE_MODES: StudioMode[] = [
  { id: 'max', label: 'Desktop' },
  { id: 'min', label: 'Mobile'  },
];

const BUILTIN_SIZE_ROWS: StudioRow[] = TYPO_LEVELS.map(({ key, label }) => ({
  key,
  label,
  type: 'number',
}));

const FONT_ROWS = [
  {
    label:    'Primary',
    familyKey: '_typography---font-family-headings',
    trimTop:   '_text-style---trim-top-headings',
    trimBot:   '_text-style---trim-bottom-headings',
    offset:    '_text-style---optical-offset-headings',
  },
  {
    label:    'Secondary',
    familyKey: '_typography---font-family-body',
    trimTop:   '_text-style---trim-top-body',
    trimBot:   '_text-style---trim-bottom-body',
    offset:    '_text-style---optical-offset-body',
  },
];

function TrimInput({ varKey, vars, setVar }: { varKey: string; vars: Record<string, string>; setVar: (k: string, v: string) => void }) {
  return (
    <input
      type="text"
      value={vars[varKey] ?? ''}
      onChange={e => setVar(varKey, e.target.value)}
      className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
    />
  );
}

export function TypographySection({ hook }: Props) {
  const { variables, setVar, setVars, removeVar, saveUpdates } = hook;
  const fonts = useFontsStore(s => s.fonts)
    .filter(f => f.type !== 'default')
    .filter((f, i, arr) => arr.findIndex(x => x.family === f.family) === i);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const customLevels = parseCustomLevels(variables);
  const sizeRows: StudioRow[] = [
    ...BUILTIN_SIZE_ROWS,
    ...customLevels.map(l => ({ key: l.key, label: l.label, type: 'number' as const, group: 'Custom', removable: true })),
  ];

  const addLevel = () => {
    const key = slugifyLevel(newName);
    if (!key || RESERVED_LEVEL_KEYS.has(key) || customLevels.some(l => l.key === key)) {
      setNewName(''); setAdding(false); return;
    }
    setVars({
      [`_typography---font-size--${key}-max`]: '1.5',
      [`_typography---font-size--${key}-min`]: '1.25',
      [`${key}-font-weight`]:    '400',
      [`${key}-line-height`]:    '1.5',
      [`${key}-letter-spacing`]: '0em',
      [`${key}-margin-bottom`]:  '0rem',
    });
    setNewName(''); setAdding(false);
  };

  const removeLevel = (key: string) => {
    [
      `_typography---font-size--${key}-max`, `_typography---font-size--${key}-min`,
      `${key}-font-weight`, `${key}-line-height`, `${key}-letter-spacing`,
      `${key}-margin-bottom`, `${key}-text-wrap`, `${key}-font-family`,
    ].forEach(removeVar);
    // Regenerate persisted bridges (+ publish mirror) once the var refs settle.
    setTimeout(() => { saveUpdates({}).catch(() => {}); }, 0);
  };

  const getValue = (rowKey: string, modeId: string) =>
    variables[`_typography---font-size--${rowKey}-${modeId}`] ?? '';

  const handleChange = (rowKey: string, modeId: string, value: string) =>
    setVar(`_typography---font-size--${rowKey}-${modeId}`, value);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {/* Font Family + Trim — 5 columns */}
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#111] z-10">
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-1.5 text-[11px] font-medium text-white/50 w-[90px]">Role</th>
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5">Family</th>
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5 w-[80px]">Trim Top</th>
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5 w-[80px]">Trim Bot</th>
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5 w-[80px]">Offset</th>
            </tr>
          </thead>
          <tbody>
            {FONT_ROWS.map(({ label, familyKey, trimTop, trimBot, offset }) => {
              const current = (variables[familyKey] || 'inherit').split(',')[0].trim().replace(/['"]/g, '');
              return (
                <tr key={familyKey} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                  <td className="px-3 py-1 text-[11px] text-white/70 shrink-0">{label}</td>
                  <td className="border-l border-white/5 px-2 py-0.5">
                    <select
                      value={current}
                      onChange={e => {
                        const font = fonts.find(f => f.family === e.target.value);
                        setVar(familyKey, font ? `"${font.family}", ${font.category || 'sans-serif'}` : e.target.value);
                      }}
                      className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5 cursor-pointer"
                    >
                      <option value="inherit">inherit</option>
                      {fonts.map(f => <option key={f.family} value={f.family}>{f.family}</option>)}
                    </select>
                  </td>
                  <td className="border-l border-white/5 px-2 py-0.5"><TrimInput
                    varKey={trimTop} vars={variables}
                    setVar={setVar}
                                                                      /></td>
                  <td className="border-l border-white/5 px-2 py-0.5"><TrimInput
                    varKey={trimBot} vars={variables}
                    setVar={setVar}
                                                                      /></td>
                  <td className="border-l border-white/5 px-2 py-0.5"><TrimInput
                    varKey={offset} vars={variables}
                    setVar={setVar}
                                                                      /></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Sizes table */}
        <div className="border-t border-white/10 mt-2">
          <div className="flex items-center px-3 py-1 bg-white/[0.03] border-b border-white/5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40 flex-1">
              Sizes
            </span>
            <button
              onClick={() => setAdding(a => !a)}
              className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
            >
              + Add text style
            </button>
          </div>

          {adding && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
              <input
                type="text" autoFocus
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addLevel()}
                placeholder="Style name (e.g. Caption)"
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/30 outline-none focus:border-white/20"
              />
              <button onClick={addLevel} className="px-2 py-1 rounded border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                Create
              </button>
              <button onClick={() => { setAdding(false); setNewName(''); }} className="text-white/30 hover:text-white/60 text-[10px]">
                ✕
              </button>
            </div>
          )}

          <StudioTable
            rows={sizeRows}
            modes={SIZE_MODES}
            getValue={getValue}
            onValueChange={handleChange}
            onRemoveRow={removeLevel}
            searchable={false}
          />
        </div>
      </div>
    </div>
  );
}
