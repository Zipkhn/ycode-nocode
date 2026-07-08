import type { ObjectType } from '@/types';
import { getAppSettingValue, setAppSetting } from '@/lib/repositories/appSettingsRepository';
import { getAllFields, updateField } from '@/lib/repositories/collectionFieldRepository';

/**
 * Object Type Repository (amélioration #1 — named reusable object types).
 *
 * The registry is site-wide, stored in app_settings (JSONB, no migration).
 * Fields link to a type via `data.objectTypeId` and keep a denormalized
 * `data.objectFields` copy — so all read paths stay untouched. Editing a type
 * propagates its fields to every linked collection field (draft + published).
 */

const APP_ID = 'cms';
const KEY = 'object_types';

export async function getObjectTypes(): Promise<ObjectType[]> {
  const types = await getAppSettingValue<ObjectType[]>(APP_ID, KEY);
  return Array.isArray(types) ? types : [];
}

export async function saveObjectTypes(types: ObjectType[]): Promise<void> {
  await setAppSetting(APP_ID, KEY, types);
}

/**
 * Insert or update a single type, then propagate to linked fields.
 * Dedupes by name (case-insensitive): a "save as new type" with a name that
 * already exists updates that type in place instead of creating a duplicate,
 * and any other entries sharing the name are collapsed into it.
 */
export async function upsertObjectType(type: ObjectType): Promise<ObjectType[]> {
  const types = await getObjectTypes();
  const nameKey = type.name.trim().toLowerCase();
  const match = types.find(t => t.id === type.id) ?? types.find(t => t.name.trim().toLowerCase() === nameKey);
  const finalType: ObjectType = { ...type, id: match?.id ?? type.id };
  const next = types.filter(t => t.id !== finalType.id && t.name.trim().toLowerCase() !== nameKey);
  next.push(finalType);
  await saveObjectTypes(next);
  await propagateObjectType(finalType);
  return next;
}

/** Remove a type from the registry. Linked fields keep their last objectFields snapshot. */
export async function deleteObjectType(id: string): Promise<ObjectType[]> {
  const types = (await getObjectTypes()).filter(t => t.id !== id);
  await saveObjectTypes(types);
  return types;
}

/**
 * Propagate a type's fields to every collection field linked via `data.objectTypeId`,
 * across both draft and published rows.
 */
export async function propagateObjectType(type: ObjectType): Promise<void> {
  for (const isPublished of [false, true]) {
    const fields = await getAllFields(isPublished);
    const linked = fields.filter(f => f.data?.objectTypeId === type.id);
    for (const field of linked) {
      await updateField(
        field.id,
        { data: { ...field.data, objectTypeId: type.id, objectFields: type.fields } },
        isPublished,
      );
    }
  }
}
