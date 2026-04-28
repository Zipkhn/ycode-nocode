'use client';

import React from 'react';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

const LEVELS = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'] as const;
const LEVEL_LABELS: Record<string, string> = {
  display: 'Display', h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
  large: 'Large', body: 'Body', small: 'Small',
};

const PROPS = [
  { key: 'font-family',     label: 'Family',          cssKey: (l: string) => l === 'body' ? '_typography---font-family-body' : '_typography---font-family-headings', type: 'text' },
  { key: 'font-weight',     label: 'Weight',          cssKey: (l: string) => `${l}-font-weight`,    type: 'text' },
  { key: 'line-height',     label: 'Line Height',     cssKey: (l: string) => `${l}-line-height`,    type: 'text' },
  { key: 'letter-spacing',  label: 'Letter Spacing',  cssKey: (l: string) => `${l}-letter-spacing`, type: 'text' },
  { key: 'margin-bottom',   label: 'Margin Bottom',   cssKey: (l: string) => `${l}-margin-bottom`,  type: 'text' },
  { key: 'text-wrap',       label: 'Text Wrap',       cssKey: (l: string) => `${l}-text-wrap`,      type: 'textwrap' },
] as const;

function isShared(propKey: string) {
  return propKey === 'font-family';
}

export function TextStyleSection({ hook }: Props) {
  const { variables, setVar, removeVar } = hook;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="shrink-0 px-3 py-2 border-b border-white/10">
        <span className="text-[11px] text-white/40">Cross-table: Properties × Styles</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#111] z-10">
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-1.5 text-[11px] font-medium text-white/50 w-[140px] shrink-0">Property</th>
              {LEVELS.map(l => (
                <th key={l} className="text-center px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5 min-w-[80px]">
                  {LEVEL_LABELS[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROPS.map(prop => (
              <tr key={prop.key} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                <td className="px-3 py-1 text-[11px] text-white/70 shrink-0">{prop.label}</td>
                {LEVELS.map(lvl => {
                  const cssKey = prop.cssKey(lvl);
                  // font-family is shared (headings/body) — show read-only indicator for body
                  const val = variables[cssKey] ?? '';
                  const displayVal = prop.key === 'font-family'
                    ? val.split(',')[0].trim().replace(/['"]/g, '') || 'inherit'
                    : val;
                  if (prop.type === 'textwrap') {
                    const options = ['', 'pretty', 'balance'] as const;
                    const idx = options.indexOf(val as typeof options[number]);
                    const next = options[(idx + 1) % options.length];
                    return (
                      <td key={lvl} className="border-l border-white/5 px-2 py-0.5 text-center">
                        <button
                          onClick={() => next ? setVar(cssKey, next) : removeVar(cssKey)}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${val ? 'bg-white/15 text-white' : 'text-white/25 hover:text-white/50'}`}
                          title={`text-wrap: ${val || 'unset'}`}
                        >
                          {val || '—'}
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td key={lvl} className="border-l border-white/5 px-2 py-0.5">
                      <input
                        type="text"
                        value={displayVal}
                        onChange={e => setVar(cssKey, e.target.value)}
                        className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5 text-center"
                        spellCheck={false}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
