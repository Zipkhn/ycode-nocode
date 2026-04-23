// Works in browser (Web Crypto API) and Node 18+
const uuid = (): string => globalThis.crypto.randomUUID();

// =============================================================================
// N8N Workflow Template Generator
// =============================================================================

export interface N8NTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodeType: string;
  generate: (opts: TemplateOptions) => N8NWorkflow;
}

export interface TemplateOptions {
  formId: string;
  /** Field names available in the form (used in expression hints) */
  fieldHints?: string[];
}

export interface N8NWorkflow {
  name: string;
  nodes: N8NNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
  settings: Record<string, unknown>;
}

interface N8NNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  webhookId?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function webhookNode(formId: string): N8NNode {
  return {
    parameters: {
      httpMethod: 'POST',
      path: `ycode-${formId}`,
      responseMode: 'onReceived',
      responseData: 'firstEntryJson',
    },
    id: uuid(),
    name: 'Ycode Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [240, 300],
    webhookId: uuid(),
  };
}

const BASE_WORKFLOW_SETTINGS = {
  executionOrder: 'v1',
};

// Field access expression in n8n — form data lands in body.data
const field = (name: string) => `{{ $json.body.data.${name} }}`;
const allFields = '{{ JSON.stringify($json.body.data, null, 2) }}';

// =============================================================================
// Templates
// =============================================================================

export const N8N_TEMPLATES: N8NTemplate[] = [
  // ── Slack ────────────────────────────────────────────────────────────────────
  {
    id: 'slack',
    name: 'Slack',
    description: 'Envoie une notification dans un canal Slack à chaque soumission.',
    icon: '💬',
    nodeType: 'n8n-nodes-base.slack',
    generate({ formId }) {
      const webhook = webhookNode(formId);
      const action: N8NNode = {
        parameters: {
          resource: 'message',
          operation: 'post',
          channel: '#general',
          text: `📬 Nouvelle soumission (${formId})\n\n${allFields}`,
          otherOptions: {},
        },
        id: uuid(),
        name: 'Slack',
        type: 'n8n-nodes-base.slack',
        typeVersion: 2.2,
        position: [500, 300],
      };
      return {
        name: `Ycode — ${formId} → Slack`,
        nodes: [webhook, action],
        connections: {
          [webhook.name]: { main: [[{ node: action.name, type: 'main', index: 0 }]] },
        },
        settings: BASE_WORKFLOW_SETTINGS,
      };
    },
  },

  // ── Google Sheets ────────────────────────────────────────────────────────────
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Ajoute une ligne dans un Google Sheet à chaque soumission.',
    icon: '📊',
    nodeType: 'n8n-nodes-base.googleSheets',
    generate({ formId, fieldHints = [] }) {
      const webhook = webhookNode(formId);
      const columns: Record<string, string> = {};
      (fieldHints.length ? fieldHints : ['name', 'email', 'message']).forEach(f => {
        columns[f.charAt(0).toUpperCase() + f.slice(1)] = field(f);
      });
      columns['Submitted At'] = '{{ $json.body.submittedAt }}';

      const action: N8NNode = {
        parameters: {
          resource: 'sheet',
          operation: 'appendOrUpdate',
          documentId: { __rl: true, value: '', mode: 'list' },
          sheetName: { __rl: true, value: 'gid=0', mode: 'list' },
          columns: {
            mappingMode: 'defineBelow',
            value: columns,
          },
          options: {},
        },
        id: uuid(),
        name: 'Google Sheets',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [500, 300],
      };
      return {
        name: `Ycode — ${formId} → Google Sheets`,
        nodes: [webhook, action],
        connections: {
          [webhook.name]: { main: [[{ node: action.name, type: 'main', index: 0 }]] },
        },
        settings: BASE_WORKFLOW_SETTINGS,
      };
    },
  },

  // ── Email ────────────────────────────────────────────────────────────────────
  {
    id: 'email',
    name: 'Email',
    description: 'Envoie un email de notification (Gmail, SMTP, Outlook…).',
    icon: '✉️',
    nodeType: 'n8n-nodes-base.emailSend',
    generate({ formId, fieldHints = [] }) {
      const webhook = webhookNode(formId);
      const bodyLines = (fieldHints.length ? fieldHints : ['name', 'email', 'message'])
        .map(f => `${f.charAt(0).toUpperCase() + f.slice(1)}: ${field(f)}`)
        .join('\n');

      const action: N8NNode = {
        parameters: {
          fromEmail: 'noreply@yoursite.com',
          toEmail: 'vous@yoursite.com',
          subject: `Nouvelle soumission — ${formId}`,
          text: `Nouveau message reçu :\n\n${bodyLines}\n\nReçu le : {{ $json.body.submittedAt }}`,
          options: {},
        },
        id: uuid(),
        name: 'Send Email',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2.1,
        position: [500, 300],
      };
      return {
        name: `Ycode — ${formId} → Email`,
        nodes: [webhook, action],
        connections: {
          [webhook.name]: { main: [[{ node: action.name, type: 'main', index: 0 }]] },
        },
        settings: BASE_WORKFLOW_SETTINGS,
      };
    },
  },

  // ── Notion ───────────────────────────────────────────────────────────────────
  {
    id: 'notion',
    name: 'Notion',
    description: 'Crée une page dans une base de données Notion.',
    icon: '📝',
    nodeType: 'n8n-nodes-base.notion',
    generate({ formId, fieldHints = [] }) {
      const webhook = webhookNode(formId);
      const properties: Record<string, unknown> = {};
      (fieldHints.length ? fieldHints : ['name', 'email', 'message']).forEach(f => {
        properties[f.charAt(0).toUpperCase() + f.slice(1)] = {
          type: 'rich_text',
          value: field(f),
        };
      });
      properties['Date'] = { type: 'date', value: '{{ $json.body.submittedAt }}' };

      const action: N8NNode = {
        parameters: {
          resource: 'databasePage',
          operation: 'create',
          databaseId: { __rl: true, value: '', mode: 'list' },
          title: `Soumission — ${field('name')}`,
          propertiesUi: { propertyValues: Object.entries(properties).map(([k, v]) => ({ key: k, ...(v as object) })) },
          options: {},
        },
        id: uuid(),
        name: 'Notion',
        type: 'n8n-nodes-base.notion',
        typeVersion: 2.2,
        position: [500, 300],
      };
      return {
        name: `Ycode — ${formId} → Notion`,
        nodes: [webhook, action],
        connections: {
          [webhook.name]: { main: [[{ node: action.name, type: 'main', index: 0 }]] },
        },
        settings: BASE_WORKFLOW_SETTINGS,
      };
    },
  },

  // ── HTTP Request (générique) ──────────────────────────────────────────────────
  {
    id: 'http',
    name: 'HTTP Request',
    description: 'Transfère les données vers n\'importe quelle API tierce.',
    icon: '🔗',
    nodeType: 'n8n-nodes-base.httpRequest',
    generate({ formId }) {
      const webhook = webhookNode(formId);
      const action: N8NNode = {
        parameters: {
          method: 'POST',
          url: 'https://your-api.com/endpoint',
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: 'formId', value: '{{ $json.body.formId }}' },
              { name: 'submittedAt', value: '{{ $json.body.submittedAt }}' },
              { name: 'data', value: '{{ $json.body.data }}' },
            ],
          },
          options: {},
        },
        id: uuid(),
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [500, 300],
      };
      return {
        name: `Ycode — ${formId} → HTTP Request`,
        nodes: [webhook, action],
        connections: {
          [webhook.name]: { main: [[{ node: action.name, type: 'main', index: 0 }]] },
        },
        settings: BASE_WORKFLOW_SETTINGS,
      };
    },
  },
];
