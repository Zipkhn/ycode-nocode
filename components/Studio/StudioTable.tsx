'use client';

import React, { useState, useRef, useCallback, useId } from 'react';

export type VariableType = 'color' | 'number' | 'text';

export interface StudioRow {
  key: string;
  label: string;
  type: VariableType;
  /** Optional group label shown as a sticky sub-header */
  group?: string;
}

export interface StudioMode {
  id: string;
  label: string;
}

export interface StudioTableProps {
  rows: StudioRow[];
  modes: StudioMode[];
  getValue: (rowKey: string, modeId: string) => string;
  onValueChange: (rowKey: string, modeId: string, value: string) => void;
  onAddMode?: () => void;
  onAddRow?: () => void;
  addRowLabel?: string;
  searchable?: boolean;
}

// ── Type icon ─────────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: VariableType }) {
  if (type === 'color') return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 shrink-0" style={{ background: 'currentColor' }}
      aria-hidden
    />
  );
  if (type === 'number') return <span className="text-[10px] font-mono text-white/40 shrink-0">#</span>;
  return <span className="text-[10px] font-mono text-white/40 shrink-0">T</span>;
}

// ── Color cell ────────────────────────────────────────────────────────────────

function ColorCell({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className="flex items-center gap-1.5 w-full">
      <label
        htmlFor={id} className="relative w-5 h-5 rounded cursor-pointer shrink-0 border border-white/10"
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
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
        maxLength={9}
        spellCheck={false}
      />
    </div>
  );
}

// ── Generic cell ──────────────────────────────────────────────────────────────

function Cell({
  rowKey, modeId, type, value, onChange, rowIdx, colIdx, totalCols,
  onKeyDown,
}: {
  rowKey: string; modeId: string; type: VariableType; value: string;
  onChange: (v: string) => void; rowIdx: number; colIdx: number; totalCols: number;
  onKeyDown: (e: React.KeyboardEvent, ri: number, ci: number) => void;
}) {
  const uid = useId();
  const cellId = `cell-${rowKey}-${modeId}`;

  if (type === 'color') {
    return (
      <td
        key={cellId} className="border-l border-white/5 px-2 py-0.5"
        onKeyDown={e => onKeyDown(e, rowIdx, colIdx)}
      >
        <ColorCell
          value={value} onChange={onChange}
          id={`${uid}-color`}
        />
      </td>
    );
  }

  return (
    <td
      key={cellId} className="border-l border-white/5 px-2 py-0.5"
      onKeyDown={e => onKeyDown(e, rowIdx, colIdx)}
    >
      <input
        data-cell={`${rowIdx}-${colIdx}`}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent text-white text-[11px] font-mono outline-none focus:bg-white/5 rounded px-1 py-0.5"
        spellCheck={false}
      />
    </td>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

export function StudioTable({
  rows,
  modes,
  getValue,
  onValueChange,
  onAddMode,
  onAddRow,
  addRowLabel = '+ Create variable',
  searchable = true,
}: StudioTableProps) {
  const [search, setSearch] = useState('');
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const filtered = search
    ? rows.filter(r => r.label.toLowerCase().includes(search.toLowerCase()) || r.key.toLowerCase().includes(search.toLowerCase()))
    : rows;

  // Group rows by their `group` property
  const grouped: Array<{ group: string | undefined; rows: StudioRow[] }> = [];
  for (const row of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === row.group) {
      last.rows.push(row);
    } else {
      grouped.push({ group: row.group, rows: [row] });
    }
  }

  // Keyboard navigation: Arrow keys move between cells
  const handleCellKey = useCallback((e: React.KeyboardEvent, ri: number, ci: number) => {
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (!arrows.includes(e.key)) return;
    if (e.key === 'Tab') return; // let browser handle Tab

    e.preventDefault();
    if (!tbodyRef.current) return;

    let nextRi = ri, nextCi = ci;
    if (e.key === 'ArrowDown')  nextRi = Math.min(ri + 1, filtered.length - 1);
    if (e.key === 'ArrowUp')    nextRi = Math.max(ri - 1, 0);
    if (e.key === 'ArrowRight') nextCi = Math.min(ci + 1, modes.length - 1);
    if (e.key === 'ArrowLeft')  nextCi = Math.max(ci - 1, 0);

    const target = tbodyRef.current.querySelector<HTMLInputElement>(`[data-cell="${nextRi}-${nextCi}"]`);
    target?.focus();
  }, [filtered.length, modes.length]);

  // Flat index for keyboard nav
  const flatIdx = 0;
  const flatRows: StudioRow[] = [];
  for (const g of grouped) { for (const r of g.rows) flatRows.push(r); }

  return (
    <div className="flex flex-col h-full text-[11px]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        {searchable && (
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-white/20 placeholder:text-white/30"
          />
        )}
        {onAddMode && (
          <button
            onClick={onAddMode}
            className="shrink-0 px-2 py-1 rounded border border-white/10 text-[11px] text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          >
            + Add Mode
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[#111]">
            <tr className="border-b border-white/10">
              <th className="text-left px-3 py-1.5 font-medium text-white/50 w-[200px] min-w-[160px]">Name</th>
              {modes.map(m => (
                <th key={m.id} className="text-left px-2 py-1.5 font-medium text-white/50 border-l border-white/5 min-w-[120px]">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {grouped.map(({ group, rows: gRows }) => (
              <React.Fragment key={group ?? '__default__'}>
                {group && (
                  <tr className="bg-white/[0.03]">
                    <td colSpan={1 + modes.length} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      {group}
                    </td>
                  </tr>
                )}
                {gRows.map(row => {
                  const ri = flatRows.indexOf(row);
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-white/5 hover:bg-white/[0.04] transition-colors group"
                    >
                      <td className="px-3 py-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <TypeIcon type={row.type} />
                          <span className="truncate text-[11px] text-white/80">{row.label}</span>
                          <span className="hidden group-hover:block text-[9px] text-white/25 truncate font-mono ml-auto">{row.key}</span>
                        </div>
                      </td>
                      {modes.map((mode, ci) => (
                        <Cell
                          key={mode.id}
                          rowKey={row.key}
                          modeId={mode.id}
                          type={row.type}
                          value={getValue(row.key, mode.id)}
                          onChange={v => onValueChange(row.key, mode.id, v)}
                          rowIdx={ri}
                          colIdx={ci}
                          totalCols={modes.length}
                          onKeyDown={handleCellKey}
                        />
                      ))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {onAddRow && (
        <div className="shrink-0 border-t border-white/10 px-3 py-2">
          <button
            onClick={onAddRow}
            className="text-[11px] text-white/50 hover:text-white transition-colors"
          >
            {addRowLabel}
          </button>
        </div>
      )}
    </div>
  );
}
