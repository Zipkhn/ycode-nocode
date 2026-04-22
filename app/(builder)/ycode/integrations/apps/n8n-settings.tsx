'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import type { N8NConnection } from '@/lib/apps/n8n/types';

// =============================================================================
// Types
// =============================================================================

interface FormSummary {
  form_id: string;
  submission_count: number;
  new_count: number;
}

interface N8NSettingsProps {
  onConnectionChange: (connected: boolean) => void;
  onDisconnect: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function N8NSettings({ onConnectionChange, onDisconnect }: N8NSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [connections, setConnections] = useState<N8NConnection[]>([]);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);

  // Inline form state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFormId, setFormFormId] = useState('');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formAuthHeaderName, setFormAuthHeaderName] = useState('');
  const [formAuthHeaderValue, setFormAuthHeaderValue] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Delete state
  const [connectionToDelete, setConnectionToDelete] = useState<N8NConnection | null>(null);

  // Stable ref so loadData doesn't re-run when parent re-renders
  const onConnectionChangeRef = useRef(onConnectionChange);
  useEffect(() => { onConnectionChangeRef.current = onConnectionChange; });

  // =========================================================================
  // Load
  // =========================================================================

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setIsLoadingForms(true);
    try {
      const [settingsRes, formsRes] = await Promise.all([
        fetch('/ycode/api/apps/n8n/settings'),
        fetch('/ycode/api/form-submissions?summary=true'),
      ]);
      const settingsResult = await settingsRes.json();
      const formsResult = await formsRes.json();

      if (settingsResult.data?.connections) {
        setConnections(settingsResult.data.connections);
        onConnectionChangeRef.current(settingsResult.data.connections.length > 0);
      }
      if (formsResult.data) setForms(formsResult.data);
    } catch (error) {
      console.error('Failed to load N8N settings:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingForms(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // =========================================================================
  // Persist helpers
  // =========================================================================

  const persist = async (updated: N8NConnection[]) => {
    const response = await fetch('/ycode/api/apps/n8n/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connections: updated }),
    });
    if (!response.ok) throw new Error('Failed to save');
    return updated;
  };

  // =========================================================================
  // Inline form
  // =========================================================================

  const resetForm = () => {
    setEditId(null);
    setFormName('');
    setFormFormId('');
    setFormWebhookUrl('');
    setFormAuthHeaderName('');
    setFormAuthHeaderValue('');
  };

  const openNew = () => {
    resetForm();
    setExpandedId(`new-${Date.now()}`);
  };

  const openEdit = (c: N8NConnection) => {
    if (expandedId === c.id) {
      setExpandedId(null);
      resetForm();
      return;
    }
    setEditId(c.id);
    setFormName(c.name);
    setFormFormId(c.formId);
    setFormWebhookUrl(c.webhookUrl);
    setFormAuthHeaderName(c.authHeaderName || '');
    setFormAuthHeaderValue(c.authHeaderValue || '');
    setExpandedId(c.id);
  };

  const handleSave = async () => {
    if (!formFormId || !formWebhookUrl.trim()) {
      toast.error('Form and webhook URL are required');
      return;
    }

    const connection: N8NConnection = {
      id: editId || crypto.randomUUID(),
      name: formName.trim() || formFormId,
      formId: formFormId,
      webhookUrl: formWebhookUrl.trim(),
      authHeaderName: formAuthHeaderName.trim() || undefined,
      authHeaderValue: formAuthHeaderValue.trim() || undefined,
      active: true,
    };

    const updated = editId
      ? connections.map((c) => (c.id === editId ? { ...connection, active: c.active } : c))
      : [...connections, connection];

    setIsSaving(true);
    try {
      await persist(updated);
      setConnections(updated);
      setExpandedId(null);
      resetForm();
      onConnectionChange(updated.length > 0);
      toast.success(editId ? 'Connection updated' : 'Connection added');
    } catch {
      toast.error('Failed to save connection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const updated = connections.map((c) => (c.id === id ? { ...c, active } : c));
    try {
      await persist(updated);
      setConnections(updated);
    } catch {
      toast.error('Failed to update connection');
    }
  };

  const handleDelete = async () => {
    if (!connectionToDelete) return;
    const updated = connections.filter((c) => c.id !== connectionToDelete.id);
    try {
      await persist(updated);
      setConnections(updated);
      setConnectionToDelete(null);
      onConnectionChange(updated.length > 0);
      toast.success('Connection deleted');
    } catch {
      toast.error('Failed to delete connection');
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/ycode/api/apps/n8n/settings', { method: 'DELETE' });
      setConnections([]);
      setShowDisconnect(false);
      onConnectionChange(false);
      onDisconnect();
      toast.success('N8N disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleTest = async () => {
    if (!formWebhookUrl.trim()) return;
    setIsTesting(true);
    try {
      const response = await fetch('/ycode/api/apps/n8n/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: formWebhookUrl.trim(),
          authHeaderName: formAuthHeaderName.trim() || undefined,
          authHeaderValue: formAuthHeaderValue.trim() || undefined,
        }),
      });
      const result = await response.json();
      const data = result.data;

      if (!data) {
        toast.error(result.error || 'Test failed');
      } else if (data.ok) {
        toast.success(`Webhook reachable — HTTP ${data.status}${data.message ? `: ${data.message}` : ''}`);
      } else if (data.status === 0) {
        toast.error(data.error === 'timeout' ? 'Webhook timed out (5s)' : 'Webhook unreachable');
      } else {
        toast.error(`HTTP ${data.status} from webhook`);
      }
    } catch {
      toast.error('Test request failed');
    } finally {
      setIsTesting(false);
    }
  };

  // =========================================================================
  // Connection form
  // =========================================================================

  const renderConnectionForm = () => (
    <div className="space-y-4">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          placeholder="e.g., Contact form → CRM"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          className="text-xs"
        />
      </Field>

      <Field>
        <FieldLabel>Ycode Form</FieldLabel>
        {isLoadingForms ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Spinner /> Loading forms...
          </div>
        ) : forms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">No forms found. Submit a form first.</p>
        ) : (
          <Select value={formFormId} onValueChange={setFormFormId}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Select a form" />
            </SelectTrigger>
            <SelectContent>
              {forms.map((f) => (
                <SelectItem key={f.form_id} value={f.form_id}>
                  {f.form_id} ({f.submission_count} submissions)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field>
        <FieldLabel>Webhook URL</FieldLabel>
        <FieldDescription>The n8n webhook trigger URL.</FieldDescription>
        <Input
          placeholder="https://your-n8n.instance/webhook/..."
          value={formWebhookUrl}
          onChange={(e) => setFormWebhookUrl(e.target.value)}
          className="text-xs font-mono"
        />
      </Field>

      <Field>
        <FieldLabel>Auth Header <span className="text-muted-foreground font-normal">(optional)</span></FieldLabel>
        <FieldDescription>Set a custom header for n8n webhook authentication.</FieldDescription>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Header name (e.g. Authorization)"
            value={formAuthHeaderName}
            onChange={(e) => setFormAuthHeaderName(e.target.value)}
            className="text-xs"
          />
          <Input
            type="password"
            placeholder="Header value"
            value={formAuthHeaderValue}
            onChange={(e) => setFormAuthHeaderValue(e.target.value)}
            className="text-xs font-mono"
          />
        </div>
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleTest}
          disabled={!formWebhookUrl.trim() || isTesting}
        >
          {isTesting ? 'Testing...' : 'Test connection'}
        </Button>
      </div>
    </div>
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <>
      <SheetHeader>
        <SheetTitle className="mr-auto">n8n</SheetTitle>
        {connections.length > 0 && (
          <Button
            variant="secondary" size="xs"
            onClick={() => setShowDisconnect(true)}
          >
            Disconnect
          </Button>
        )}
        <SheetDescription className="sr-only">n8n integration settings</SheetDescription>
      </SheetHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="mt-3 space-y-8">
          <FieldDescription>
            Send form submissions to n8n workflows via webhooks. Each connection links a Ycode form
            to an n8n webhook trigger URL.
          </FieldDescription>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FieldLegend>Connections</FieldLegend>
              <Button
                variant="secondary" size="xs"
                onClick={openNew}
              >
                <Icon name="plus" className="size-3 mr-1" />
                Add
              </Button>
            </div>

            {connections.length > 0 ? (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <Collapsible
                    key={connection.id}
                    open={expandedId === connection.id}
                    onOpenChange={(open: boolean) => {
                      if (open) { openEdit(connection); }
                      else { setExpandedId(null); resetForm(); }
                    }}
                  >
                    <div className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/30 transition-colors cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Label className="font-medium text-xs pointer-events-none">
                                {connection.name || connection.formId}
                              </Label>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {connection.formId} → {connection.webhookUrl}
                            </div>
                          </div>

                          <Switch
                            checked={connection.active}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(active) => handleToggle(connection.id, active)}
                          />

                          <Icon
                            name="chevronRight"
                            className={`size-3 text-muted-foreground transition-transform ${expandedId === connection.id ? 'rotate-90' : ''}`}
                          />
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="border-t px-3 pb-3 pt-3 space-y-4">
                          {renderConnectionForm()}

                          <div className="flex items-center justify-between pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConnectionToDelete(connection)}
                            >
                              Delete connection
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSave}
                              disabled={!formFormId || !formWebhookUrl.trim() || isSaving}
                            >
                              {isSaving ? 'Saving...' : 'Save changes'}
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            ) : expandedId ? null : (
              <div className="py-6 text-center text-muted-foreground text-xs border border-dashed rounded-lg">
                No connections yet. Add one to start sending form data to n8n.
              </div>
            )}

            {/* New connection form */}
            {expandedId?.startsWith('new-') && (
              <div className="border rounded-lg overflow-hidden">
                <div className="p-3 bg-secondary/20">
                  <Label className="font-medium text-xs">New connection</Label>
                </div>
                <div className="border-t px-3 pb-3 pt-3 space-y-4">
                  {renderConnectionForm()}

                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setExpandedId(null); resetForm(); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!formFormId || !formWebhookUrl.trim() || isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Add connection'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDisconnect}
        onOpenChange={setShowDisconnect}
        title="Disconnect n8n?"
        description="This will remove all n8n webhook connections. Form submissions will no longer be sent to n8n."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        confirmVariant="destructive"
        onConfirm={handleDisconnect}
        onCancel={() => setShowDisconnect(false)}
      />

      <ConfirmDialog
        open={!!connectionToDelete}
        onOpenChange={(open: boolean) => { if (!open) setConnectionToDelete(null); }}
        title="Delete connection?"
        description={`Remove the connection between form "${connectionToDelete?.formId}" and n8n?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setConnectionToDelete(null)}
      />
    </>
  );
}
