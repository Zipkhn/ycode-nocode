import type { CollectionField, CollectionFieldType } from '@/types';
import { validateField } from '@/lib/collection-field-utils';

/**
 * Serialize an incoming write value to the string stored in the EAV value column.
 * object/array (amélioration #1) arrive as real JSON in the body → stringify so both
 * validation and storage see the JSON string. Other types pass through unchanged.
 */
export function serializeWriteValue(fieldType: CollectionFieldType, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (fieldType === 'object' || fieldType === 'array') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value as string;
}

/** Max accepted request body for item writes (finding sécu #4). */
export const MAX_ITEM_BODY_BYTES = 512 * 1024; // 512 KB

/** Reject oversized bodies early via Content-Length (best-effort). */
export function bodyTooLarge(request: Request): boolean {
  const len = request.headers.get('content-length');
  if (!len) return false;
  const n = parseInt(len, 10);
  return Number.isFinite(n) && n > MAX_ITEM_BODY_BYTES;
}

/** Fields the user never sets — skipped by validation. */
const PROTECTED_KEYS = new Set(['id', 'created_at', 'updated_at']);

/** One field's validation failure, keyed by slug for the API response. */
export interface ItemValidationError {
  field: string;
  messages: string[];
}

/** Coerce a stored/incoming value to the string the engine validates. */
function toStr(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function fieldSlug(field: CollectionField): string {
  return field.key || field.name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Server-side validation for item writes (amélioration #2, finding sécu #4).
 * Runs the sync rule engine on every applicable field, then DB-backed `unique`.
 *
 * @param requiredCheck 'all' (POST/PUT — enforce required on missing fields)
 *                      | 'present' (PATCH — only validate fields in the payload)
 * @returns [] when valid, otherwise one entry per failing field.
 */
export async function validateItemWrite(
  collectionId: string,
  fields: CollectionField[],
  valuesById: Record<string, string | null>,
  opts: { requiredCheck: 'all' | 'present'; excludeItemId?: string }
): Promise<ItemValidationError[]> {
  const errors: ItemValidationError[] = [];
  const uniqueChecks: { field: CollectionField; value: string }[] = [];

  for (const field of fields) {
    if (field.key && PROTECTED_KEYS.has(field.key)) continue;
    if (field.is_computed) continue;

    const provided = Object.prototype.hasOwnProperty.call(valuesById, field.id);
    // PATCH: skip fields not in the payload (untouched).
    if (opts.requiredCheck === 'present' && !provided) continue;

    const value = toStr(valuesById[field.id]);
    const result = validateField(field, value);
    if (!result.valid) {
      errors.push({ field: fieldSlug(field), messages: result.errors });
    }

    // Queue unique check for non-empty values that carry the rule.
    if (field.data?.validation?.unique && value.trim()) {
      uniqueChecks.push({ field, value: value.trim() });
    }
  }

  // DB-backed uniqueness (fail-open if admin client unavailable, matching route guards).
  if (uniqueChecks.length > 0) {
    const { getSupabaseAdmin } = await import('@/lib/supabase-server');
    const client = await getSupabaseAdmin();
    if (client) {
      for (const { field, value } of uniqueChecks) {
        const { data } = await client
          .from('collection_item_values')
          .select('item_id, collection_items!inner(collection_id, deleted_at)')
          .eq('field_id', field.id)
          .eq('value', value)
          .eq('is_published', true);

        const dup = (data ?? []).some((row: { item_id: string; collection_items: { collection_id: string; deleted_at: string | null } | { collection_id: string; deleted_at: string | null }[] }) => {
          if (row.item_id === opts.excludeItemId) return false;
          const ci = Array.isArray(row.collection_items) ? row.collection_items[0] : row.collection_items;
          return ci && ci.collection_id === collectionId && !ci.deleted_at;
        });

        if (dup) {
          const slug = fieldSlug(field);
          const existing = errors.find((e) => e.field === slug);
          const msg = `${field.name || 'Field'} must be unique`;
          if (existing) existing.messages.push(msg);
          else errors.push({ field: slug, messages: [msg] });
        }
      }
    }
  }

  return errors;
}
