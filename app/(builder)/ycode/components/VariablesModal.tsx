'use client';

/**
 * Variables (App State) — define project-level runtime variables for the
 * Conditionals feature. Stored in the settings table under `project_variables`.
 * Variables are referenced as `state.<name>` in App State actions and Runtime
 * variable visibility conditions. Mirrors the StudioModal open/portal pattern.
 */
import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Icon from '@/components/ui/icon';
import type { VariableDefinition } from '@/types';

interface VariablesUIStore { isOpen: boolean; open: () => void; close: () => void; toggle: () => void; }
export const useVariablesStore = create<VariablesUIStore>(set => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
}));

const TYPES: VariableDefinition['type'][] = ['boolean', 'string', 'number'];

/** Read defined variable paths (`state.<name>`) for autocomplete in path inputs. */
export function useProjectVariablePaths(): string[] {
  const stored = useSettingsStore(s => s.settingsByKey.project_variables) as VariableDefinition[] | undefined;
  if (!Array.isArray(stored)) return [];
  return stored.map(v => `state.${v.name}`).filter(p => p !== 'state.');
}

export default function VariablesModal() {
  const isOpen = useVariablesStore(s => s.isOpen);
  const close = useVariablesStore(s => s.close);
  const stored = useSettingsStore(s => s.settingsByKey.project_variables) as VariableDefinition[] | undefined;
  const [rows, setRows] = useState<VariableDefinition[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (isOpen) setRows(Array.isArray(stored) ? stored : []); }, [isOpen, stored]);

  if (!isOpen) return null;

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
    close();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="bg-background border rounded-lg shadow-xl w-[540px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-medium">Variables · App State</div>
          <Button
            variant="ghost" size="xs"
            onClick={close}
          ><Icon name="x" className="size-3" /></Button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Define runtime variables, referenced as <code className="font-mono">state.&lt;name&gt;</code> in
            App State actions and Runtime variable conditions.
          </p>
          {rows.map(v => (
            <div key={v.id} className="flex items-center gap-1.5">
              <Input
                className="h-7 text-xs flex-1 font-mono"
                placeholder="menuOpen"
                value={v.name}
                onChange={e => update(v.id, { name: e.target.value })}
              />
              <Select value={v.type} onValueChange={(t) => update(v.id, { type: t as VariableDefinition['type'] })}>
                <SelectTrigger className="h-7 text-xs w-[92px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem
                    key={t} value={t}
                    className="text-xs"
                                  >{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-7 text-xs w-[88px]"
                placeholder="default"
                value={v.defaultValue ?? ''}
                onChange={e => update(v.id, { defaultValue: e.target.value })}
              />
              <Button
                variant="ghost" size="xs"
                onClick={() => remove(v.id)}
              ><Icon name="x" className="size-2.5" /></Button>
            </div>
          ))}
          <Button
            variant="secondary" size="xs"
            onClick={addRow}
          >
            <Icon name="plus" className="size-3 mr-1" /> Add variable
          </Button>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <Button
            variant="ghost" size="sm"
            onClick={close}
          >Cancel</Button>
          <Button
            size="sm" onClick={onSave}
            disabled={saving}
          >{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
