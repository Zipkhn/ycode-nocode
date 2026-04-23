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
import { N8N_TEMPLATES } from '@/lib/apps/n8n/templates';

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

type Tab = 'connections' | 'templates';

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
  const [tab, setTab] = useState<Tab>('connections');

  // Instance URL (for templates tab)
  const [instanceUrl, setInstanceUrl] = useState('');
  const [savedInstanceUrl, setSavedInstanceUrl] = useState('');

  // Inline connection form state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFormId, setFormFormId] = useState('');
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formAuthHeaderName, setFormAuthHeaderName] = useState('');
  const [formAuthHeaderValue, setFormAuthHeaderValue] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateFormId, setTemplateFormId] = useState('');
  const [generatedSteps, setGeneratedSteps] = useState<string | null>(null);

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
      if (settingsResult.data?.instance_url) {
        setInstanceUrl(settingsResult.data.instance_url);
        setSavedInstanceUrl(settingsResult.data.instance_url);
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

  const persist = async (updated: N8NConnection[], url?: string) => {
    const body: Record<string, unknown> = { connections: updated };
    if (url !== undefined) body.instance_url = url;
    const response = await fetch('/ycode/api/apps/n8n/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Failed to save');
  };

  const saveInstanceUrl = async () => {
    try {
      await persist(connections, instanceUrl.trim());
      setSavedInstanceUrl(instanceUrl.trim());
      toast.success('Instance URL sauvegardée');
    } catch {
      toast.error('Échec de la sauvegarde');
    }
  };

  // =========================================================================
  // Connection form helpers
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
    if (expandedId === c.id) { setExpandedId(null); resetForm(); return; }
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
      toast.error('Formulaire et URL webhook requis');
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
      toast.success(editId ? 'Connexion mise à jour' : 'Connexion ajoutée');
    } catch {
      toast.error('Échec de la sauvegarde');
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
      toast.error('Échec de la mise à jour');
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
      toast.success('Connexion supprimée');
    } catch {
      toast.error('Échec de la suppression');
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/ycode/api/apps/n8n/settings', { method: 'DELETE' });
      setConnections([]);
      setShowDisconnect(false);
      onConnectionChange(false);
      onDisconnect();
      toast.success('n8n déconnecté');
    } catch {
      toast.error('Échec de la déconnexion');
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
        toast.error(result.error || 'Test échoué');
      } else if (data.ok) {
        toast.success(`Webhook joignable — HTTP ${data.status}${data.message ? `: ${data.message}` : ''}`);
      } else if (data.status === 0) {
        toast.error(data.error === 'timeout' ? 'Timeout (5s)' : 'Webhook injoignable');
      } else {
        toast.error(`HTTP ${data.status} depuis le webhook`);
      }
    } catch {
      toast.error('Requête de test échouée');
    } finally {
      setIsTesting(false);
    }
  };

  // =========================================================================
  // Template generation
  // =========================================================================

  const handleGenerate = async (templateId: string) => {
    const template = N8N_TEMPLATES.find(t => t.id === templateId);
    if (!template || !templateFormId) return;

    // Try to get field hints from a real submission
    let fieldHints: string[] = [];
    try {
      const res = await fetch(`/ycode/api/form-submissions?form_id=${templateFormId}`);
      const result = await res.json();
      const first = result.data?.[0]?.payload;
      if (first && typeof first === 'object') fieldHints = Object.keys(first);
    } catch {
      // fieldHints stay empty → template uses defaults
    }

    const workflow = template.generate({ formId: templateFormId, fieldHints });

    try {
      await navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
    } catch {
      toast.error('Impossible de copier dans le presse-papier');
      return;
    }

    if (savedInstanceUrl) {
      window.open(savedInstanceUrl.replace(/\/$/, '') + '/workflow/new', '_blank');
    }

    setGeneratedSteps(template.name);
    toast.success('Workflow copié dans le presse-papier !');
  };

  // =========================================================================
  // Sub-renders
  // =========================================================================

  const renderConnectionForm = () => (
    <div className="space-y-4">
      <Field>
        <FieldLabel>Nom</FieldLabel>
        <Input
          placeholder="ex : Formulaire contact → CRM" value={formName}
          onChange={(e) => setFormName(e.target.value)} className="text-xs"
        />
      </Field>

      <Field>
        <FieldLabel>Formulaire Ycode</FieldLabel>
        {isLoadingForms ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Spinner /> Chargement…</div>
        ) : forms.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">Aucun formulaire. Soumettez-en un d&apos;abord.</p>
        ) : (
          <Select value={formFormId} onValueChange={setFormFormId}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="Sélectionner un formulaire" /></SelectTrigger>
            <SelectContent>
              {forms.map(f => (
                <SelectItem key={f.form_id} value={f.form_id}>
                  {f.form_id} ({f.submission_count} soumissions)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field>
        <FieldLabel>Webhook URL</FieldLabel>
        <FieldDescription>L&apos;URL du trigger webhook n8n.</FieldDescription>
        <Input
          placeholder="https://votre-instance.n8n.io/webhook/..."
          value={formWebhookUrl} onChange={(e) => setFormWebhookUrl(e.target.value)}
          className="text-xs font-mono"
        />
      </Field>

      <Field>
        <FieldLabel>Header d&apos;auth <span className="text-muted-foreground font-normal">(optionnel)</span></FieldLabel>
        <FieldDescription>Header personnalis&eacute; pour l&apos;authentification webhook n8n.</FieldDescription>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Nom (ex: Authorization)" value={formAuthHeaderName}
            onChange={(e) => setFormAuthHeaderName(e.target.value)} className="text-xs"
          />
          <Input
            type="password" placeholder="Valeur"
            value={formAuthHeaderValue}
            onChange={(e) => setFormAuthHeaderValue(e.target.value)} className="text-xs font-mono"
          />
        </div>
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary" size="sm"
          onClick={handleTest}
          disabled={!formWebhookUrl.trim() || isTesting}
        >
          {isTesting ? 'Test…' : 'Tester la connexion'}
        </Button>
      </div>
    </div>
  );

  const renderConnectionsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FieldLegend>Connexions</FieldLegend>
        <Button
          variant="secondary" size="xs"
          onClick={openNew}
        >
          <Icon name="plus" className="size-3 mr-1" /> Ajouter
        </Button>
      </div>

      {connections.length > 0 ? (
        <div className="space-y-2">
          {connections.map((connection) => (
            <Collapsible
              key={connection.id} open={expandedId === connection.id}
              onOpenChange={(open: boolean) => {
                if (open) openEdit(connection); else { setExpandedId(null); resetForm(); }
              }}
            >
              <div className="border rounded-lg overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div
                    role="button" tabIndex={0}
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
                      checked={connection.active} onClick={(e) => e.stopPropagation()}
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
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConnectionToDelete(connection)}
                      >
                        Supprimer
                      </Button>
                      <Button
                        size="sm" onClick={handleSave}
                        disabled={!formFormId || !formWebhookUrl.trim() || isSaving}
                      >
                        {isSaving ? 'Sauvegarde…' : 'Enregistrer'}
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
          Aucune connexion. Ajoutez-en une pour envoyer les soumissions vers n8n.
        </div>
      )}

      {expandedId?.startsWith('new-') && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-3 bg-secondary/20">
            <Label className="font-medium text-xs">Nouvelle connexion</Label>
          </div>
          <div className="border-t px-3 pb-3 pt-3 space-y-4">
            {renderConnectionForm()}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { setExpandedId(null); resetForm(); }}
              >
                Annuler
              </Button>
              <Button
                size="sm" onClick={handleSave}
                disabled={!formFormId || !formWebhookUrl.trim() || isSaving}
              >
                {isSaving ? 'Sauvegarde…' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      {/* Instance URL */}
      <Field>
        <FieldLabel>URL de ton instance n8n</FieldLabel>
        <FieldDescription>
          Nécessaire pour ouvrir n8n automatiquement après la génération.
        </FieldDescription>
        <div className="flex gap-2">
          <Input
            placeholder="https://votre-instance.n8n.io"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            className="text-xs font-mono flex-1"
          />
          <Button
            size="sm" variant="secondary"
            disabled={!instanceUrl.trim() || instanceUrl === savedInstanceUrl}
            onClick={saveInstanceUrl}
          >
            Sauvegarder
          </Button>
        </div>
      </Field>

      <div className="border-t pt-4">
        <FieldLegend className="mb-3">Templates de workflow</FieldLegend>
        <FieldDescription className="mb-4">
          Génère un workflow n8n pré-câblé. Le JSON est copié dans ton presse-papier —
          importe-le dans n8n via <span className="text-foreground">Workflows → Import from clipboard</span>.
        </FieldDescription>

        <div className="space-y-2">
          {N8N_TEMPLATES.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <div key={template.id} className="border rounded-lg overflow-hidden">
                {/* Card header */}
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => {
                    setSelectedTemplateId(isSelected ? null : template.id);
                    setTemplateFormId('');
                    setGeneratedSteps(null);
                  }}
                >
                  <span className="text-xl shrink-0">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{template.name}</div>
                    <div className="text-[11px] text-muted-foreground">{template.description}</div>
                  </div>
                  <Icon
                    name="chevronRight"
                    className={`size-3 text-muted-foreground transition-transform shrink-0 ${isSelected ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Expanded: form selector + generate */}
                {isSelected && (
                  <div className="border-t px-3 pb-3 pt-3 space-y-3 bg-secondary/10">
                    <Field>
                      <FieldLabel>Formulaire source</FieldLabel>
                      {isLoadingForms ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Spinner /> Chargement…</div>
                      ) : forms.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Aucun formulaire trouvé.</p>
                      ) : (
                        <Select value={templateFormId} onValueChange={setTemplateFormId}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="Sélectionner un formulaire" /></SelectTrigger>
                          <SelectContent>
                            {forms.map(f => (
                              <SelectItem key={f.form_id} value={f.form_id}>
                                {f.form_id} ({f.submission_count} soumissions)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </Field>

                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!templateFormId}
                      onClick={() => handleGenerate(template.id)}
                    >
                      Générer & Ouvrir n8n →
                    </Button>

                    {/* Step-by-step guide shown after generation */}
                    {generatedSteps === template.name && (
                      <div className="rounded-md bg-primary/5 border border-primary/20 p-3 space-y-1.5 text-[11px] text-muted-foreground">
                        <p className="font-medium text-foreground text-xs">Étapes dans n8n :</p>
                        <ol className="space-y-1 pl-1">
                          <li>1. Dans n8n → <span className="text-foreground font-medium">Workflows → Import from clipboard</span></li>
                          <li>2. Le workflow &ldquo;{template.name}&rdquo; apparaît — vérifie les paramètres</li>
                          <li>3. Configure tes credentials ({template.name})</li>
                          <li>4. <span className="text-foreground font-medium">Active le workflow</span> (toggle en haut à droite)</li>
                          <li>5. Copie l&apos;<span className="text-foreground font-medium">URL Production webhook</span> depuis le nœud &ldquo;Ycode Webhook&rdquo;</li>
                          <li>6. Reviens ici → onglet <span className="text-foreground font-medium">Connexions</span> → Ajouter → colle l&apos;URL</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
            Déconnecter
          </Button>
        )}
        <SheetDescription className="sr-only">n8n integration settings</SheetDescription>
      </SheetHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : (
        <div className="mt-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg">
            {([
              { id: 'connections', label: 'Connexions' },
              { id: 'templates',   label: '✨ Templates' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'connections' && renderConnectionsTab()}
          {tab === 'templates'   && renderTemplatesTab()}
        </div>
      )}

      <ConfirmDialog
        open={showDisconnect} onOpenChange={setShowDisconnect}
        title="Déconnecter n8n ?"
        description="Toutes les connexions webhook seront supprimées."
        confirmLabel="Déconnecter" cancelLabel="Annuler"
        confirmVariant="destructive"
        onConfirm={handleDisconnect} onCancel={() => setShowDisconnect(false)}
      />

      <ConfirmDialog
        open={!!connectionToDelete}
        onOpenChange={(open: boolean) => { if (!open) setConnectionToDelete(null); }}
        title="Supprimer la connexion ?"
        description={`Supprimer la connexion entre "${connectionToDelete?.formId}" et n8n ?`}
        confirmLabel="Supprimer" cancelLabel="Annuler"
        confirmVariant="destructive"
        onConfirm={handleDelete} onCancel={() => setConnectionToDelete(null)}
      />
    </>
  );
}
