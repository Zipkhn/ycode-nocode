import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { noCache } from '@/lib/api-response';
import { getObjectTypes, upsertObjectType, deleteObjectType } from '@/lib/repositories/objectTypeRepository';
import { validateObjectFieldsSchema } from '@/lib/collection-field-utils';
import type { ObjectType } from '@/types';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** GET /ycode/api/object-types — list all named object types */
export async function GET() {
  try {
    return noCache({ data: await getObjectTypes() });
  } catch (error) {
    return noCache({ error: error instanceof Error ? error.message : 'Failed to fetch object types' }, 500);
  }
}

/**
 * POST /ycode/api/object-types — create or update a named object type.
 * Body: { id?, name, fields }. Updating propagates fields to all linked collection fields.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, fields } = body ?? {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return noCache({ error: 'Name is required' }, 400);
    }
    const schemaError = validateObjectFieldsSchema(fields);
    if (schemaError) {
      return noCache({ error: schemaError }, 400);
    }

    const type: ObjectType = { id: typeof id === 'string' && id ? id : randomUUID(), name: name.trim(), fields };
    const types = await upsertObjectType(type);
    // Name-dedup may have reused an existing id — return the actually saved type.
    const saved = types.find(t => t.name.trim().toLowerCase() === type.name.toLowerCase()) ?? type;
    return noCache({ data: saved, types }, 200);
  } catch (error) {
    return noCache({ error: error instanceof Error ? error.message : 'Failed to save object type' }, 500);
  }
}

/** DELETE /ycode/api/object-types?id=... — remove a type (linked fields keep their snapshot) */
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return noCache({ error: 'id is required' }, 400);
    return noCache({ types: await deleteObjectType(id) });
  } catch (error) {
    return noCache({ error: error instanceof Error ? error.message : 'Failed to delete object type' }, 500);
  }
}
