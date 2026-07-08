import { NextRequest, NextResponse } from 'next/server';
import { restoreItemVersion } from '@/lib/services/collectionItemVersionService';
import { getItemWithValues, enrichSingleItemWithStatus } from '@/lib/repositories/collectionItemRepository';

/**
 * POST /ycode/api/versions/[id]/restore
 * Restore a collection_item to the state captured in the given version.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const itemId = await restoreItemVersion(id);
    if (!itemId) {
      return NextResponse.json({ error: 'Version cannot be restored' }, { status: 400 });
    }

    const item = await getItemWithValues(itemId, false);
    if (item) {
      await enrichSingleItemWithStatus(item, item.collection_id);
    }

    return NextResponse.json({ data: item });
  } catch (error) {
    console.error('Error restoring version:', error);
    return NextResponse.json({ error: 'Failed to restore version' }, { status: 500 });
  }
}
