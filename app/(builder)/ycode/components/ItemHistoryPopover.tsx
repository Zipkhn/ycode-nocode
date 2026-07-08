'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { versionsApi } from '@/lib/api';
import type { Version, CollectionItemWithValues } from '@/types';

interface ItemHistoryPopoverProps {
  itemId: string;
  onRestored: (item: CollectionItemWithValues) => void;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
};

/**
 * Version history for a CMS item (P3). Lists snapshots recorded on each write
 * and restores the item to a chosen revision (which itself records a new one).
 */
export default function ItemHistoryPopover({ itemId, onRestored }: ItemHistoryPopoverProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await versionsApi.getHistory('collection_item', itemId);
      setVersions(res.data || []);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const restore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      const res = await versionsApi.restore(versionId);
      if (res.error || !res.data) throw new Error(res.error || 'No data');
      onRestored(res.data);
      toast.success('Version restored');
      setOpen(false);
    } catch {
      toast.error('Failed to restore version');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm" variant="secondary"
          title="Version history"
        >
          <Icon name="undo" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b text-sm font-medium">Version history</div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">No history yet</div>
          ) : (
            versions.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent border-b last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {v.description || ACTION_LABEL[v.action_type] || v.action_type}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()}
                  </div>
                </div>
                {i === 0 ? (
                  <span className="text-[11px] text-muted-foreground shrink-0">Current</span>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={restoringId !== null}
                    onClick={() => restore(v.id)}
                  >
                    {restoringId === v.id ? '…' : 'Restore'}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
