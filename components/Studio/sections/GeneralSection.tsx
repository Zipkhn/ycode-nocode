'use client';

import React from 'react';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

function Field({ label, varKey, vars, setVar, step = 'any' }: {
  label: string; varKey: string; vars: Record<string, string>;
  setVar: (k: string, v: string) => void; step?: string;
}) {
  return (
    <div className="flex items-center border-b border-white/5 hover:bg-white/[0.04] transition-colors group">
      <span className="w-[200px] shrink-0 px-3 py-1.5 text-[11px] text-white/70 truncate">{label}</span>
      <span className="border-l border-white/5 flex-1 px-2 py-0.5">
        <input
          type="text"
          value={vars[varKey] ?? ''}
          onChange={e => setVar(varKey, e.target.value)}
          className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
          spellCheck={false}
        />
      </span>
    </div>
  );
}

export function GeneralSection({ hook }: Props) {
  const { variables, setVar } = hook;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[#111] z-10">
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-1.5 text-[11px] font-medium text-white/50 w-[200px]">Name</th>
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-white/50 border-l border-white/5">Value</th>
            </tr>
          </thead>
          <tbody>
            {/* Viewport */}
            <tr className="bg-white/[0.03]">
              <td colSpan={2} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Viewport (Unitless)</td>
            </tr>
            {[
              { label: 'Max Width', key: 'site--viewport-max' },
              { label: 'Min Width', key: 'site--viewport-min' },
            ].map(({ label, key }) => (
              <tr key={key} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                <td className="px-3 py-1 text-[11px] text-white/70">{label}</td>
                <td className="border-l border-white/5 px-2 py-0.5">
                  <input
                    type="text" value={variables[key] ?? ''}
                    onChange={e => setVar(key, e.target.value)}
                    className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
                  />
                </td>
              </tr>
            ))}

            {/* Grid & Layout */}
            <tr className="bg-white/[0.03]">
              <td colSpan={2} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Grid & Layout</td>
            </tr>
            {[
              { label: 'Columns', key: 'site--column-count' },
              { label: 'Gutter',  key: 'site--gutter'       },
            ].map(({ label, key }) => (
              <tr key={key} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                <td className="px-3 py-1 text-[11px] text-white/70">{label}</td>
                <td className="border-l border-white/5 px-2 py-0.5">
                  <input
                    type="text" value={variables[key] ?? ''}
                    onChange={e => setVar(key, e.target.value)}
                    className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
                  />
                </td>
              </tr>
            ))}

            {/* Site Margin */}
            <tr className="bg-white/[0.03]">
              <td colSpan={2} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Site Margin (REM)</td>
            </tr>
            {[
              { label: 'Min', key: 'site--margin-min' },
              { label: 'Max', key: 'site--margin-max' },
            ].map(({ label, key }) => (
              <tr key={key} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                <td className="px-3 py-1 text-[11px] text-white/70">{label}</td>
                <td className="border-l border-white/5 px-2 py-0.5">
                  <input
                    type="text" value={variables[key] ?? ''}
                    onChange={e => setVar(key, e.target.value)}
                    className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
