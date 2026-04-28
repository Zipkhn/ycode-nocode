'use client';

import React from 'react';
import { StudioTable, type StudioRow, type StudioMode } from '../StudioTable';
import { SPACE_TOKENS } from '../utils/bridge-generators';
import type { StudioVariablesHook, SpacingParams } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

const SPACING_MODES: StudioMode[] = [
  { id: 'desktop', label: 'Desktop (max)' },
  { id: 'mobile',  label: 'Mobile (min)'  },
];

const SPACING_ROWS: StudioRow[] = SPACE_TOKENS.map(t => ({ key: t.key, label: `${t.label} (${t.key})`, type: 'text' }));

function tokenPx(steps: number, p: SpacingParams): number {
  if (steps >= 0) return p.spaceBase * Math.pow(p.spaceRatio, steps);
  return p.spaceBase / Math.pow(p.spaceRatio, -steps);
}

function generateClamp(sizePx: number, p: SpacingParams): string {
  const minPx  = sizePx;
  const maxPx  = Math.round(sizePx * p.spaceRatio * 100) / 100;
  const slope  = (maxPx - minPx) / (p.spaceVpMax - p.spaceVpMin);
  const inter  = minPx - slope * p.spaceVpMin;
  return `clamp(${(minPx/16).toFixed(3)}rem, ${(inter/16).toFixed(3)}rem + ${(slope*100).toFixed(3)}vw, ${(maxPx/16).toFixed(3)}rem)`;
}

export function SpacingSection({ hook }: Props) {
  const { variables, setVar, spacingParams, setSpacingParams, saveUpdates } = hook;

  const getValue = (rowKey: string, modeId: string) => {
    const token = SPACE_TOKENS.find(t => t.key === rowKey);
    if (!token) return '';
    const px = tokenPx(token.steps, spacingParams);
    if (modeId === 'desktop') return `${(Math.round(px * spacingParams.spaceRatio * 100) / 100 / 16).toFixed(3)}rem`;
    return `${(px / 16).toFixed(3)}rem`;
  };

  const applyScale = () => {
    const updates: Record<string, string> = {
      'space-base':   String(spacingParams.spaceBase),
      'space-ratio':  String(spacingParams.spaceRatio),
      'space-vp-min': String(spacingParams.spaceVpMin),
      'space-vp-max': String(spacingParams.spaceVpMax),
    };
    SPACE_TOKENS.forEach(token => {
      updates[token.key] = generateClamp(tokenPx(token.steps, spacingParams), spacingParams);
    });
    saveUpdates(updates);
  };

  const maxBarPx = tokenPx(5, spacingParams);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {/* Scale controls */}
        <div className="px-3 py-1 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Scale Parameters
        </div>
        <div className="grid grid-cols-2 gap-3 px-3 py-3 border-b border-white/10">
          {[
            { label: 'Base (px)',       key: 'spaceBase',   min: 8,    max: 32,   step: 1    },
            { label: 'Viewport min px', key: 'spaceVpMin',  min: 320,  max: 640,  step: 1    },
            { label: 'Viewport max px', key: 'spaceVpMax',  min: 1024, max: 2560, step: 1    },
          ].map(({ label, key, min, max, step }) => (
            <div key={key}>
              <label className="text-[10px] text-white/50 block mb-1">{label}</label>
              <input
                type="number" min={min}
                max={max} step={step}
                value={spacingParams[key as keyof SpacingParams]}
                onChange={e => setSpacingParams({ [key]: Number(e.target.value) } as any)}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white font-mono outline-none focus:border-white/20"
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] text-white/50 block mb-1">Ratio</label>
            <select
              value={spacingParams.spaceRatio}
              onChange={e => setSpacingParams({ spaceRatio: Number(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-white/20 cursor-pointer"
            >
              <option value={1.125}>1.125 — Major Second</option>
              <option value={1.25}>1.250 — Major Third</option>
              <option value={1.333}>1.333 — Perfect Fourth</option>
              <option value={1.5}>1.500 — Perfect Fifth</option>
              <option value={2}>2.000 — Octave</option>
            </select>
          </div>
        </div>

        <button
          onClick={applyScale}
          className="mx-3 mt-3 w-[calc(100%-1.5rem)] py-1.5 rounded border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          ↻ Apply Scale
        </button>

        {/* Token preview */}
        <div className="px-3 py-1 mt-3 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Spacing Tokens
        </div>
        <StudioTable
          rows={SPACING_ROWS}
          modes={SPACING_MODES}
          getValue={getValue}
          onValueChange={() => {}}
          searchable={false}
        />

        {/* Border & Radius */}
        <div className="px-3 py-1 mt-2 bg-white/[0.03] text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Border & Radius
        </div>
        {[
          { label: 'Radius Small',    key: 'radius--small'       },
          { label: 'Radius Main',     key: 'radius--main'        },
          { label: 'Radius Round',    key: 'radius--round'       },
          { label: 'Border Width',    key: 'border-width--main'  },
        ].map(({ label, key }) => (
          <div key={key} className="flex items-center gap-2 px-3 py-0.5 border-b border-white/5 hover:bg-white/[0.04]">
            <span className="w-[160px] shrink-0 text-[11px] text-white/70">{label}</span>
            <input
              type="text" value={variables[key] ?? ''}
              onChange={e => setVar(key, e.target.value)}
              className="flex-1 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
