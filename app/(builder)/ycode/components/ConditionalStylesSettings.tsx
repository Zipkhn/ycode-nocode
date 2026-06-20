'use client';

/**
 * Conditional styles (App State): apply Tailwind classes
 * to an element while a runtime-variable condition holds. Persists to
 * `layer.variables.conditionalStyles`; classes are compiled by cssGenerator and
 * toggled at runtime by components/runtime/RuntimeStyles.
 */
import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsPanel from './SettingsPanel';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { useProjectVariablePaths } from './VariablesModal';
import type { Layer, ConditionalStyleRule, VisibilityOperator } from '@/types';

interface Props {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

const OPERATORS: { value: VisibilityOperator; label: string }[] = [
  { value: 'is', label: 'Equals' },
  { value: 'is_not', label: 'Not equal' },
  { value: 'is_present', label: 'Is set' },
  { value: 'is_empty', label: 'Is not set' },
  { value: 'contains', label: 'Contains' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
];
const NO_VALUE: VisibilityOperator[] = ['is_present', 'is_empty'];

export default function ConditionalStylesSettings({ layer, onLayerUpdate }: Props) {
  const rows = layer?.variables?.conditionalStyles ?? [];
  const paths = useProjectVariablePaths();
  const [isOpen, setIsOpen] = useState(rows.length > 0);

  const commit = useCallback((next: ConditionalStyleRule[]) => {
    if (!layer) return;
    onLayerUpdate(layer.id, {
      variables: { ...layer.variables, conditionalStyles: next.length ? next : undefined },
    });
  }, [layer, onLayerUpdate]);

  const addRow = () => {
    commit([...rows, { id: Date.now().toString(), className: '', varPath: '', operator: 'is', value: 'true' }]);
    setIsOpen(true);
  };
  const updateRow = (id: string, patch: Partial<ConditionalStyleRule>) =>
    commit(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => commit(rows.filter(r => r.id !== id));

  if (!layer) return null;

  return (
    <SettingsPanel
      title="Conditional styles"
      collapsible
      isOpen={isOpen}
      onToggle={() => setIsOpen(o => !o)}
      action={
        <Button
          variant="ghost" size="xs"
          onClick={addRow}
        >
          <Icon name="plus" className="size-3" />
        </Button>
      }
    >
      <datalist id="ycode-style-paths">
        {paths.map(p => <option key={p} value={p} />)}
      </datalist>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-0.5">
          Apply Tailwind classes while a runtime variable condition holds.
        </p>
      ) : (
        rows.map((r) => {
          const needsValue = !NO_VALUE.includes(r.operator);
          return (
            <div key={r.id} className="flex flex-col gap-1.5 border-b border-border/50 pb-2 last:border-0">
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-7 text-xs flex-1 font-mono"
                  placeholder="is-active bg-blue-500"
                  value={r.className}
                  onChange={(e) => updateRow(r.id, { className: e.target.value })}
                />
                <Button
                  variant="ghost" size="xs"
                  onClick={() => removeRow(r.id)}
                >
                  <Icon name="x" className="size-2.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-7 text-xs flex-1 font-mono"
                  placeholder="state.active"
                  list="ycode-style-paths"
                  value={r.varPath}
                  onChange={(e) => updateRow(r.id, { varPath: e.target.value })}
                />
                <Select value={r.operator} onValueChange={(v) => updateRow(r.id, { operator: v as VisibilityOperator })}>
                  <SelectTrigger className="h-7 text-xs w-[104px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map(o => <SelectItem
                      key={o.value} value={o.value}
                      className="text-xs"
                                        >{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <Input
                    className="h-7 text-xs w-[72px]"
                    placeholder="true"
                    value={r.value ?? ''}
                    onChange={(e) => updateRow(r.id, { value: e.target.value })}
                  />
                )}
              </div>
            </div>
          );
        })
      )}
    </SettingsPanel>
  );
}
