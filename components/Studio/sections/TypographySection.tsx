'use client';

import React from 'react';
import { StudioTable, type StudioRow, type StudioMode } from '../StudioTable';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';
import { useFontsStore } from '@/stores/useFontsStore';

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

const SIZE_ROWS: StudioRow[] = TYPO_LEVELS.map(({ key, label }) => ({
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
  const { variables, setVar } = hook;
  const fonts = useFontsStore(s => s.fonts)
    .filter(f => f.type !== 'default')
    .filter((f, i, arr) => arr.findIndex(x => x.family === f.family) === i);

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
          <div className="px-3 py-1 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Sizes
          </div>
          <StudioTable
            rows={SIZE_ROWS}
            modes={SIZE_MODES}
            getValue={getValue}
            onValueChange={handleChange}
            searchable={false}
          />
        </div>
      </div>
    </div>
  );
}
