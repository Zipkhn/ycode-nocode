'use client';

import React, { useState, useCallback, useId } from 'react';
import type { StudioVariablesHook, CustomVarsConfig } from '../hooks/useStudioVariables';
import type { CustomMode, CustomVariable } from '../utils/bridge-generators';

interface Props { hook: StudioVariablesHook }

type VarType = 'color' | 'size' | 'text';

const TYPE_OPTS: { value: VarType; label: string }[] = [
  { value: 'color', label: 'Color' },
  { value: 'size',  label: 'Size'  },
  { value: 'text',  label: 'Text'  },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function CellInput({
  type, value, onChange,
}: { type: VarType; value: string; onChange: (v: string) => void }) {
  if (type === 'color') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="w-20 bg-white/5 text-white text-[11px] px-1.5 py-0.5 rounded border border-white/10 focus:outline-none focus:border-white/30"
        />
      </div>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={type === 'size' ? '0px' : '…'}
      className="w-full bg-white/5 text-white text-[11px] px-1.5 py-0.5 rounded border border-white/10 focus:outline-none focus:border-white/30"
    />
  );
}

export function CustomVariablesSection({ hook }: Props) {
  const { customVarsConfig, saveCustomVars, status } = hook;
  const { modes, variables } = customVarsConfig;

  const [editingModeId, setEditingModeId]   = useState<string | null>(null);
  const [editingVarId,  setEditingVarId]    = useState<string | null>(null);

  const update = useCallback((config: CustomVarsConfig) => {
    saveCustomVars(config);
  }, [saveCustomVars]);

  // ── Modes ────────────────────────────────────────────────────────────────

  const addMode = () => {
    const id = uid();
    const newMode: CustomMode = { id, name: 'New Mode', selector: `[data-mode="${id}"]` };
    update({ modes: [...modes, newMode], variables });
    setEditingModeId(id);
  };

  const updateMode = (id: string, patch: Partial<CustomMode>) => {
    update({
      modes: modes.map(m => m.id === id ? { ...m, ...patch } : m),
      variables,
    });
  };

  const removeMode = (id: string) => {
    if (modes.length <= 1) return;
    const newVars = variables.map(v => {
      const vals = { ...v.values };
      delete vals[id];
      return { ...v, values: vals };
    });
    update({ modes: modes.filter(m => m.id !== id), variables: newVars });
  };

  // ── Variables ────────────────────────────────────────────────────────────

  const addVariable = () => {
    const id = uid();
    const newVar: CustomVariable = { id, name: 'new-var', type: 'color', values: {} };
    update({ modes, variables: [...variables, newVar] });
    setEditingVarId(id);
  };

  const updateVar = (id: string, patch: Partial<CustomVariable>) => {
    update({ modes, variables: variables.map(v => v.id === id ? { ...v, ...patch } : v) });
  };

  const updateVarValue = (varId: string, modeId: string, value: string) => {
    update({
      modes,
      variables: variables.map(v =>
        v.id === varId ? { ...v, values: { ...v.values, [modeId]: value } } : v
      ),
    });
  };

  const removeVar = (id: string) => {
    update({ modes, variables: variables.filter(v => v.id !== id) });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 text-white">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Custom Variables
        </span>
        {status === 'saving' && <span className="text-[10px] text-white/40">Saving…</span>}
        {status === 'done'   && <span className="text-[10px] text-green-400">Saved</span>}
      </div>

      {/* Modes row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/50">Modes</span>
          <button
            onClick={addMode}
            className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
          >
            + Mode
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {modes.map(mode => (
            <div key={mode.id} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-2 py-1">
              {editingModeId === mode.id ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={mode.name}
                    onChange={e => updateMode(mode.id, { name: e.target.value, selector: mode.id === 'default' ? ':root' : `[data-mode="${slugify(e.target.value)}"]` })}
                    onBlur={() => setEditingModeId(null)}
                    className="w-24 bg-transparent text-white text-[11px] border-b border-white/30 focus:outline-none"
                  />
                </>
              ) : (
                <button
                  onClick={() => mode.id !== 'default' && setEditingModeId(mode.id)}
                  className="text-[11px] text-white/70"
                >
                  {mode.name}
                  {mode.id === 'default' && <span className="ml-1 text-white/30 text-[9px]">:root</span>}
                </button>
              )}
              {mode.id !== 'default' && (
                <button onClick={() => removeMode(mode.id)} className="text-white/30 hover:text-red-400 ml-1 text-[10px]">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <hr className="border-white/10" />

      {/* Variables table */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-white/50">Variables</span>
          <button
            onClick={addVariable}
            className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
          >
            + Variable
          </button>
        </div>

        {variables.length === 0 && (
          <p className="text-[11px] text-white/30 italic py-2">
            Aucune variable. Clique sur + Variable pour commencer.
          </p>
        )}

        {/* Table header */}
        {variables.length > 0 && (
          <div
            className="grid text-[10px] text-white/30 uppercase tracking-wider pb-1 border-b border-white/10"
            style={{ gridTemplateColumns: `1fr 60px repeat(${modes.length}, 1fr) 20px` }}
          >
            <span>Name</span>
            <span>Type</span>
            {modes.map(m => <span key={m.id}>{m.name}</span>)}
            <span />
          </div>
        )}

        {variables.map(v => (
          <div
            key={v.id}
            className="grid items-center gap-2 py-1.5 border-b border-white/5"
            style={{ gridTemplateColumns: `1fr 60px repeat(${modes.length}, 1fr) 20px` }}
          >
            {/* Name */}
            {editingVarId === v.id ? (
              <input
                autoFocus
                type="text"
                value={v.name}
                onChange={e => updateVar(v.id, { name: slugify(e.target.value) })}
                onBlur={() => setEditingVarId(null)}
                className="bg-white/5 text-white text-[11px] px-1.5 py-0.5 rounded border border-white/20 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => setEditingVarId(v.id)}
                className="text-left text-[11px] text-white/80 font-mono truncate hover:text-white"
                title={`--custom--${v.name}`}
              >
                {v.name}
              </button>
            )}

            {/* Type */}
            <select
              value={v.type}
              onChange={e => updateVar(v.id, { type: e.target.value as VarType })}
              className="bg-white/5 text-white/70 text-[10px] rounded border border-white/10 px-1 py-0.5 focus:outline-none"
            >
              {TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Values per mode */}
            {modes.map(mode => (
              <CellInput
                key={mode.id}
                type={v.type}
                value={v.values[mode.id] ?? ''}
                onChange={val => updateVarValue(v.id, mode.id, val)}
              />
            ))}

            {/* Remove */}
            <button onClick={() => removeVar(v.id)} className="text-white/30 hover:text-red-400 text-[12px]">×</button>
          </div>
        ))}
      </div>

      {/* CSS preview */}
      {variables.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50">
            CSS généré
          </summary>
          <pre className="mt-2 text-[9px] text-white/40 bg-white/5 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {modes.map(mode => {
              const vars = variables
                .map(v => v.values[mode.id] ? `  --custom--${v.name}: ${v.values[mode.id]};` : null)
                .filter(Boolean).join('\n');
              return vars ? `${mode.selector} {\n${vars}\n}` : '';
            }).filter(Boolean).join('\n\n')}
          </pre>
        </details>
      )}
    </div>
  );
}
