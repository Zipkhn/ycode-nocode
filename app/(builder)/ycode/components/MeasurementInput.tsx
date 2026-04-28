'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const UNITS = ['px', 'rem', 'em', '%', 'vw', 'vh', 'dvw', 'dvh', 'svw', 'svh', 'lvw', 'lvh'] as const;
type CSSUnit = typeof UNITS[number];

const SPECIAL = new Set(['auto', 'full', 'screen', 'fit', 'min', 'max', 'none', '0', '']);

function parseRaw(raw: string): { num: string; unit: CSSUnit } {
  if (!raw || SPECIAL.has(raw)) return { num: raw ?? '', unit: 'px' };
  for (const u of UNITS) {
    if (raw.endsWith(u)) return { num: raw.slice(0, -u.length), unit: u };
  }
  return { num: raw, unit: 'px' };
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes on the wrapper div */
  className?: string;
  /** Extra classes on the text input */
  inputClassName?: string;
}

export function MeasurementInput({
  value,
  onChange,
  onFocus,
  placeholder = '0',
  disabled,
  className = '',
  inputClassName = '',
}: Props) {
  const { num: initNum, unit: initUnit } = parseRaw(value);
  const [localNum, setLocalNum] = useState(initNum);
  const [unit, setUnit] = useState<CSSUnit>(initUnit);
  const editing = useRef(false);

  // Sync with store when not actively editing
  useEffect(() => {
    if (editing.current) return;
    const { num, unit: u } = parseRaw(value);
    setLocalNum(num);
    setUnit(u);
  }, [value]);

  const emit = useCallback((num: string, u: CSSUnit) => {
    if (!num || SPECIAL.has(num)) onChange(num);
    else onChange(num + u);
  }, [onChange]);

  return (
    <div className={`flex items-center gap-0 group/mi ${className}`}>
      <input
        type="text"
        value={localNum}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { editing.current = true; onFocus?.(); }}
        onBlur={() => { editing.current = false; }}
        onChange={e => {
          const v = e.target.value.replace(/\s/g, '');
          setLocalNum(v);
          emit(v, unit);
        }}
        onKeyDown={e => e.stopPropagation()}
        className={`flex-1 min-w-0 bg-transparent outline-none ${inputClassName}`}
      />
      <div className="shrink-0 w-0 overflow-hidden group-focus-within/mi:w-[3.2ch]">
        <select
          value={unit}
          disabled={disabled}
          tabIndex={-1}
          onChange={e => {
            const u = e.target.value as CSSUnit;
            setUnit(u);
            emit(localNum, u);
          }}
          className="bg-transparent text-[10px] font-mono text-muted-foreground border-0 outline-none cursor-pointer hover:text-foreground transition-colors appearance-none w-[3.2ch] text-right"
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}
