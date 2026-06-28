'use client';

/**
 * Variables (App State) — define project-level runtime variables for the
 * Conditionals feature. Stored in the settings table under `project_variables`.
 * Variables are referenced as `state.<name>` in App State actions and Runtime
 * variable visibility conditions.
 *
 * Rendered inline in the right sidebar's Page context (no layer selected),
 * replacing the former topbar modal.
 */
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Icon from '@/components/ui/icon';
import type { VariableDefinition } from '@/types';

const TYPES: VariableDefinition['type'][] = ['boolean', 'string', 'number'];

/** Read defined variable paths (`state.<name>`) for autocomplete in path inputs. */
export function useProjectVariablePaths(): string[] {
  const stored = useSettingsStore(s => s.settingsByKey.project_variables) as VariableDefinition[] | undefined;
  if (!Array.isArray(stored)) return [];
  return stored.map(v => `state.${v.name}`).filter(p => p !== 'state.');
}

export default function VariablesPanel() {
  const stored = useSettingsStore(s => s.settingsByKey.project_variables) as VariableDefinition[] | undefined;
  const [rows, setRows] = useState<VariableDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setRows(Array.isArray(stored) ? stored : []); }, [stored]);

  const addRow = () =>
    setRows(r => [...r, { id: Date.now().toString(), name: '', type: 'boolean', defaultValue: 'false' }]);
  const update = (id: string, patch: Partial<VariableDefinition>) =>
    setRows(r => r.map(v => (v.id === id ? { ...v, ...patch } : v)));
  const remove = (id: string) => setRows(r => r.filter(v => v.id !== id));

  const onSave = async () => {
    setSaving(true);
    const clean = rows.filter(v => v.name.trim()).map(v => ({ ...v, name: v.name.trim() }));
    await useSettingsStore.getState().saveSettings({ project_variables: clean });
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Icon name="zap" className="size-3.5" /> Variables
        </div>
        <span className="text-[10px] text-muted-foreground">App State</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Runtime variables, referenced as <code className="font-mono">state.&lt;name&gt;</code> in
        App State actions and conditions.
      </p>
      {rows.map(v => (
        <div key={v.id} className="flex flex-col gap-1 border rounded-md p-1.5">
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-xs flex-1 min-w-0 font-mono"
              placeholder="menuOpen"
              value={v.name}
              onChange={e => update(v.id, { name: e.target.value })}
            />
            <Select value={v.type} onValueChange={(t) => update(v.id, { type: t as VariableDefinition['type'] })}>
              <SelectTrigger className="h-7 text-xs w-[78px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(t => <SelectItem
                  key={t} value={t}
                  className="text-xs"
                                >{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="ghost" size="xs"
              className="shrink-0" onClick={() => remove(v.id)}
            >
              <Icon name="x" className="size-2.5" />
            </Button>
          </div>
          <Input
            className="h-7 text-xs"
            placeholder="default value"
            value={v.defaultValue ?? ''}
            onChange={e => update(v.id, { defaultValue: e.target.value })}
          />
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="secondary" size="xs"
          onClick={addRow}
        >
          <Icon name="plus" className="size-3 mr-1" /> Add
        </Button>
        <Button
          size="xs" onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
