/**
 * Object Types Store (amélioration #1 — named reusable object types).
 *
 * Site-wide registry of named object schemas. Fields link by id and keep a
 * denormalized copy; saving a type propagates server-side to linked fields.
 */

import { create } from 'zustand';
import type { ObjectType } from '@/types';

const BASE = '/ycode/api/object-types';

interface ObjectTypesState {
  objectTypes: ObjectType[];
  isLoaded: boolean;
  isLoading: boolean;
  load: () => Promise<void>;
  /** Create or update a type. Returns the saved type (with id) or null on failure. */
  save: (type: { id?: string; name: string; fields: ObjectType['fields'] }) => Promise<ObjectType | null>;
  remove: (id: string) => Promise<void>;
}

export const useObjectTypesStore = create<ObjectTypesState>((set, get) => ({
  objectTypes: [],
  isLoaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true });
    try {
      const res = await fetch(BASE);
      const json = await res.json();
      set({ objectTypes: json.data ?? [], isLoaded: true });
    } catch {
      set({ isLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },

  save: async (type) => {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (Array.isArray(json.types)) set({ objectTypes: json.types });
    return json.data ?? null;
  },

  remove: async (id) => {
    const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json.types)) set({ objectTypes: json.types });
    else set({ objectTypes: get().objectTypes.filter(t => t.id !== id) });
  },
}));
