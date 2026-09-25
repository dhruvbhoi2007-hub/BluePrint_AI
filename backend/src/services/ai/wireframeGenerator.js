import { env } from '../../config/env.js';

/**
 * Dedicated AI Wireframe & UI Layout Generator
 * Specifically powered by dedicated Google Gemini API key configured via environment variables.
 *
 * Synthesizes high-fidelity UX wireframe concepts, interactive screen hierarchies,
 * component specifications, and realistic mock telemetry/data based on user input.
 */

const DEDICATED_WIREFRAME_KEY = env.GEMINI_WIREFRAME_API_KEY || env.GEMINI_API_KEY || '';

function parseJsonResponse(text) {
  if (typeof text === 'object' && text !== null) return text;
  if (!text || typeof text !== 'string') return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (cleanErr) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch (e) {}
      }
      throw cleanErr;
    }
  }
}

export const wireframeGenerator = {
  /**
   * Generates AI wireframe screens & UI specifications based on requirement input
   */
  async generateWireframes({ rawInput = '', sessionTitle = '', context = {}, userLanguage = 'English' }) {
    const inputContext = [
      sessionTitle ? `Session / Project Title: ${sessionTitle}` : '',
      rawInput ? `User Input & Problem Statement: ${rawInput}` : '',
      context?.industry ? `Industry: ${context.industry}` : '',
      context?.businessGoal ? `Primary Business Goal: ${context.businessGoal}` : '',
      context?.techStack ? `Tech Stack Preference: ${context.techStack}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a Lead Enterprise UX/UI Architect.
Your task is to generate 3 to 4 comprehensive, modern, production-grade wireframe screens and user interfaces specifically tailored to the given user input and business requirements.

Language Requirement:
Respond in ${userLanguage || 'English'}. All screen titles, descriptions, component labels, and mock data must be natural and appropriate for ${userLanguage || 'English'}.

Return ONLY a valid JSON object matching this schema:
{
  "screens": [
    {
      "id": "screen-1",
      "title": "Screen Title (e.g., Live Inventory Control Center)",
      "layoutType": "Dashboard | Data Grid | Workflow Form | Detail View | Analytics Console",
      "description": "Clear UX rationale explaining the screen's purpose and primary user workflow.",
      "headerNav": ["Overview", "Section 1", "Section 2", "Settings"],
      "sidebarItems": ["Dashboard", "Item 1", "Item 2", "Item 3", "Preferences"],
      "metrics": [
        { "label": "Key Metric 1", "value": "1,420", "trend": "+12.4%", "color": "#38bdf8" },
        { "label": "Key Metric 2", "value": "99.8%", "trend": "+0.4%", "color": "#34d399" },
        { "label": "Key Metric 3", "value": "14", "trend": "-2", "color": "#f87171" }
      ],
      "components": [
        { "type": "Hero KPI Grid", "label": "Telemetry & Summary Metric Cards" },
        { "type": "Interactive Data Grid", "label": "Primary Operational Table", "props": "Search, Sort, Multi-column filter, Batch Export" },
        { "type": "Action Toolbar", "label": "Create, Import & Bulk Action Controls" },
        { "type": "Status Drawer", "label": "Item Lifecycle & Event Timeline" }
      ],
      "mockRows": [
        { "col1": "REF-1001", "col2": "Primary Node A", "col3": "Optimal (4,200)", "col4": "Healthy", "status": "active" },
        { "col1": "REF-1002", "col2": "Secondary Node B", "col3": "Warning (140)", "col4": "Rebalance Needed", "status": "warning" },
        { "col1": "REF-1003", "col2": "Edge Gateway", "col3": "Critical (12)", "col4": "Action Required", "status": "danger" }
      ],
      "actions": ["Create New Item", "Export CSV/PDF", "Batch Sync", "Filter Results"]
    }
  ]
}`;

    const userPrompt = `Input Requirements:\n${inputContext || 'Enterprise operations platform with dashboard, tables, and workflows.'}\n\nGenerate the wireframe screens and UI components now.`;

    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash'];
    let lastError = null;

    for (const model of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${DEDICATED_WIREFRAME_KEY}`;

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      };

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`[Gemini Wireframe ${model}] Status ${res.status}: ${errText.substring(0, 180)}`);
          }

          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) {
            throw new Error(`Empty response content from Gemini model ${model}`);
          }

          const parsed = parseJsonResponse(rawText);
          if (parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0) {
            console.log(`[WireframeGenerator] Successfully generated ${parsed.screens.length} screens using Gemini (${model}) with dedicated key.`);
            return {
              screens: parsed.screens,
              generatedAt: new Date().toISOString(),
              modelUsed: model,
              provider: 'Google Gemini (Dedicated Wireframe Key)',
            };
          }
        } catch (err) {
          lastError = err;
          // Wait briefly before retry if rate limited
          if (attempt === 1) {
            await new Promise(r => setTimeout(r, 800));
          }
        }
      }
    }

    console.warn('[WireframeGenerator] Gemini remote call failed, using adaptive fallback:', lastError?.message);
    return this.getAdaptiveFallbackWireframes(sessionTitle, rawInput, userLanguage);
  },

  /**
   * Adaptive fallback if API key quota is exhausted
   */
  getAdaptiveFallbackWireframes(title = '', rawInput = '', userLanguage = 'English') {
    const isHindi = userLanguage?.toLowerCase().includes('hi') || userLanguage?.toLowerCase().includes('hindi');
    const isGujarati = userLanguage?.toLowerCase().includes('gu') || userLanguage?.toLowerCase().includes('gujarati');

    return {
      screens: [
        {
          id: 'screen-1',
          title: isHindi ? 'मुख्य ऑपरेशन्स डैशबोर्ड' : isGujarati ? 'મુખ્ય ઑપરેશન્સ ડેશબોર્ડ' : `${title || 'Enterprise'} Overview Dashboard`,
          layoutType: 'Dashboard',
          description: isHindi
            ? 'सिस्टम मैट्रिक्स, मुख्य अलर्ट्स और लाइव वर्कफ़्लो की केंद्रीय निगरानी।'
            : isGujarati
              ? 'સિસ્ટમ મેટ્રિક્સ, મુખ્ય ચેતવણીઓ અને લાઇવ વર્કફ્લોની કેન્દ્રીય દેખરેખ.'
              : 'Real-time situational awareness cockpit providing live KPI telemetry, throughput alerts, and quick actions.',
          headerNav: ['Overview', 'Analytics', 'Workflows', 'Audit Logs'],
          sidebarItems: ['Dashboard', 'Operations', 'Inventory', 'Reports', 'Settings'],
          metrics: [
            { label: 'Active Throughput', value: '18,420 req/s', trend: '+14.2%', color: '#38bdf8' },
            { label: 'System Health SLA', value: '99.98%', trend: '+0.02%', color: '#34d399' },
            { label: 'Pending Approvals', value: '7', trend: '-3', color: '#f59e0b' },
            { label: 'Critical Exceptions', value: '0', trend: '0', color: '#10b981' }
          ],
          components: [
            { type: 'Metric Ribbon', label: 'Executive KPI Telemetry Bar' },
            { type: 'Time-Series Chart', label: 'Real-time Signal & Ingress Graph' },
            { type: 'Data Table', label: 'Recent Transactions & Lifecycle Events', props: 'Live polling, sortable, status badges' },
            { type: 'Action Group', label: 'Primary Operational Trigger Console' }
          ],
          mockRows: [
            { col1: 'TXN-9041', col2: 'Ingress Worker A', col3: 'Completed (12ms)', col4: 'Verified', status: 'active' },
            { col1: 'TXN-9042', col2: 'AI Analysis Core', col3: 'Processing', col4: 'In Progress', status: 'warning' },
            { col1: 'TXN-9043', col2: 'DB Cluster Replica', col3: 'Committed (4ms)', col4: 'ACID Secured', status: 'active' }
          ],
          actions: ['Create Blueprint', 'Export Report', 'Trigger Sync', 'Filter Stream']
        },
        {
          id: 'screen-2',
          title: isHindi ? 'डेटा लेजर और प्रबंधन तालिका' : isGujarati ? 'ડેટા લેજર અને સંચાલન કોષ્ટક' : 'Entity Management & Data Ledger',
          layoutType: 'Data Grid',
          description: isHindi
            ? 'विस्तृत रिकॉर्ड प्रबंधन, खोज और मल्टी-कॉलम फ़िल्टरिंग।'
            : isGujarati
              ? 'વિગતવાર રેકોર્ડ સંચાલન, શોધ અને મલ્ટી-કૉલમ ફિલ્ટરિંગ.'
              : 'High-density operational grid supporting faceted multi-column filters, bulk status transitions, and audit trails.',
          headerNav: ['All Records', 'Flagged Exceptions', 'Archived', 'Export View'],
          sidebarItems: ['Dashboard', 'Operations', 'Inventory', 'Reports', 'Settings'],
          metrics: [
            { label: 'Total Entities', value: '45,210', trend: '+220 today', color: '#38bdf8' },
            { label: 'Synced Partitions', value: '100%', trend: 'Realtime', color: '#34d399' }
          ],
          components: [
            { type: 'Filter Toolbar', label: 'Faceted Search & Date Range Picker' },
            { type: 'Interactive Data Grid', label: 'Master Entity Records Table' },
            { type: 'Pagination Bar', label: 'Server-side Cursor Pagination' }
          ],
          mockRows: [
            { col1: 'ENT-001', col2: 'Core Microservice', col3: '200 OK', col4: 'Synchronized', status: 'active' },
            { col1: 'ENT-002', col2: 'Authentication Gateway', col3: 'TLS 1.3 Active', col4: 'Healthy', status: 'active' },
            { col1: 'ENT-003', col2: 'Async Event Bus', col3: '0.02ms lag', col4: 'Nominal', status: 'active' }
          ],
          actions: ['Add Record', 'Batch Export', 'Bulk Update', 'Clear Filters']
        },
        {
          id: 'screen-3',
          title: isHindi ? 'कॉन्फ़िगरेशन एवं वर्कफ़्लो फॉर्म' : isGujarati ? 'રૂપરેખાંકન અને વર્કફ્લો ફોર્મ' : 'Workflow Configuration & Execution Console',
          layoutType: 'Workflow Form',
          description: isHindi
            ? 'पैरामीटर सेटअप, नियम सत्यापन और स्वचालित अनुमोदन वर्कफ़्लो।'
            : isGujarati
              ? 'પેરામીટર સેટઅપ, નિયમ માન્યતા અને સ્વચાલિત મંજૂરી વર્કફ્લો.'
              : 'Stepped configuration wizard with real-time schema validation, policy simulation, and supervisor review gates.',
          headerNav: ['General', 'Rules Engine', 'Integrations', 'Security'],
          sidebarItems: ['Dashboard', 'Operations', 'Inventory', 'Reports', 'Settings'],
          metrics: [
            { label: 'Step 2 of 4', value: 'Rule Setup', trend: 'Draft', color: '#818cf8' }
          ],
          components: [
            { type: 'Step Progress Bar', label: 'Multi-stage Configuration Stepper' },
            { type: 'Form Input Group', label: 'Entity Identification & SLA Thresholds' },
            { type: 'Rule Builder', label: 'Condition & Escalation Trigger Matrix' },
            { type: 'Action Footer', label: 'Save Draft & Proceed to Review' }
          ],
          mockRows: [
            { col1: 'Rule #1', col2: 'Latency > 200ms', col3: 'Scale Pods +2', col4: 'Active', status: 'active' },
            { col1: 'Rule #2', col2: 'Auth Failure > 5/min', col3: 'Quarantine IP', col4: 'Enforced', status: 'danger' }
          ],
          actions: ['Save Draft', 'Validate Policy', 'Proceed to Next Step', 'Cancel']
        }
      ],
      generatedAt: new Date().toISOString(),
      modelUsed: 'heuristic-adaptive',
      provider: 'Compile Adaptive UI Engine',
    };
  },
};
