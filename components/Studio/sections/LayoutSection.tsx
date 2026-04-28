'use client';

import React from 'react';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

const LAYOUT_VARS = [
  { group: 'Viewport',    key: 'site--viewport-max', label: 'Max Width (unitless)'  },
  { group: 'Viewport',    key: 'site--viewport-min', label: 'Min Width (unitless)'  },
  { group: 'Grid',        key: 'site--column-count', label: 'Columns'               },
  { group: 'Grid',        key: 'site--gutter',       label: 'Gutter'                },
  { group: 'Site Margin', key: 'site--margin-min',   label: 'Min (rem)'             },
  { group: 'Site Margin', key: 'site--margin-max',   label: 'Max (rem)'             },
] as const;

export function LayoutSection({ hook }: Props) {
  const { variables, setVar } = hook;
  let lastGroup = '';

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
            {LAYOUT_VARS.map(({ group, key, label }) => {
              const showGroup = group !== lastGroup;
              lastGroup = group;
              return (
                <React.Fragment key={key}>
                  {showGroup && (
                    <tr className="bg-white/[0.03]">
                      <td colSpan={2} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{group}</td>
                    </tr>
                  )}
                  <tr className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                    <td className="px-3 py-1 text-[11px] text-white/70">{label}</td>
                    <td className="border-l border-white/5 px-2 py-0.5">
                      <input
                        type="text" value={variables[key] ?? ''}
                        onChange={e => setVar(key, e.target.value)}
                        className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
                      />
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* u-grid / u-container utilities reference */}
        <div className="px-3 py-1 mt-2 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Layout Utilities
        </div>
        {[
          { cls: 'u-container',       desc: 'Centered container with site margin'       },
          { cls: 'u-container-full',  desc: 'Full-width, no max-width'                  },
          { cls: 'u-grid',            desc: `Grid — repeat(--column-count, 1fr)`        },
          { cls: 'u-grid-outset',     desc: 'Bleed left+right gutter'                   },
          { cls: 'u-grid-outset-left',desc: 'Bleed left gutter only'                    },
          { cls: 'u-grid-outset-right', desc: 'Bleed right gutter only'                  },
          { cls: 'u-col-span-N',      desc: 'Grid column span (1–12)'                   },
        ].map(({ cls, desc }) => (
          <div key={cls} className="flex items-start gap-3 px-3 py-1.5 border-b border-white/5 hover:bg-white/[0.04]">
            <code className="text-[10px] font-mono text-white/60 w-36 shrink-0">{cls}</code>
            <span className="text-[10px] text-white/40">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
