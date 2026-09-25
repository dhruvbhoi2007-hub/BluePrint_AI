import { env } from '../../config/env.js';

/**
 * Dedicated Product Prototype Generator
 * Powered by Round-Robin Dual AI Engine (Google Gemini and Groq Cloud)
 * configured via environment variables.
 *
 * Alternates between Gemini and Groq per request with automatic failover,
 * generating interactive product prototype data, functional records, KPI telemetry,
 * and runnable React UI code based on user requirements.
 */

const GEMINI_KEY = env.PROTOTYPE_GEMINI_KEY || env.GEMINI_API_KEY || '';
const GROQ_KEY = env.PROTOTYPE_GROQ_KEY || env.GROQ_API_KEY || '';

let roundRobinCounter = 0;

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

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const prototypeGenerator = {
  /**
   * Generates a full working product prototype based on requirement input
   * Alternates between Google Gemini and Groq in a round-robin cycle.
   */
  async generatePrototype({ rawInput = '', sessionTitle = '', context = {}, userLanguage = 'English' }) {
    const turn = roundRobinCounter % 2;
    roundRobinCounter++;

    console.log(`[PrototypeGenerator] Round-Robin Turn: ${turn === 0 ? 'Gemini (Node 1)' : 'Groq (Node 2)'} (Cycle #${roundRobinCounter})`);

    const inputContext = [
      sessionTitle ? `Product / Session Title: ${sessionTitle}` : '',
      rawInput ? `Requirements & Objectives: ${rawInput}` : '',
      context?.industry ? `Industry Sector: ${context.industry}` : '',
      context?.businessGoal ? `Primary Business Goal: ${context.businessGoal}` : '',
      context?.techStack ? `Preferred Tech Stack: ${context.techStack}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are a Principal Software Product Architect & Full-Stack Prototyping Specialist.
Your task is to generate a comprehensive, working, interactive product prototype specification for the given user requirement.

Language Requirement:
Respond in ${userLanguage || 'English'}. All application titles, summaries, column labels, metric labels, records, and action labels must be in ${userLanguage || 'English'}.

Return ONLY a valid JSON object matching this schema:
{
  "appName": "Product / App Name (e.g. AgriDrone Flight & Telemetry Command)",
  "appSummary": "Concise 1-2 sentence description of what this working prototype does.",
  "entityName": "Primary Business Entity (e.g. Drone Sortie, Diagnostic Test, Invoice, Sensor Node)",
  "columnLabels": ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5", "Status"],
  "stats": [
    { "label": "Active Units / Volume", "value": "18", "trend": "+12%", "color": "#38bdf8" },
    { "label": "Key SLA / Metric", "value": "99.8%", "trend": "Nominal", "color": "#34d399" },
    { "label": "Pending Operations", "value": "3", "trend": "-2 today", "color": "#f59e0b" },
    { "label": "Average Latency / Cost", "value": "14ms", "trend": "Optimal", "color": "#a855f7" }
  ],
  "records": [
    {
      "id": "REF-001",
      "name": "Entity Name 1",
      "district": "Attribute 2",
      "acres": "Attribute 3",
      "hp": "Attribute 4",
      "subsidy": "Attribute 5",
      "status": "Approved",
      "urgent": false,
      "date": "2026-09-25",
      "details": "Operational status notes and live telemetry details."
    },
    {
      "id": "REF-002",
      "name": "Entity Name 2",
      "district": "Attribute 2",
      "acres": "Attribute 3",
      "hp": "Attribute 4",
      "subsidy": "Attribute 5",
      "status": "In Review",
      "urgent": true,
      "date": "2026-09-25",
      "details": "Pending supervisor verification or automated scan."
    },
    {
      "id": "REF-003",
      "name": "Entity Name 3",
      "district": "Attribute 2",
      "acres": "Attribute 3",
      "hp": "Attribute 4",
      "subsidy": "Attribute 5",
      "status": "Approved",
      "urgent": false,
      "date": "2026-09-24",
      "details": "Routine execution confirmed with 0 anomalies."
    },
    {
      "id": "REF-004",
      "name": "Entity Name 4",
      "district": "Attribute 2",
      "acres": "Attribute 3",
      "hp": "Attribute 4",
      "subsidy": "Attribute 5",
      "status": "Pending",
      "urgent": false,
      "date": "2026-09-24",
      "details": "Queued in ingress buffer awaiting processing worker."
    }
  ],
  "filters": ["All", "Approved", "In Review", "Pending"],
  "actions": [
    { "id": "act-create", "label": "Create / Register Entity", "type": "primary" },
    { "id": "act-sync", "label": "Synchronize Real-time Stream", "type": "secondary" },
    { "id": "act-export", "label": "Export Audit Ledger (CSV/JSON)", "type": "secondary" }
  ],
  "codeSnippet": "// Complete React 19 functional prototype component code with Tailwind CSS\\nexport default function PrototypeApp() {\\n  // Working component implementation\\n}",
  "cloudDeploy": {
    "recommendedVercel": true,
    "recommendedRender": true,
    "framework": "React 19 + Vite + Tailwind CSS",
    "dockerfile": "FROM node:20-alpine\\nWORKDIR /app\\nCOPY package*.json ./\\nRUN npm install\\nCOPY . .\\nRUN npm run build\\nEXPOSE 3000\\nCMD [\"npm\", \"start\"]"
  }
}`;

    const userPrompt = `Input Requirements:\n${inputContext || 'Enterprise cloud platform with working operational dashboard, real-time records, and actions.'}\n\nGenerate the complete working product prototype specification now.`;

    // Round-Robin execution: try primary according to turn, fallback to the other
    const primaryEngine = turn === 0 ? 'gemini' : 'groq';
    const secondaryEngine = turn === 0 ? 'groq' : 'gemini';

    let finalResult = null;

    try {
      if (primaryEngine === 'gemini') {
        const result = await this.callGemini(systemPrompt, userPrompt);
        finalResult = {
          ...result,
          roundRobinTurn: 1,
          provider: 'Google Gemini (Round-Robin Node #1)',
        };
      } else {
        const result = await this.callGroq(systemPrompt, userPrompt);
        finalResult = {
          ...result,
          roundRobinTurn: 2,
          provider: 'Groq Cloud (Round-Robin Node #2)',
        };
      }
    } catch (primaryErr) {
      console.warn(`[PrototypeGenerator] Primary engine (${primaryEngine}) failed: ${primaryErr.message}. Failing over to ${secondaryEngine}...`);

      try {
        if (secondaryEngine === 'gemini') {
          const result = await this.callGemini(systemPrompt, userPrompt);
          finalResult = {
            ...result,
            roundRobinTurn: 1,
            provider: 'Google Gemini (Failover Fallback)',
          };
        } else {
          const result = await this.callGroq(systemPrompt, userPrompt);
          finalResult = {
            ...result,
            roundRobinTurn: 2,
            provider: 'Groq Cloud (Failover Fallback)',
          };
        }
      } catch (secondaryErr) {
        console.warn(`[PrototypeGenerator] Secondary engine (${secondaryEngine}) also failed: ${secondaryErr.message}. Using adaptive fallback.`);
        finalResult = this.getAdaptiveFallbackPrototype(sessionTitle, rawInput, userLanguage);
      }
    }

    if (finalResult) {
      finalResult.deployedHtml = this.buildDeployedWebpageHtml(finalResult);
    }
    return finalResult;
  },

  /**
   * Calls Google Gemini API using the dedicated key
   */
  async callGemini(systemPrompt, userPrompt) {
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastErr = null;

    for (const model of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const requestBody = {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.substring(0, 150)}`);
        }

        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty Gemini candidates');

        const parsed = parseJsonResponse(rawText);
        if (parsed && parsed.appName && Array.isArray(parsed.records)) {
          console.log(`[PrototypeGenerator] Gemini (${model}) generated prototype: "${parsed.appName}" with ${parsed.records.length} records.`);
          return {
            ...parsed,
            modelUsed: model,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('All Gemini candidate models failed');
  },

  /**
   * Calls Groq API using the dedicated Groq key
   */
  async callGroq(systemPrompt, userPrompt) {
    const candidateModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    let lastErr = null;

    for (const model of candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_KEY}`,
          },
          body: JSON.stringify({
            model: model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.substring(0, 150)}`);
        }

        const data = await res.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (!rawText) throw new Error('Empty Groq message content');

        const parsed = parseJsonResponse(rawText);
        if (parsed && parsed.appName && Array.isArray(parsed.records)) {
          console.log(`[PrototypeGenerator] Groq (${model}) generated prototype: "${parsed.appName}" with ${parsed.records.length} records.`);
          return {
            ...parsed,
            modelUsed: model,
            generatedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('All Groq candidate models failed');
  },

  /**
   * Adaptive fallback if both APIs are rate limited or offline
   */
  getAdaptiveFallbackPrototype(sessionTitle = '', rawInput = '', userLanguage = 'English') {
    const isHindi = userLanguage?.toLowerCase().includes('hi') || userLanguage?.toLowerCase().includes('hindi');
    const isGujarati = userLanguage?.toLowerCase().includes('gu') || userLanguage?.toLowerCase().includes('gujarati');

    const appName = isHindi
      ? `${sessionTitle || 'सिस्टम'} लाइव कार्यशील प्रोटोटाइप`
      : isGujarati
        ? `${sessionTitle || 'સિસ્ટમ'} લાઇવ કાર્યકારી પ્રોટોટાઇપ`
        : `${sessionTitle || 'Enterprise Platform'} Working Prototype Console`;

    return {
      appName,
      appSummary: isHindi
        ? 'लाइव रिकॉर्ड्स, त्वरित खोज, अनुमोदन क्रियाओं और क्लाउड डिप्लॉयमेंट के साथ कार्यशील प्रोटोटाइप।'
        : isGujarati
          ? 'લાઇવ રેકોર્ડ્સ, ઝડપી શોધ, મંજૂરી ક્રિયાઓ અને ક્લાઉડ ડિપ્લોયમેન્ટ સાથે કાર્યકારી પ્રોટોટાઇપ.'
          : 'High-availability operational prototype with dynamic records, status filters, and 1-click cloud sandbox deployment.',
      entityName: isHindi ? 'ऑपरेशनल रिकॉर्ड' : isGujarati ? 'ઓપરેશનલ રેકોર્ડ' : 'System Record',
      columnLabels: isHindi
        ? ['आईडी', 'इकाई विवरण', 'क्षेत्र / डोमेन', 'मापदंड', 'स्थिति', 'क्रिया']
        : isGujarati
          ? ['આઈડી', 'એકમ વિગત', 'વિસ્તાર / ડોમેન', 'માપદંડ', 'સ્થિતિ', 'ક્રિયા']
          : ['Record ID', 'Entity Name / Node', 'Domain / Route', 'Telemetry Specs', 'SLA Band', 'Status'],
      stats: [
        { label: 'Active Throughput', value: '18,420 req/s', trend: '+14.2%', color: '#38bdf8' },
        { label: 'System SLA Uptime', value: '99.98%', trend: 'Nominal', color: '#34d399' },
        { label: 'Pending Approvals', value: '3', trend: '-1 today', color: '#f59e0b' },
        { label: 'Ingress Latency', value: '12ms', trend: 'Sub-50ms', color: '#a855f7' }
      ],
      records: [
        {
          id: 'REC-2026-001',
          name: `${sessionTitle || 'Core'} Primary Cluster Node`,
          district: 'VPC Gateway US-East-1',
          acres: 'TLS 1.3 Active | mTLS Enabled',
          hp: 'Throughput: 8,400 req/s',
          subsidy: 'High-Availability (99.99%)',
          status: 'Approved',
          urgent: false,
          date: '2026-09-25',
          details: 'Cluster health nominal. Automated autoscaling pods online.'
        },
        {
          id: 'REC-2026-002',
          name: `${sessionTitle || 'Core'} Background Signal Worker`,
          district: 'Redis Streams / Queue',
          acres: 'Lag: 0.02ms | Buffers: OK',
          hp: 'Concurrency: 128 workers',
          subsidy: 'Sub-second Ingress',
          status: 'In Review',
          urgent: true,
          date: '2026-09-25',
          details: 'Throughput spike detected; queue auto-draining in progress.'
        },
        {
          id: 'REC-2026-003',
          name: `${sessionTitle || 'Core'} TimescaleDB Hypertable`,
          district: 'Database Replica Pool',
          acres: 'ACID Secured | Read-Replica B',
          hp: 'Write Latency: 4ms',
          subsidy: 'Partitioned Ledger',
          status: 'Approved',
          urgent: false,
          date: '2026-09-24',
          details: 'Point-in-time recovery enabled. All partitions synchronized.'
        },
        {
          id: 'REC-2026-004',
          name: `${sessionTitle || 'Core'} Identity & Auth Sentinel`,
          district: 'Zero-Trust Okta Gateway',
          acres: 'JWT RS256 Tokens',
          hp: 'Zero Breaches Detected',
          subsidy: 'Enterprise RBAC Enforced',
          status: 'Pending',
          urgent: false,
          date: '2026-09-24',
          details: 'Role-based policy enforcement active for Admin/Dev/Viewer roles.'
        }
      ],
      filters: ['All', 'Approved', 'In Review', 'Pending'],
      actions: [
        { id: 'act-create', label: 'Create New Record', type: 'primary' },
        { id: 'act-sync', label: 'Trigger Sync Pipeline', type: 'secondary' },
        { id: 'act-export', label: 'Export Telemetry CSV', type: 'secondary' }
      ],
      codeSnippet: `// Interactive React Prototype Component\nexport default function WorkingPrototype() {\n  return (\n    <div className="p-6 bg-slate-900 text-white rounded-xl">\n      <h2 className="text-xl font-bold">${appName}</h2>\n      <p className="text-slate-400">Live sandbox prototype</p>\n    </div>\n  );\n}`,
      cloudDeploy: {
        recommendedVercel: true,
        recommendedRender: true,
        framework: 'React 19 + Tailwind CSS',
        dockerfile: 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\nEXPOSE 3000\nCMD ["npm", "start"]'
      },
      provider: 'Compile Adaptive UI Engine',
      modelUsed: 'heuristic-adaptive',
      roundRobinTurn: 0,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * Builds a complete, standalone, production-styled single-page web application HTML
   * Includes Tailwind CSS, interactive search, status tabs, CRUD modals, CSV export, and toast notifications.
   */
  buildDeployedWebpageHtml(protoData = {}) {
    const appName = protoData.appName || 'Enterprise Cloud Application';
    const appSummary = protoData.appSummary || 'High-availability operational prototype with dynamic records, status filters, and 1-click cloud sandbox deployment.';
    const entityName = protoData.entityName || 'System Record';
    const columnLabels = Array.isArray(protoData.columnLabels) && protoData.columnLabels.length > 0
      ? protoData.columnLabels
      : ['Record ID', 'Entity Name / Node', 'Domain / Route', 'Telemetry Specs', 'SLA Band', 'Status'];
    const stats = Array.isArray(protoData.stats) && protoData.stats.length > 0
      ? protoData.stats
      : [
          { label: 'Active Units', value: '24', trend: '+12% this week', color: '#38bdf8' },
          { label: 'Operational SLA', value: '99.98%', trend: 'Nominal', color: '#34d399' },
          { label: 'Pending Reviews', value: '3', trend: '-1 today', color: '#f59e0b' },
          { label: 'Avg Latency', value: '14ms', trend: 'Sub-50ms', color: '#a855f7' }
        ];
    const records = Array.isArray(protoData.records) && protoData.records.length > 0
      ? protoData.records
      : [
          { id: 'REC-001', name: 'Primary Cluster Node', district: 'VPC Gateway US-East-1', acres: 'TLS 1.3 Active', hp: '8,400 req/s', subsidy: 'High-Availability (99.99%)', status: 'Approved', urgent: false, date: '2026-09-25', details: 'All systems operating within normal parameters.' }
        ];
    const filters = Array.isArray(protoData.filters) && protoData.filters.length > 0
      ? protoData.filters
      : ['All', 'Approved', 'In Review', 'Pending'];
    const provider = protoData.provider || 'Google Gemini & Groq Cloud Round-Robin';
    const modelUsed = protoData.modelUsed || 'AI Engine';
    const roundRobinTurn = protoData.roundRobinTurn || 1;

    const safeRecordsJson = JSON.stringify(records).replace(/<\/script>/gi, '<\\/script>');
    const safeStatsJson = JSON.stringify(stats).replace(/<\/script>/gi, '<\\/script>');
    const safeFiltersJson = JSON.stringify(filters).replace(/<\/script>/gi, '<\\/script>');
    const safeColumnsJson = JSON.stringify(columnLabels).replace(/<\/script>/gi, '<\\/script>');

    return `<!DOCTYPE html>
<html lang="en" class="h-full bg-slate-950 text-slate-100">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(appName)} | Live Deployed Web App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          }
        }
      }
    }
  </script>
  <style>
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #020617; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
    .glass-panel {
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  </style>
</head>
<body class="min-h-full flex flex-col bg-slate-950 font-sans selection:bg-cyan-500/20 selection:text-cyan-200">

  <!-- Top Global Bar -->
  <header class="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 gap-4">
        <!-- Brand & Title -->
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-fuchsia-600 p-[1px] shadow-lg shadow-cyan-500/10 flex-shrink-0">
            <div class="w-full h-full bg-slate-900 rounded-[11px] flex items-center justify-center text-cyan-400">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <div class="truncate">
            <div class="flex items-center gap-2">
              <h1 class="text-base font-bold text-white tracking-tight truncate">${escapeXml(appName)}</h1>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span> Live Sandbox
              </span>
            </div>
            <p class="text-xs text-slate-400 truncate hidden sm:block">${escapeXml(entityName)} Management & Telemetry Engine</p>
          </div>
        </div>

        <!-- Engine Indicator & Quick Actions -->
        <div class="flex items-center gap-3">
          <div class="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="text-slate-400">Engine:</span>
            <span class="text-slate-200 font-mono font-medium">${escapeXml(provider)}</span>
          </div>

          <button id="btn-top-create" onclick="openCreateModal()" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all hover:scale-[1.02]">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add ${escapeXml(entityName)}</span>
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    
    <!-- Hero / Summary Banner -->
    <div class="relative overflow-hidden rounded-2xl p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800/80 shadow-2xl">
      <div class="absolute -right-16 -top-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="space-y-2 max-w-3xl">
          <div class="inline-flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span>● PROTO-PROD-LIVE</span>
            <span class="text-slate-600">|</span>
            <span>ROUND-ROBIN #${roundRobinTurn}</span>
            <span class="text-slate-600">|</span>
            <span>MODEL: ${escapeXml(modelUsed)}</span>
          </div>
          <h2 class="text-xl sm:text-2xl font-extrabold text-white tracking-tight">${escapeXml(appName)}</h2>
          <p class="text-sm text-slate-300 leading-relaxed">${escapeXml(appSummary)}</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button onclick="syncStream()" id="btn-sync-action" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold transition">
            <svg id="sync-icon" class="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Sync Real-Time Feed</span>
          </button>
          <button onclick="exportCsv()" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold transition">
            <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Download CSV</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Telemetry KPI Cards -->
    <div id="stats-grid" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Populated dynamically via JS -->
    </div>

    <!-- Data Table & Search Section -->
    <div class="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl overflow-hidden backdrop-blur-sm">
      
      <!-- Toolbar: Search + Filter Tabs -->
      <div class="p-4 sm:p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <!-- Tabs -->
        <div id="filter-tabs" class="flex flex-wrap items-center gap-2">
          <!-- Filter buttons rendered dynamically -->
        </div>

        <!-- Search Bar -->
        <div class="relative w-full md:w-80">
          <input 
            type="text" 
            id="search-input" 
            oninput="handleSearch(this.value)"
            placeholder="Search ${escapeXml(entityName)} records..." 
            class="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2 pl-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
          />
          <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <!-- Table View -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-medium uppercase tracking-wider text-[11px]">
            <tr id="table-headers">
              <!-- Rendered via JS -->
            </tr>
          </thead>
          <tbody id="table-body" class="divide-y divide-slate-800/60 font-normal text-slate-300">
            <!-- Rendered via JS -->
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
      <div id="empty-state" class="hidden p-12 text-center">
        <svg class="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm font-semibold text-slate-300">No matching records found</p>
        <p class="text-xs text-slate-500 mt-1">Try resetting your search query or switching filter tabs.</p>
        <button onclick="resetFilters()" class="mt-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-medium transition">
          Clear Filters
        </button>
      </div>

      <!-- Table Footer / Count -->
      <div class="p-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span id="record-count-text">Showing 0 of 0 records</span>
        <span class="font-mono text-[11px] text-slate-500">Live RESTful Sync • WebSocket Ready</span>
      </div>
    </div>
  </main>

  <!-- Create Record Modal Dialog -->
  <div id="create-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
      <div class="p-6 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
          <h3 class="text-base font-bold text-white">Create New ${escapeXml(entityName)}</h3>
        </div>
        <button onclick="closeCreateModal()" class="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
      </div>
      <form onsubmit="handleCreateSubmit(event)" class="p-6 space-y-4 text-xs">
        <div>
          <label class="block text-slate-400 mb-1 font-medium">Record / Identifier Code</label>
          <input id="form-id" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1 font-medium">Entity / Name</label>
          <input id="form-name" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-400 mb-1 font-medium">${escapeXml(columnLabels[2] || 'Domain / Route')}</label>
            <input id="form-district" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-slate-400 mb-1 font-medium">${escapeXml(columnLabels[3] || 'Telemetry Specs')}</label>
            <input id="form-acres" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-400 mb-1 font-medium">${escapeXml(columnLabels[4] || 'Metric / Code')}</label>
            <input id="form-hp" required class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-slate-400 mb-1 font-medium">Operational Status</label>
            <select id="form-status" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500">
              <option value="Approved">Approved</option>
              <option value="In Review">In Review</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1 font-medium">Operational Notes / Telemetry Details</label>
          <textarea id="form-details" rows="2" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 focus:outline-none focus:border-cyan-500" placeholder="Optional notes..."></textarea>
        </div>
        <div class="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button type="button" onclick="closeCreateModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-cyan-600/20">Save & Deploy</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Record Details Inspector Modal -->
  <div id="inspector-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm hidden">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
      <div class="p-6 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
          <h3 class="text-base font-bold text-white" id="inspector-title">Record Inspection</h3>
        </div>
        <button onclick="closeInspector()" class="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
      </div>
      <div class="p-6 space-y-4 text-xs">
        <div id="inspector-details-card" class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"></div>
        <div>
          <label class="block text-slate-400 mb-1 font-mono uppercase text-[10px]">Raw JSON Payload</label>
          <pre id="inspector-json" class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-56"></pre>
        </div>
        <div class="flex justify-end pt-2">
          <button onclick="closeInspector()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Container -->
  <div id="toast-container" class="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- Embedded Client-Side Application Engine -->
  <script>
    let appRecords = ${safeRecordsJson};
    let appStats = ${safeStatsJson};
    let appFilters = ${safeFiltersJson};
    let appColumns = ${safeColumnsJson};
    let currentFilter = 'All';
    let searchQuery = '';

    // Initialize application UI
    document.addEventListener('DOMContentLoaded', () => {
      renderStats();
      renderFilterTabs();
      renderTableHeaders();
      renderTable();
    });

    function renderStats() {
      const grid = document.getElementById('stats-grid');
      if (!grid) return;

      const totalCount = appRecords.length;
      const approvedCount = appRecords.filter(r => (r.status || '').toLowerCase() === 'approved').length;
      const inReviewCount = appRecords.filter(r => (r.status || '').toLowerCase() === 'in review').length;
      const pendingCount = appRecords.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      const dynamicStats = appStats.map((st, i) => {
        if (i === 0) return { ...st, value: String(totalCount) };
        if (i === 2) return { ...st, value: String(inReviewCount + pendingCount) };
        return st;
      });

      grid.innerHTML = dynamicStats.map(st => \`
        <div class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-lg relative overflow-hidden group hover:border-slate-700 transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-slate-400">\${escapeXml(st.label)}</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">\${escapeXml(st.trend || 'Live')}</span>
          </div>
          <div class="mt-3 text-2xl font-black text-white tracking-tight" style="color: \${st.color || '#38bdf8'}">
            \${escapeXml(st.value)}
          </div>
          <div class="absolute bottom-0 left-0 right-0 h-1" style="background: \${st.color || '#38bdf8'}"></div>
        </div>
      \`).join('');
    }

    function renderFilterTabs() {
      const container = document.getElementById('filter-tabs');
      if (!container) return;

      container.innerHTML = appFilters.map(f => {
        const count = f === 'All' 
          ? appRecords.length 
          : appRecords.filter(r => (r.status || '').toLowerCase() === f.toLowerCase()).length;
        const isActive = currentFilter.toLowerCase() === f.toLowerCase();

        return \`
          <button 
            onclick="setFilter('\${f}')" 
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition \${
              isActive 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 border border-slate-800'
            }"
          >
            <span>\${escapeXml(f)}</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono \${isActive ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-800 text-slate-400'}">
              \${count}
            </span>
          </button>
        \`;
      }).join('');
    }

    function renderTableHeaders() {
      const row = document.getElementById('table-headers');
      if (!row) return;

      const cols = appColumns.slice(0, 5);
      row.innerHTML = \`
        <th class="py-3.5 px-4">\${escapeXml(cols[0] || 'ID')}</th>
        <th class="py-3.5 px-4">\${escapeXml(cols[1] || 'Entity Name')}</th>
        <th class="py-3.5 px-4">\${escapeXml(cols[2] || 'Domain / Route')}</th>
        <th class="py-3.5 px-4">\${escapeXml(cols[3] || 'Telemetry Specs')}</th>
        <th class="py-3.5 px-4">\${escapeXml(cols[4] || 'Metric')}</th>
        <th class="py-3.5 px-4 text-center">Status</th>
        <th class="py-3.5 px-4 text-right">Actions</th>
      \`;
    }

    function setFilter(filter) {
      currentFilter = filter;
      renderFilterTabs();
      renderTable();
    }

    function handleSearch(val) {
      searchQuery = (val || '').toLowerCase().trim();
      renderTable();
    }

    function resetFilters() {
      currentFilter = 'All';
      searchQuery = '';
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      renderFilterTabs();
      renderTable();
    }

    function getFilteredRecords() {
      return appRecords.filter(r => {
        const matchesFilter = currentFilter === 'All' || 
          (r.status || '').toLowerCase() === currentFilter.toLowerCase();
        
        if (!matchesFilter) return false;
        if (!searchQuery) return true;

        const combined = [
          r.id, r.name, r.district, r.acres, r.hp, r.subsidy, r.status, r.details
        ].join(' ').toLowerCase();

        return combined.includes(searchQuery);
      });
    }

    function renderTable() {
      const tbody = document.getElementById('table-body');
      const emptyState = document.getElementById('empty-state');
      const countText = document.getElementById('record-count-text');
      if (!tbody) return;

      const filtered = getFilteredRecords();
      if (countText) {
        countText.textContent = \`Showing \${filtered.length} of \${appRecords.length} records\`;
      }

      if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      tbody.innerHTML = filtered.map(r => {
        const st = (r.status || 'Pending').toLowerCase();
        let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700';
        let dotClass = 'bg-slate-400';

        if (st === 'approved') {
          badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
          dotClass = 'bg-emerald-400';
        } else if (st === 'in review') {
          badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
          dotClass = 'bg-amber-400';
        } else if (st === 'pending') {
          badgeClass = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
          dotClass = 'bg-cyan-400';
        }

        return \`
          <tr class="hover:bg-slate-900/80 transition-colors group">
            <td class="py-3 px-4 font-mono font-medium text-cyan-400">\${escapeXml(r.id)}</td>
            <td class="py-3 px-4 font-semibold text-white">
              <div class="flex items-center gap-2">
                <span>\${escapeXml(r.name)}</span>
                \${r.urgent ? '<span class="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30">PRIORITY</span>' : ''}
              </div>
            </td>
            <td class="py-3 px-4 text-slate-300">\${escapeXml(r.district || '-')}</td>
            <td class="py-3 px-4 text-slate-400 font-mono text-[11px]">\${escapeXml(r.acres || '-')}</td>
            <td class="py-3 px-4 text-slate-300">\${escapeXml(r.hp || r.subsidy || '-')}</td>
            <td class="py-3 px-4 text-center">
              <button onclick="toggleRecordStatus('\${r.id}')" title="Click to cycle status" class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition hover:scale-105 \${badgeClass}">
                <span class="w-1.5 h-1.5 rounded-full \${dotClass}"></span>
                <span>\${escapeXml(r.status || 'Pending')}</span>
              </button>
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-2">
                <button onclick="openInspector('\${r.id}')" class="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition" title="Inspect Record">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button onclick="deleteRecord('\${r.id}')" class="p-1 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition" title="Delete Record">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function toggleRecordStatus(id) {
      const rec = appRecords.find(r => r.id === id);
      if (!rec) return;

      const order = ['Approved', 'In Review', 'Pending'];
      const curIdx = order.indexOf(rec.status);
      const nextIdx = (curIdx + 1) % order.length;
      rec.status = order[nextIdx];

      renderStats();
      renderFilterTabs();
      renderTable();
      showToast(\`Record \${id} status updated to "\${rec.status}"\`, 'info');
    }

    function deleteRecord(id) {
      const idx = appRecords.findIndex(r => r.id === id);
      if (idx === -1) return;

      appRecords.splice(idx, 1);
      renderStats();
      renderFilterTabs();
      renderTable();
      showToast(\`Record \${id} deleted from cluster\`, 'warning');
    }

    function openCreateModal() {
      const modal = document.getElementById('create-modal');
      const formId = document.getElementById('form-id');
      if (modal) {
        modal.classList.remove('hidden');
        if (formId) formId.value = 'REC-' + Math.floor(1000 + Math.random() * 9000);
      }
    }

    function closeCreateModal() {
      const modal = document.getElementById('create-modal');
      if (modal) modal.classList.add('hidden');
    }

    function handleCreateSubmit(e) {
      e.preventDefault();
      const newRec = {
        id: document.getElementById('form-id').value,
        name: document.getElementById('form-name').value,
        district: document.getElementById('form-district').value,
        acres: document.getElementById('form-acres').value,
        hp: document.getElementById('form-hp').value,
        subsidy: document.getElementById('form-hp').value,
        status: document.getElementById('form-status').value,
        urgent: false,
        date: new Date().toISOString().split('T')[0],
        details: document.getElementById('form-details').value || 'Operational record added via sandbox portal.'
      };

      appRecords.unshift(newRec);
      renderStats();
      renderFilterTabs();
      renderTable();
      closeCreateModal();
      showToast(\`Entity \${newRec.id} registered and deployed successfully!\`, 'success');
    }

    function openInspector(id) {
      const rec = appRecords.find(r => r.id === id);
      if (!rec) return;

      const modal = document.getElementById('inspector-modal');
      const title = document.getElementById('inspector-title');
      const card = document.getElementById('inspector-details-card');
      const json = document.getElementById('inspector-json');

      if (title) title.textContent = \`Inspection: \${rec.id} (\${rec.name})\`;
      if (card) {
        card.innerHTML = \`
          <div class="grid grid-cols-2 gap-2">
            <div><span class="text-slate-500">Record ID:</span> <span class="font-mono text-cyan-400 font-semibold">\${escapeXml(rec.id)}</span></div>
            <div><span class="text-slate-500">Status:</span> <span class="font-semibold text-emerald-400">\${escapeXml(rec.status)}</span></div>
            <div><span class="text-slate-500">Domain / Route:</span> <span class="text-slate-200">\${escapeXml(rec.district || '-')}</span></div>
            <div><span class="text-slate-500">Telemetry Specs:</span> <span class="text-slate-200 font-mono">\${escapeXml(rec.acres || '-')}</span></div>
            <div class="col-span-2"><span class="text-slate-500">Operational Notes:</span> <span class="text-slate-300">\${escapeXml(rec.details || 'Nominal operational status')}</span></div>
          </div>
        \`;
      }
      if (json) {
        json.textContent = JSON.stringify(rec, null, 2);
      }
      if (modal) modal.classList.remove('hidden');
    }

    function closeInspector() {
      const modal = document.getElementById('inspector-modal');
      if (modal) modal.classList.add('hidden');
    }

    function syncStream() {
      const icon = document.getElementById('sync-icon');
      if (icon) icon.classList.add('animate-spin');

      setTimeout(() => {
        if (icon) icon.classList.remove('animate-spin');
        showToast('Real-time telemetry stream synchronized (4 cluster nodes active)', 'success');
      }, 700);
    }

    function exportCsv() {
      const filtered = getFilteredRecords();
      if (filtered.length === 0) {
        showToast('No records to export', 'warning');
        return;
      }

      const headers = ['ID', 'Name', 'Domain', 'Specs', 'Metric', 'Status', 'Date', 'Notes'];
      const rows = filtered.map(r => [
        r.id,
        \`"\${(r.name || '').replace(/"/g, '""')}"\`,
        \`"\${(r.district || '').replace(/"/g, '""')}"\`,
        \`"\${(r.acres || '').replace(/"/g, '""')}"\`,
        \`"\${(r.hp || r.subsidy || '').replace(/"/g, '""')}"\`,
        r.status || 'Pending',
        r.date || '',
        \`"\${(r.details || '').replace(/"/g, '""')}"\`
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', \`prototype_ledger_\${Date.now()}.csv\`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(\`Exported \${filtered.length} records to CSV successfully\`, 'success');
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = 'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs shadow-2xl transition-all duration-300 opacity-0 translate-y-2';

      let iconSvg = '<svg class="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';
      if (type === 'success') {
        iconSvg = '<svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>';
      } else if (type === 'warning') {
        iconSvg = '<svg class="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>';
      }

      toast.innerHTML = \`
        \${iconSvg}
        <span class="font-medium">\${escapeXml(message)}</span>
      \`;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
      }, 10);

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    function escapeXml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  </script>
</body>
</html>`;
  }
};
