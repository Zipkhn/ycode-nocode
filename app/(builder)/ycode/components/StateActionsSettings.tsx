'use client';

/**
 * App State actions — author user-behavior triggers that mutate runtime
 * variables (Conditionals / Webflow-style "set variable"). Each row binds a
 * trigger (click/hover/load) to one variable mutation. The vars drive
 * "Runtime variable" visibility conditions (and, later, conditional styles).
 *
 * Persists to `layer.stateActions`; executed at runtime by
 * components/runtime/VariableTriggers.
 */
import React, { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsPanel from './SettingsPanel';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { useProjectVariablePaths } from './VariablesModal';
import type { Layer, StateActionTrigger, SetVariableAction } from '@/types';

interface Props {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

const TRIGGERS: { value: StateActionTrigger['trigger']; label: string }[] = [
  { value: 'click', label: 'On click' },
  { value: 'hover', label: 'On hover' },
  { value: 'load', label: 'On load' },
];

const OPS: { value: SetVariableAction['op']; label: string }[] = [
  { value: 'toggle', label: 'Toggle' },
  { value: 'set', label: 'Set to' },
  { value: 'increment', label: 'Increment' },
  { value: 'decrement', label: 'Decrement' },
];

const emptyAction = (): SetVariableAction => ({ varPath: '', op: 'toggle' });

export default function StateActionsSettings({ layer, onLayerUpdate }: Props) {
  const rows = layer?.stateActions ?? [];
  const paths = useProjectVariablePaths();
  const [isOpen, setIsOpen] = useState(rows.length > 0);

  const commit = useCallback((next: StateActionTrigger[]) => {
    if (!layer) return;
    onLayerUpdate(layer.id, { stateActions: next.length ? next : undefined });
  }, [layer, onLayerUpdate]);

  const addRow = () => {
    commit([...rows, { id: Date.now().toString(), trigger: 'click', actions: [emptyAction()] }]);
    setIsOpen(true);
  };

  const updateRow = (
    id: string,
    rowPatch: Partial<StateActionTrigger>,
    actionPatch?: Partial<SetVariableAction>,
  ) => {
    commit(rows.map(r => {
      if (r.id !== id) return r;
      const action = { ...(r.actions[0] ?? emptyAction()), ...actionPatch };
      return { ...r, ...rowPatch, actions: [action] };
    }));
  };

  const removeRow = (id: string) => commit(rows.filter(r => r.id !== id));

  if (!layer) return null;

  return (
    <SettingsPanel
      title="App State actions"
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
      <datalist id="ycode-state-paths">
        {paths.map(p => <option key={p} value={p} />)}
      </datalist>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-0.5">
          Set a runtime variable on click / hover / load, then show or hide elements with a
          &ldquo;Runtime variable&rdquo; visibility condition.
        </p>
      ) : (
        rows.map((row) => {
          const action = row.actions[0] ?? emptyAction();
          const needsValue = action.op !== 'toggle';
          return (
            <div key={row.id} className="flex flex-col gap-1.5 border-b border-border/50 pb-2 last:border-0">
              <div className="flex items-center gap-1.5">
                <Select value={row.trigger} onValueChange={(v) => updateRow(row.id, { trigger: v as StateActionTrigger['trigger'] })}>
                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map(t => <SelectItem
                      key={t.value} value={t.value}
                      className="text-xs"
                                       >{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="xs"
                  onClick={() => removeRow(row.id)}
                >
                  <Icon name="x" className="size-2.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-7 text-xs flex-1 font-mono"
                  placeholder="state.menuOpen"
                  list="ycode-state-paths"
                  value={action.varPath}
                  onChange={(e) => updateRow(row.id, {}, { varPath: e.target.value })}
                />
                <Select value={action.op} onValueChange={(v) => updateRow(row.id, {}, { op: v as SetVariableAction['op'] })}>
                  <SelectTrigger className="h-7 text-xs w-[104px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPS.map(o => <SelectItem
                      key={o.value} value={o.value}
                      className="text-xs"
                                  >{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {needsValue && (
                  <Input
                    className="h-7 text-xs w-[72px]"
                    placeholder={action.op === 'set' ? 'value' : '1'}
                    value={action.value ?? ''}
                    onChange={(e) => updateRow(row.id, {}, { value: e.target.value })}
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
