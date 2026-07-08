/**
 * NestedFieldInput — editor for `object` / `array` collection fields (amélioration #1).
 * Controlled: `value` is the stored JSON string, `onChange` emits a JSON string.
 * Array items carry an auto-generated `_key` (Sanity-style) for stable ordering.
 */
'use client';

import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import type { ObjectSubField } from '@/types';

type Obj = { [k: string]: unknown };

function genKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `k-${Math.random().toString(36).slice(2, 10)}`;
}

function SubFieldInput({
  sub,
  value,
  onChange,
}: {
  sub: ObjectSubField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <Label className="text-xs text-muted-foreground font-normal">
      {sub.name}
      {sub.validation?.required ? ' *' : ''}
    </Label>
  );

  if (sub.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={value === true || value === 'true'}
          onCheckedChange={(c) => onChange(c === true)}
        />
        {label}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      <Input
        type={sub.type === 'number' ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={sub.name}
        autoComplete="off"
      />
    </div>
  );
}

export default function NestedFieldInput({
  subFields,
  isArray,
  value,
  onChange,
}: {
  subFields: ObjectSubField[];
  isArray: boolean;
  value: unknown;
  onChange: (v: string) => void;
}) {
  const parsed = useMemo(() => {
    if (value == null || value === '') return isArray ? [] : {};
    if (typeof value === 'object') return value as unknown;
    try {
      return JSON.parse(value as string);
    } catch {
      return isArray ? [] : {};
    }
  }, [value, isArray]);

  const emit = (next: unknown) => onChange(JSON.stringify(next));

  const renderRecord = (obj: Obj, onObj: (next: Obj) => void) => (
    <div className="flex flex-col gap-2">
      {subFields.map((sub) => (
        <SubFieldInput
          key={sub.key}
          sub={sub}
          value={obj?.[sub.key]}
          onChange={(v) => onObj({ ...obj, [sub.key]: v })}
        />
      ))}
    </div>
  );

  if (subFields.length === 0) {
    return <p className="text-xs text-muted-foreground">No fields defined for this {isArray ? 'array' : 'object'}.</p>;
  }

  if (!isArray) {
    return renderRecord((parsed ?? {}) as Obj, emit);
  }

  const items: Obj[] = Array.isArray(parsed) ? (parsed as Obj[]) : [];
  const addItem = () => emit([...items, { _key: genKey() }]);
  const removeItem = (i: number) => emit(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, next: Obj) => emit(items.map((it, idx) => (idx === i ? next : it)));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={(item?._key as string) ?? i} className="border rounded-md p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Item {i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeItem(i)}
              aria-label="Remove item"
            >
              <Icon name="x" />
            </Button>
          </div>
          {renderRecord(item ?? {}, (next) => updateItem(i, { ...next, _key: (item?._key as string) ?? genKey() }))}
        </div>
      ))}
      <Button
        type="button" variant="secondary"
        size="sm" className="w-fit"
        onClick={addItem}
      >
        <Icon name="plus" className="size-3" />
        Add item
      </Button>
    </div>
  );
}
