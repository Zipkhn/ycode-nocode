import { createHash } from 'crypto';
import { createVersion, getVersionById } from '@/lib/repositories/versionRepository';
import { getValuesByItemId, setValues } from '@/lib/repositories/collectionItemValueRepository';
import { updateItem } from '@/lib/repositories/collectionItemRepository';
import type { VersionActionType } from '@/types';

/**
 * Collection Item Version Service (P3 — CMS history).
 *
 * Full-snapshot revisions: each write records the item's complete draft
 * value set (WordPress-style). Restore re-applies a snapshot and records a
 * new revision. Reuses the `versions` table with entity_type 'collection_item'.
 */

const ENTITY = 'collection_item' as const;

interface ItemSnapshot {
  values: Record<string, string | null>;
}

function hashSnapshot(snap: ItemSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snap.values)).digest('hex');
}

async function buildSnapshot(itemId: string): Promise<ItemSnapshot> {
  const rows = await getValuesByItemId(itemId, false);
  const values: Record<string, string | null> = {};
  for (const row of rows) values[row.field_id] = row.value;
  return { values };
}

/**
 * Record a revision of an item's current draft values.
 * Fire-and-forget: never throws, so it can't break the originating write.
 */
export async function recordItemVersion(
  itemId: string,
  action: VersionActionType,
  description?: string,
): Promise<void> {
  try {
    const snapshot = await buildSnapshot(itemId);
    await createVersion({
      entity_type: ENTITY,
      entity_id: itemId,
      action_type: action,
      description: description ?? null,
      redo: snapshot,
      snapshot,
      current_hash: hashSnapshot(snapshot),
    });
  } catch (error) {
    console.error('Failed to record item version:', error);
  }
}

/**
 * Restore an item's draft values from a stored version snapshot.
 * Clears fields present now but absent from the snapshot, applies the
 * snapshot, then records the restore as a new revision.
 * @returns the item id on success, null if the version is unusable.
 */
export async function restoreItemVersion(versionId: string): Promise<string | null> {
  const version = await getVersionById(versionId);
  if (!version || version.entity_type !== ENTITY) return null;

  const snap = (version.snapshot ?? version.redo) as ItemSnapshot | null;
  if (!snap || typeof snap.values !== 'object') return null;

  const itemId = version.entity_id;
  const current = await buildSnapshot(itemId);

  // Merge: keep current keys (cleared to null unless present in snapshot),
  // then overlay the snapshot values.
  const merged: Record<string, string | null> = {};
  for (const key of Object.keys(current.values)) merged[key] = null;
  for (const [key, value] of Object.entries(snap.values)) merged[key] = value;

  await setValues(itemId, merged, false);
  await updateItem(itemId, {}, false); // bump updated_at
  await recordItemVersion(itemId, 'update', 'Restored version');
  return itemId;
}
