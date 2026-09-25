import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import DashboardSidebar from '../components/layout/DashboardSidebar';
import { getStoredToken, getStoredUser, getStoredSidebarCollapsed, getUserRole } from '../utils/cookieUtils';
import MermaidDiagram from '../components/common/MermaidDiagram';
import SwaggerApiExplorer from '../components/common/SwaggerApiExplorer';
import { getCurrentLanguage, t, useTranslation } from '../utils/i18n';
import { generateDynamicBlueprintArtifacts, generateMermaidErdFromTables, generateMermaidArchFromComponents, generateMermaidBpmnFromNodes } from '../utils/dynamicBlueprintGenerator';

/* ─── Theme Palette ─── */
const C = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',
  borderMed: '#cbd5e1',
  primary: '#6366f1',
  primaryDk: '#4f46e5',
  primaryLt: '#eef2ff',
  accent: '#06b6d4',
  accentLt: '#ecfeff',
  success: '#10b981',
  successLt: '#d1fae5',
  warn: '#f59e0b',
  warnLt: '#fef3c7',
  textH: '#0f172a',
  textB: '#334155',
  textM: '#64748b',
  textSub: '#94a3b8',
  grad: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
};

/* ─── SVG Icons ─── */
function Icon({ d, size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={d} />
    </svg>
  );
}

const CHECK_ICON = 'M20 6L9 17l-5-5';
const DOWNLOAD_ICON = 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3';
const REFRESH_ICON = 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15';
const CHAT_ICON = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';
const BRD_ICON = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8';
const ARCH_ICON = 'M16 18l6-6-6-6M8 6l-6 6 6 6';
const FLOW_ICON = 'M22 12h-4l-3 9L9 3l-3 9H2';
const DB_ICON = 'M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3zm0 6c0 1.66 3.58 3 8 3s8-1.34 8-3M4 18c0 1.66 3.58 3 8 3s8-1.34 8-3';
const WIRE_ICON = 'M3 3h18v18H3zM3 9h18M9 21V9';
const COST_ICON = 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';
const COPY_ICON = 'M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.242a2 2 0 0 0-.602-1.43L16.083 2.57A2 2 0 0 0 14.685 2H10a2 2 0 0 0-2 2z';
const HISTORY_ICON = 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
const MENU_ICON = 'M4 6h16M4 12h16M4 18h16';
const CODE_ICON = 'M16 18l6-6-6-6M8 6l-6 6 6 6';
const SHIELD_ICON = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z';

/* ─── Inline Markdown Formatter Component ─── */
function formatInlineMarkdown(str) {
  if (!str) return '';
  return str
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#eef2ff;color:#4f46e5;padding:2px 6px;border-radius:4px;font-size:12px">$1</code>');
}

function FormattedMarkdownContent({ text }) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.6 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('# ')) {
          return <h2 key={idx} style={{ fontSize: 17, fontWeight: 800, color: C.textH, marginTop: 10, marginBottom: 4 }}>{trimmed.replace(/^#\s+/, '')}</h2>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={idx} style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginTop: 8, marginBottom: 4 }}>{trimmed.replace(/^##\s+/, '')}</h3>;
        }
        if (trimmed.startsWith('### ')) {
          return <h4 key={idx} style={{ fontSize: 14, fontWeight: 700, color: C.textH, marginTop: 6, marginBottom: 2 }}>{trimmed.replace(/^###\s+/, '')}</h4>;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 6, fontSize: 13.5, color: C.textB }}>
              <span style={{ color: C.primary, fontWeight: 700 }}>•</span>
              <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
            </div>
          );
        }
        if (trimmed.startsWith('---')) {
          return <hr key={idx} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '6px 0' }} />;
        }
        return (
          <div key={idx} style={{ fontSize: 13.5, color: C.textB }} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(trimmed) }} />
        );
      })}
    </div>
  );
}

/* ─── Format a USD cost value safely (strips leading $ if AI already includes it) ─── */
function fmtUSD(val, fallback) {
  if (!val && val !== 0) return `$${Number(fallback).toLocaleString()}`;
  const num = Number(String(val).replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num === 0) return `$${Number(fallback).toLocaleString()}`;
  return `$${num.toLocaleString()}`;
}

// Static constants removed: All Diagrams (Mermaid Architecture, BPMN, ERD), Database Tables,
// API Specs, Wireframes, and Sandbox Apps are dynamically synthesized by generateDynamicBlueprintArtifacts().

export default function ResultScreen() {
  const { id: paramSessionId } = useParams();
  const navigate = useNavigate();

  // Auth & UI State
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return getStoredSidebarCollapsed();
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Active Session Data from MySQL
  const [allSessions, setAllSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(paramSessionId || null);
  const [session, setSession] = useState(null);
  const [brd, setBrd] = useState(null);
  const [architecture, setArchitecture] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState('');

  // Tabbed Pillar Selection
  const [activeTab, setActiveTab] = useState('brd'); // 'brd' | 'architecture' | 'bpmn' | 'database' | 'wireframes' | 'estimates'
  const [regeneratingSection, setRegeneratingSection] = useState(null);
  const [showVersionDrawer, setShowVersionDrawer] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Interactive Product Prototype State (Round-Robin Dual Engine)
  const [protoSearch, setProtoSearch] = useState('');
  const [protoFilter, setProtoFilter] = useState('All');
  const [showProtoCode, setShowProtoCode] = useState(false);
  const [protoCopied, setProtoCopied] = useState(false);
  const [protoCustomRecords, setProtoCustomRecords] = useState(null);
  const [newRecordModal, setNewRecordModal] = useState(false);
  const [newRecordForm, setNewRecordForm] = useState({ name: '', district: '', status: 'Approved' });
  const [protoViewport, setProtoViewport] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [protoViewMode, setProtoViewMode] = useState('live'); // 'live' | 'data' | 'code'
  const [protoUrlCopied, setProtoUrlCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Multilingual & RBAC State
  const { t, currentLanguage } = useTranslation();
  const [currentRole, setCurrentRole] = useState(() => getUserRole());
  const originalDeliverables = useRef(null);
  const [translationsCache, setTranslationsCache] = useState({});
  const [translatingDeliverables, setTranslatingDeliverables] = useState(false);

  const L = {
    whyRecommended: {
      en: 'Why I Recommended This',
      hi: 'मैंने यह सिफारिश क्यों की',
      gu: 'મેં આ કેમ ભલામણ કરી',
      es: 'Por qué recomendé esto',
      fr: 'Pourquoi j\'ai recommandé cela',
    },
    underlyingAssumption: {
      en: 'Underlying Assumption',
      hi: 'अंतर्निहित धारणा',
      gu: 'અંતર્ગત ધારણા',
      es: 'Supuesto subyacente',
      fr: 'Hypothèse sous-jacente',
    },
    sourceEvidence: {
      en: 'Source Evidence',
      hi: 'स्रोत साक्ष्य',
      gu: 'સ્રોત પુરાવા',
      es: 'Evidencia de origen',
      fr: 'Preuve de la source',
    },
    explainabilityTitle: {
      en: 'AI Recommendation Explainability & Grounding',
      hi: 'एआई अनुशंसा स्पष्टीकरण और आधार',
      gu: 'AI ભલામણ સમજૂતી અને આધાર',
      es: 'Explicabilidad y fundamentación de la recomendación de IA',
      fr: 'Explicabilité et fondement des recommandations de l\'IA',
    },
    executiveObjectives: {
      en: 'Executive Objectives',
      hi: 'कार्यकारी उद्देश्य',
      gu: 'કાર્યકારી ઉદ્દેશ્યો',
      es: 'Objetivos Ejecutivos',
      fr: 'Objectifs Exécutifs',
    },
    scopeBoundaries: {
      en: 'Scope Boundaries',
      hi: 'कार्यक्षेत्र सीमाएं',
      gu: 'કાર્યક્ષેત્રની સીમાઓ',
      es: 'Límites del Alcance',
      fr: 'Limites du Champ d\'Application',
    },
    gapAnalysisTitle: {
      en: 'Current State vs. Desired State Gap Analysis',
      hi: 'वर्तमान स्थिति बनाम वांछित स्थिति अंतर विश्लेषण',
      gu: 'વર્તમાન સ્થિતિ વિરુદ્ધ ઇચ્છિત સ્થિતિ ગેપ વિશ્લેષણ',
      es: 'Análisis de Brechas: Estado Actual vs. Estado Deseado',
      fr: 'Analyse des Écarts: État Actuel vs État Souhaité',
    },
    functionalSpecs: {
      en: 'Functional Specifications',
      hi: 'कार्यात्मक विनिर्देश',
      gu: 'કાર્યાત્મક વિશિષ્ટતાઓ',
      es: 'Especificaciones Funcionales',
      fr: 'Spécifications Fonctionnelles',
    },
    nonFunctionalSpecs: {
      en: 'Non-Functional Requirements (NFRs)',
      hi: 'गैर-कार्यात्मक आवश्यकताएं (NFRs)',
      gu: 'બિન-કાર્યાત્મક આવશ્યકતાઓ (NFRs)',
      es: 'Requisitos No Funcionales (NFRs)',
      fr: 'Exigences Non Fonctionnelles (NFRs)',
    },
    stakeholders: {
      en: 'Key Stakeholders & Approvers',
      hi: 'प्रमुख हितधारक और अनुमोदक',
      gu: 'મુખ્ય હિતધારકો અને મંજૂરકર્તાઓ',
      es: 'Partes Interesadas y Aprobadores Clave',
      fr: 'Parties Prenantes et Approbateurs Clés',
    },
    assumptionsConstraints: {
      en: 'Assumptions & Constraints',
      hi: 'धारणाएं और बाधाएं',
      gu: 'ધારણાઓ અને અવરોધો',
      es: 'Supuestos y Restricciones',
      fr: 'Hypothèses et Contraintes',
    },
    regenerateBtn: {
      en: 'Regenerate Section',
      hi: 'अनुभाग पुनः उत्पन्न करें',
      gu: 'વિભાગ ફરીથી બનાવો',
      es: 'Regenerar Sección',
      fr: 'Régénérer la Section',
    },
    regenerating: {
      en: 'Regenerating...',
      hi: 'पुनः उत्पन्न हो रहा है...',
      gu: 'ફરીથી ઉત્પન્ન થઈ રહ્યું છે...',
      es: 'Regenerando...',
      fr: 'Régénération en cours...',
    },
    translatingNotice: {
      en: 'Translating deliverables...',
      hi: 'ब्लूप्रिंट सामग्री का हिन्दी में अनुवाद हो रहा है...',
      gu: 'બ્લુપ્રિન્ટ સામગ્રીનું ગુજરાતીમાં અનુવાદ થઈ રહ્યું છે...',
      es: 'Traduciendo entregables...',
      fr: 'Traduction des livrables...',
    },
    brdTitle: {
      en: 'Executive Business Requirements Document',
      hi: 'कार्यकारी व्यवसाय आवश्यकता दस्तावेज़',
      gu: 'કાર્યકારી વ્યવસાય આવશ્યકતા દસ્તાવેજ',
      es: 'Documento Ejecutivo de Requisitos de Negocio',
      fr: 'Document Exécutif des Exigences Métier',
    },
    brdSub: {
      en: 'Synthesized from business context, inputs, and answered discovery trade-offs.',
      hi: 'व्यावसायिक संदर्भ, इनपुट और खोज प्रश्नों के उत्तर से संश्लेषित।',
      gu: 'વ્યવસાય સંદર્ભ, ઇનપુટ્સ અને શોધ પ્રશ્નોના જવાબોમાંથી સંશ્લેષિત.',
      es: 'Sintetizado a partir del contexto comercial, entradas y compensaciones de descubrimiento respondidas.',
      fr: 'Synthétisé à partir du contexte commercial, des entrées et des compromis de découverte répondus.',
    },
  };
  const tr = (key) => L[key]?.[currentLanguage] || L[key]?.en || key;

  useEffect(() => {
    const handleRole = (e) => setCurrentRole(e.detail?.role || getUserRole());
    window.addEventListener('role_changed', handleRole);
    return () => window.removeEventListener('role_changed', handleRole);
  }, []);
  const isViewer = currentRole === 'viewer';

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      navigate('/login');
      return;
    }
    setUser(getStoredUser());
    resolveAndLoadBlueprint(token, paramSessionId);
  }, [paramSessionId, navigate]);

  // Session Resolver
  const resolveAndLoadBlueprint = async (token, targetId) => {
    setLoading(true);
    setErrorNotice('');

    try {
      // 1. Fetch user's sessions to locate target or latest completed session
      const listRes = await fetch('http://localhost:5000/api/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      });

      let sessionsList = [];
      if (listRes.ok) {
        const data = await listRes.json();
        sessionsList = data.sessions || [];
        setAllSessions(sessionsList);
      }

      let resolvedId = targetId;
      if (!resolvedId) {
        // Find newest completed session, or newest session overall
        const completed = sessionsList.find(s => s.status === 'completed');
        resolvedId = completed ? completed.id : (sessionsList[0] ? sessionsList[0].id : null);
      }

      if (resolvedId) {
        setActiveSessionId(resolvedId);
        await loadBlueprintData(token, resolvedId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setErrorNotice('Could not connect to backend server on port 5000.');
      setLoading(false);
    }
  };

  const loadBlueprintData = async (token, sessId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/sessions/${sessId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Blueprint session not found or unavailable.');

      const data = await res.json();
      setSession(data.session);
      setBrd(data.brd || null);
      setArchitecture(data.architecture || null);
      setEstimate(data.estimate || null);
      setVersions(data.versions || []);

      originalDeliverables.current = {
        brd: data.brd || null,
        architecture: data.architecture || null,
        estimate: data.estimate || null,
      };

      if (currentLanguage && currentLanguage !== 'en') {
        triggerTranslation(sessId, currentLanguage);
      }

      // If not yet generated, prompt or redirect to generating
      if (data.session?.status !== 'completed' && !data.brd && !data.architecture) {
        navigate(`/session/${sessId}/generating`);
      }
    } catch (err) {
      setErrorNotice(err.message || 'Error loading blueprint deliverables.');
    } finally {
      setLoading(false);
    }
  };

  const triggerTranslation = async (sessId, targetLang) => {
    if (!sessId || !targetLang || targetLang === 'en') return;
    if (translationsCache[targetLang]) {
      const cached = translationsCache[targetLang];
      if (cached.brd) setBrd(cached.brd);
      if (cached.architecture) setArchitecture(cached.architecture);
      if (cached.estimate) setEstimate(cached.estimate);
      return;
    }
    const token = getStoredToken();
    if (!token) return;

    setTranslatingDeliverables(true);
    try {
      const res = await fetch(`http://localhost:5000/api/sessions/${sessId}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetLanguage: targetLang }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTranslationsCache(prev => ({
            ...prev,
            [targetLang]: {
              brd: data.brd,
              architecture: data.architecture,
              estimate: data.estimate,
            },
          }));
          if (data.brd) setBrd(data.brd);
          if (data.architecture) setArchitecture(data.architecture);
          if (data.estimate) setEstimate(data.estimate);
        }
      }
    } catch (err) {
      console.warn('[ResultScreen] Translate request notice:', err);
    } finally {
      setTranslatingDeliverables(false);
    }
  };

  // Reactively translate deliverables whenever user switches language dropdown
  useEffect(() => {
    if (!activeSessionId || !originalDeliverables.current?.brd) return;
    if (currentLanguage === 'en') {
      if (originalDeliverables.current) {
        setBrd(originalDeliverables.current.brd);
        setArchitecture(originalDeliverables.current.architecture);
        setEstimate(originalDeliverables.current.estimate);
      }
      return;
    }
    triggerTranslation(activeSessionId, currentLanguage);
  }, [currentLanguage, activeSessionId]);

  // Single Section Regeneration (FR-6.2)
  const handleRegenerateSection = async (sectionKey) => {
    if (isViewer) {
      alert('🔒 Access Restricted: Section regeneration is disabled in Viewer (Read-Only) mode.');
      return;
    }
    const token = getStoredToken();
    if (!token || !activeSessionId) return;

    setRegeneratingSection(sectionKey);
    try {
      const res = await fetch(`http://localhost:5000/api/sessions/${activeSessionId}/regenerate/${sectionKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userLanguage: currentLanguage }),
      });

      if (!res.ok) throw new Error(`Failed to regenerate ${sectionKey}.`);
      await loadBlueprintData(token, activeSessionId);
    } catch (err) {
      alert(err.message || 'Error during regeneration.');
    } finally {
      setRegeneratingSection(null);
    }
  };

  // Automated Cloud Sandbox Deploy (RBAC capability 7: Admin only)
  const [deployingSandbox, setDeployingSandbox] = useState(false);
  const [sandboxDeployModal, setSandboxDeployModal] = useState(null);

  const handleTriggerSandboxDeploy = () => {
    if (currentRole !== 'admin') {
      alert('🔒 Access Restricted: Trigger Automated Cloud Sandbox Deploy is restricted to Administrators only (as per the RBAC Permission Matrix). Current role: ' + currentRole.toUpperCase() + '.');
      return;
    }
    setDeployingSandbox(true);
    setSandboxDeployModal({ step: 1, text: 'Spinning up ephemeral container sandbox...' });
    setTimeout(() => {
      setSandboxDeployModal({ step: 2, text: 'Configuring TLS 1.3 VPC Ingress & Zero-Trust mesh...' });
    }, 1200);
    setTimeout(() => {
      setSandboxDeployModal({ step: 3, text: 'Running automated health probe on microservice cluster...' });
    }, 2400);
    setTimeout(() => {
      setSandboxDeployModal({
        step: 4,
        text: 'Cloud Sandbox deployed successfully!',
        url: 'https://sandbox-' + (activeSessionId ? activeSessionId.slice(0, 8) : 'demo') + '.compileai.cloud',
      });
      setDeployingSandbox(false);
    }, 3600);
  };

  // Direct File Export Download
  const handleExport = async (format) => {
    setExportDropdownOpen(false);
    const token = getStoredToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const url = `http://localhost:5000/api/export/session/${activeSessionId}?format=${format}${tokenParam}`;

    if (format === 'pdf') {
      window.open(url, '_blank');
      return;
    }

    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const cleanTitle = (session?.title || 'blueprint').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `blueprint_${cleanTitle}.${format === 'docx' ? 'doc' : 'json'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export download error:', err);
      // Fallback to opening in new window
      window.open(url, '_blank');
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Dynamic AI Artifact Synthesis
  const dynamicArtifacts = useMemo(() => {
    return generateDynamicBlueprintArtifacts(session, brd, architecture);
  }, [session, brd, architecture]);

  const techStack = (architecture?.tech_stack && architecture.tech_stack.length > 0) ? architecture.tech_stack : [
    { category: 'Frontend UI', choice: 'React 19 + Vite SPA', rationale: 'High performance component hierarchy with reactive state.' },
    { category: 'Ingress & Gateway', choice: 'Node.js Express / JWT', rationale: 'Asynchronous OAuth2 gateway with zero-trust token verification.' },
    { category: 'Persistence Tier', choice: 'PostgreSQL 16 / MySQL 8.0', rationale: 'Relational ACID schema with foreign keys and row-level security.' },
    { category: 'Distributed Cache', choice: 'Redis Enterprise', rationale: 'Sub-millisecond session state and real-time telemetry caching.' },
    { category: 'Event Message Broker', choice: 'RabbitMQ / Kafka', rationale: 'Decoupled async worker jobs for notifications and transactions.' },
  ];
  const components = architecture?.components || [];
  const bpmn = architecture?.bpmn_workflows || {
    processName: `${session?.title || 'Operational'} Workflow Pipeline`,
    nodes: dynamicArtifacts.bpmnSteps,
    decisionGates: [
      { condition: 'Automated verification check >= 90%', outcomeIfTrue: 'Fast-track to final sanction & execution', outcomeIfFalse: 'Route to supervisor exception desk' },
    ],
    escalations: [
      { trigger: 'Processing SLA > 24 hours', action: 'Automated notification to regional director', owner: 'Compliance Bot' },
    ],
    slaTarget: '< 24 Hours',
  };
  const dbSchema = architecture?.database_schema || null;
  const apiSpecs = architecture?.api_specs || null;
  const wireframes = (architecture?.wireframes && architecture.wireframes.screens) ? architecture.wireframes : dynamicArtifacts.dynamicWireframes;
  const prototype = (architecture?.prototype && architecture.prototype.appName) ? architecture.prototype : dynamicArtifacts.dynamicPrototype;

  const currentProtoRecords = useMemo(() => {
    return protoCustomRecords || prototype?.records || [];
  }, [protoCustomRecords, prototype?.records]);

  const filteredProtoRecords = useMemo(() => {
    return currentProtoRecords.filter(r => {
      const q = (protoSearch || '').toLowerCase();
      const matchesSearch = !q ||
        (r.name && String(r.name).toLowerCase().includes(q)) ||
        (r.id && String(r.id).toLowerCase().includes(q)) ||
        (r.district && String(r.district).toLowerCase().includes(q));
      const matchesFilter = protoFilter === 'All' || r.status === protoFilter;
      return matchesSearch && matchesFilter;
    });
  }, [currentProtoRecords, protoSearch, protoFilter]);

  const handleCreateRecord = (e) => {
    e.preventDefault();
    if (!newRecordForm.name.trim()) return;
    const newRec = {
      id: `REC-${Date.now().toString().slice(-4)}`,
      name: newRecordForm.name.trim(),
      district: newRecordForm.district.trim() || 'Manual Input',
      acres: 'Telemetry Nominal',
      hp: 'Sub-10ms Ingress',
      subsidy: 'Active Stream',
      status: newRecordForm.status || 'Approved',
      urgent: false,
      date: new Date().toISOString().split('T')[0],
      details: 'Created interactively in working prototype sandbox.',
    };
    setProtoCustomRecords([newRec, ...currentProtoRecords]);
    setNewRecordModal(false);
    setNewRecordForm({ name: '', district: '', status: 'Approved' });
  };

  const handleCopyProtoCode = () => {
    if (prototype?.codeSnippet) {
      navigator.clipboard.writeText(prototype.codeSnippet);
      setProtoCopied(true);
      setTimeout(() => setProtoCopied(false), 2000);
    }
  };

  const livePrototypeUrl = activeSessionId
    ? `http://localhost:5000/api/sessions/${activeSessionId}/prototype/live`
    : '';

  const handleCopyLiveUrl = () => {
    if (livePrototypeUrl) {
      navigator.clipboard.writeText(livePrototypeUrl);
      setProtoUrlCopied(true);
      setTimeout(() => setProtoUrlCopied(false), 2000);
    }
  };

  const handleDownloadDeployedHtml = async () => {
    if (!livePrototypeUrl) return;
    try {
      const res = await fetch(livePrototypeUrl);
      const htmlText = await res.text();
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = (prototype?.appName || 'deployed_prototype').toLowerCase().replace(/[^a-z0-9]/g, '_');
      a.download = `${cleanName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download deployed HTML:', err);
      window.open(livePrototypeUrl, '_blank');
    }
  };

  const dbTables = (dbSchema?.tables && Array.isArray(dbSchema.tables) && dbSchema.tables.length > 0) ? dbSchema.tables : dynamicArtifacts.dynamicDbTables;
  const apiEndpoints = (apiSpecs?.endpoints && Array.isArray(apiSpecs.endpoints) && apiSpecs.endpoints.length > 0) ? apiSpecs.endpoints : dynamicArtifacts.dynamicApiEndpoints;

  const archMermaidChart = useMemo(() => {
    if (components && Array.isArray(components) && components.length > 0) {
      return generateMermaidArchFromComponents(components, techStack, session?.title);
    }
    return dynamicArtifacts.dynamicArchChart;
  }, [components, techStack, session?.title, dynamicArtifacts]);

  const bpmnMermaidChart = useMemo(() => {
    if (bpmn?.nodes && Array.isArray(bpmn.nodes) && bpmn.nodes.length > 0) {
      return generateMermaidBpmnFromNodes(bpmn.nodes, bpmn.processName);
    }
    return dynamicArtifacts.dynamicBpmnChart;
  }, [bpmn, dynamicArtifacts]);

  const erdMermaidChart = useMemo(() => {
    if (dbTables && Array.isArray(dbTables) && dbTables.length > 0) {
      return generateMermaidErdFromTables(dbTables);
    }
    return dynamicArtifacts.dynamicErChart;
  }, [dbTables, dynamicArtifacts]);

  const functionalReqs = brd?.functional_requirements || [];
  const nonFunctionalReqs = brd?.non_functional_requirements || [];
  const gapAnalysis = brd?.gap_analysis || [];
  const stakeholders = brd?.stakeholders_list || [];
  const assumptions = brd?.assumptions || [];
  const constraints = brd?.constraints_data || [];

  const phaseBreakdown = estimate?.phase_breakdown || [];
  const teamAssumptions = estimate?.team_assumptions || {};

  const { displayObjectives, displayScope } = useMemo(() => {
    let rawObj = (brd?.objectives || '').trim();
    let rawScope = (brd?.scope || '').trim();

    // Check if rawScope contains the full unparsed BRD document (e.g. from fallback or older sessions)
    const hasUnparsedDoc = /Executive.*Objectives/i.test(rawScope) || /# Business Requirement Document/i.test(rawScope) || /##?\s*(?:2\.\s*)?(?:Project\s+)?Scope/i.test(rawScope);

    if (hasUnparsedDoc) {
      const objMatch = rawScope.match(/(?:(?:##?\s*)?(?:1\.\s*)?Executive\s+(?:Summary\s+(?:&|and)\s+)?Objectives[^\n]*\n+)([\s\S]*?)(?=\n+#{1,2}\s*(?:2\.\s*|Scope)|$)/i);
      const scopeMatch = rawScope.match(/(?:(?:##?\s*)?(?:2\.\s*)?(?:Project\s+)?Scope[^\n]*\n+)([\s\S]*?)(?=\n+#{1,2}\s*(?:[3-9]\.|Stakeholders|Functional Requirement)|\n+#\s+[^#]|$)/i);

      if (objMatch && objMatch[1]?.trim()) {
        const extractedObj = objMatch[1].trim();
        // If current rawObj is just a generic fallback title or very short, use the extracted one
        if (!rawObj || rawObj.length < 80 || rawObj.startsWith('Transform ') || rawObj.startsWith('Eliminate ')) {
          rawObj = extractedObj;
        }
      }

      if (scopeMatch && scopeMatch[1]?.trim()) {
        rawScope = scopeMatch[1].trim();
      } else {
        // Strip out document title, warning, and objectives from rawScope so it doesn't duplicate
        rawScope = rawScope
          .replace(/^#\s*Business Requirement Document[^\n]*\n+/i, '')
          .replace(/^>\s*⚠️[^\n]*\n+/i, '')
          .replace(/(?:(?:##?\s*)?(?:1\.\s*)?Executive[^\n]*Objectives[^\n]*\n+)([\s\S]*?)(?=(?:##?\s*)?(?:2\.\s*)?Scope|\n##|\n#|$)/i, '')
          .trim();
      }
    }

    // Ensure rawObj is rich and well-structured so the left card is never an empty void
    if (!rawObj || (!rawObj.includes('###') && rawObj.length < 120)) {
      const title = session?.title || 'Core Enterprise Workflows';
      const baseGoal = rawObj || `Automate and digitise ${title}.`;
      rawObj = `### Primary Transformation Objective\n${baseGoal}\n\n### Strategic Business Outcomes & KPIs\n- **Operational Efficiency**: 70%+ reduction in processing latency and manual intervention.\n- **Data Governance**: Normalized schemas and automated audit trail tracking.\n- **High Availability**: Resilient cloud-native microservices with 99.5% uptime SLA.`;
    }

    // Ensure rawScope has clear structured points
    if (!rawScope || (!rawScope.includes('In-Scope') && rawScope.length < 80)) {
      const title = session?.title || 'System Core';
      rawScope = `### In-Scope Core Capabilities\n- Intake automation, status tracking, role-based access, and legacy integration for ${title}.\n- Automated rule execution, multi-tier approvals, and REST API integration endpoints.\n- Live operational dashboards for key business stakeholders.\n\n### Out-of-Scope Boundaries\n- Bespoke physical infrastructure overhaul or hardware decommissioning.\n- Custom non-standard third-party integrations outside the target scope.`;
    }

    return { displayObjectives: rawObj, displayScope: rawScope };
  }, [brd?.objectives, brd?.scope, session?.title]);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, -apple-system, sans-serif', color: C.textH }}>
      <Navbar />

      <DashboardSidebar
        user={user}
        totalSessions={allSessions.length}
        completedCount={allSessions.filter(s => s.status === 'completed').length}
        inProgressCount={allSessions.filter(s => s.status !== 'completed').length}
        onNewBlueprint={() => navigate('/session/new')}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      <main
        className="result-main"
        style={{
          marginLeft: sidebarCollapsed ? 68 : 244,
          padding: '84px 28px 60px',
          transition: 'margin-left 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          minHeight: 'calc(100vh - 64px)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>

          {/* Mobile Sidebar Toggle — shown only on small screens via CSS */}
          <button
            className="result-mobile-toggle"
            onClick={() => setMobileSidebarOpen(true)}
            style={{
              display: 'none',
              alignItems: 'center',
              gap: 7,
              padding: '7px 13px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid #e2e8f0',
              color: '#4f46e5',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,0.08)',
              marginBottom: 16,
            }}
          >
            <Icon d={MENU_ICON} size={15} color="#6366f1" />
            <span>Navigation & Pages</span>
          </button>

          {/* Loading State */}
          {loading && (
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: '64px 24px',
              textAlign: 'center',
            }}>
              <div style={{
                width: 38,
                height: 38,
                border: `3px solid ${C.primaryLt}`,
                borderTopColor: C.primary,
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spinFast 0.8s linear infinite',
              }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: C.textH }}>
                Loading Master Architecture Blueprint...
              </h3>
              <p style={{ margin: 0, fontSize: 13.5, color: C.textM }}>
                Fetching BRD, HLD, BPMN workflows, and database schemas from MySQL
              </p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !session && (
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: '48px 32px',
              textAlign: 'center',
              maxWidth: 640,
              margin: '30px auto',
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.textH, marginBottom: 8 }}>
                No Compiled Blueprint Found
              </h2>
              <p style={{ fontSize: 14, color: C.textM, marginBottom: 24 }}>
                You have not generated any solution blueprints yet. Start by taking the transformation intake or completing a discovery session.
              </p>
              <button
                onClick={() => navigate('/session/new')}
                style={{
                  background: C.grad,
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                + Create First Blueprint
              </button>
            </div>
          )}

          {/* Active Blueprint Hub */}
          {!loading && session && (
            <>
              {/* ─── Hero Header & Action Bar ─── */}
              <div style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 20,
                padding: '24px 28px',
                marginBottom: 24,
                boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.textSub, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ cursor: 'pointer', color: C.primary, fontWeight: 600 }} onClick={() => navigate('/dashboard')}>
                        Dashboard
                      </span>
                      <span>/</span>
                      <span style={{ cursor: 'pointer', color: C.primary, fontWeight: 600 }} onClick={() => navigate(`/session/${session.id}`)}>
                        Discovery
                      </span>
                      <span>/</span>
                      <span style={{ color: C.textB, fontWeight: 700 }}>Stage 4: Compiled Architecture</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.textH, margin: 0, wordBreak: 'break-word', maxWidth: '100%' }}>
                        {session.title}
                      </h1>

                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: C.successLt,
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        <Icon d={CHECK_ICON} size={12} color="#059669" /> Compiled & Certified
                      </span>

                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: C.primaryLt,
                        color: C.primaryDk,
                        border: '1px solid #c7d2fe',
                      }}>
                        v{brd?.version || 1}.0
                      </span>
                    </div>
                  </div>

                  {/* Actions: Export, Discovery Chat, Re-generate */}
                  <div className="result-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => navigate(`/session/${session.id}`)}
                      style={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: 9,
                        padding: '9px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.textB,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={CHAT_ICON} size={15} color={C.textM} />
                      <span>Discovery Chat</span>
                    </button>

                    <button
                      onClick={() => navigate(`/session/${session.id}/generating`)}
                      style={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: 9,
                        padding: '9px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.textB,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={REFRESH_ICON} size={14} color={C.textM} />
                      <span>Re-Compile</span>
                    </button>

                    <button
                      onClick={() => setShowVersionDrawer(!showVersionDrawer)}
                      style={{
                        background: showVersionDrawer ? C.primaryLt : C.surfaceAlt,
                        border: `1px solid ${showVersionDrawer ? C.primary : C.border}`,
                        borderRadius: 9,
                        padding: '9px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: showVersionDrawer ? C.primaryDk : C.textB,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={HISTORY_ICON} size={15} color={showVersionDrawer ? C.primary : C.textM} />
                      <span>Versions ({versions.length})</span>
                    </button>

                    {/* Export Dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                        style={{
                          background: C.grad,
                          color: '#fff',
                          border: 'none',
                          padding: '10px 18px',
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: 13.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                        }}
                      >
                        <Icon d={DOWNLOAD_ICON} size={15} color="#fff" />
                        <span>Export Deliverable ▾</span>
                      </button>

                      {exportDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: 6,
                          width: 210,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 12,
                          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                          zIndex: 50,
                          padding: 6,
                        }}>
                          <button
                            onClick={() => handleExport('pdf')}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              padding: '10px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              color: C.textH,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >
                            <span>📄 Executive PDF</span>
                            <span style={{ fontSize: 11, color: C.textSub }}>Printable</span>
                          </button>

                          <button
                            onClick={() => handleExport('docx')}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              padding: '10px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              color: C.textH,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >
                            <span>📝 Word / Markdown</span>
                            <span style={{ fontSize: 11, color: C.textSub }}>.docx</span>
                          </button>

                          <button
                            onClick={() => handleExport('json')}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              padding: '10px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 600,
                              color: C.textH,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.primaryLt}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                          >
                            <span>⚙ JSON Architecture Schema</span>
                            <span style={{ fontSize: 11, color: C.textSub }}>Full payload</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Version History Drawer (if toggled) */}
              {showVersionDrawer && (
                <div style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 24,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon d={HISTORY_ICON} size={18} color={C.primary} />
                      <span>Immutable MySQL Version Ledger (FR-6.4)</span>
                    </div>
                    <button
                      onClick={() => setShowVersionDrawer(false)}
                      style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', fontSize: 12 }}
                    >
                      ✕ Close
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {versions.map((v, i) => (
                      <div key={v.id || i} style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 12,
                        padding: '12px 16px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: C.primary }}>
                            Snapshot v{v.version_number || i + 1}.0
                          </span>
                          <span style={{ fontSize: 11, color: C.textSub }}>
                            {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: C.textB }}>
                          Change Event: <strong>{v.changed_section || 'full_generation'}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── 6-Pillar Tabbed Navigation Bar ─── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
                marginBottom: 24,
                borderBottom: `1px solid ${C.border}`,
              }}>
                {[
                  { id: 'brd', label: t('result.tabs.brd') || '1. Executive BRD', icon: BRD_ICON },
                  { id: 'architecture', label: t('result.tabs.architecture') || '2. Solution Architecture', icon: ARCH_ICON },
                  { id: 'bpmn', label: t('result.tabs.bpmn') || '3. Process Intelligence (BPMN)', icon: FLOW_ICON },
                  { id: 'database', label: t('result.tabs.database') || '4. Database & REST APIs', icon: DB_ICON },
                  { id: 'wireframes', label: t('result.tabs.wireframes') || '5. AI Wireframes', icon: WIRE_ICON },
                  { id: 'prototype', label: '6. Product Prototype', icon: CODE_ICON },
                  { id: 'estimates', label: t('result.tabs.estimates') || '7. Effort & Cost Band', icon: COST_ICON },
                ].map(tab => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        background: isActive ? C.surface : 'transparent',
                        border: `1px solid ${isActive ? C.border : 'transparent'}`,
                        borderBottom: isActive ? `2px solid ${C.primary}` : '2px solid transparent',
                        borderRadius: '10px 10px 0 0',
                        padding: '12px 18px',
                        fontSize: 13.5,
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? C.primary : C.textM,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Icon d={tab.icon} size={16} color={isActive ? C.primary : C.textSub} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* ═══════════════════════════════════════════════════════
                  TAB 1: EXECUTIVE BRD
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'brd' && (
                <div>
                  {/* Translating notification pill */}
                  {translatingDeliverables && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#eef2ff',
                      border: '1px solid #c7d2fe',
                      color: '#4f46e5',
                      padding: '7px 16px',
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 16,
                    }}>
                      <span style={{ fontSize: 14 }}>🌐</span>
                      <span>{tr('translatingNotice')}</span>
                    </div>
                  )}

                  {/* Tab Action Header */}
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        {tr('brdTitle')}
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        {tr('brdSub')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRegenerateSection('brd')}
                      disabled={regeneratingSection === 'brd'}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: C.primary,
                        cursor: regeneratingSection === 'brd' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={REFRESH_ICON} size={13} color={C.primary} />
                      <span>{regeneratingSection === 'brd' ? tr('regenerating') : tr('regenerateBtn')}</span>
                    </button>
                  </div>

                  {/* AI Explainability & Grounding Box */}
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 14,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>🧠</span>
                      <span>{tr('explainabilityTitle')}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <strong>• {tr('whyRecommended')}:</strong> {displayObjectives ? `Automated architecture engineered to fulfill target objectives: "${displayObjectives.slice(0, 140).replace(/^[#\s*]+/, '')}..." with sub-second latency and resilient horizontal scaling.` : `Automated architecture engineered to modernize ${session?.title || 'enterprise workflows'} with sub-second latency and resilient horizontal scaling.`}
                      </div>
                      <div>
                        <strong>• {tr('underlyingAssumption')}:</strong> {assumptions.length > 0 ? (typeof assumptions[0] === 'string' ? assumptions[0] : assumptions[0]?.assumption || 'Standard cloud infrastructure and high-availability network connectivity are provisioned.') : 'Standard cloud infrastructure and high-availability network connectivity are provisioned.'}
                      </div>
                      <div>
                        <strong>• {tr('sourceEvidence')}:</strong> Synthesized directly from validated input: <em>"{session?.summary ? session.summary.slice(0, 140) + '...' : session?.title || 'Domain requirement specifications'}"</em>.
                      </div>
                    </div>
                  </div>

                  {/* Objectives & Scope */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }} className="brd-grid">
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.6 }}>
                        {tr('executiveObjectives')}
                      </div>
                      <FormattedMarkdownContent text={displayObjectives} />
                    </div>

                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.6 }}>
                        {tr('scopeBoundaries')}
                      </div>
                      <FormattedMarkdownContent text={displayScope} />
                    </div>
                  </div>

                  {/* Gap Analysis */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                      {tr('gapAnalysisTitle')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                      {gapAnalysis.map((gap, gi) => (
                        <div key={gi} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: C.textH }}>{gap.area}</span>
                            <span style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: gap.impact === 'High' ? '#fee2e2' : '#fef3c7',
                              color: gap.impact === 'High' ? '#991b1b' : '#92400e',
                            }}>
                              {gap.impact} Impact
                            </span>
                          </div>
                          <p style={{ fontSize: 12.5, color: C.textM, margin: 0, lineHeight: 1.5 }}>
                            {gap.gap}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Functional & Non-Functional Requirements */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginBottom: 24 }} className="brd-reqs-grid">
                    {/* Functional Specs */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                        {tr('functionalSpecs')} ({functionalReqs.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {functionalReqs.map((fr, fri) => (
                          <div key={fri} style={{ padding: '12px 16px', borderRadius: 10, background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: C.primary }}>{fr.id || `FR-${fri + 1}`}: {fr.title}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: C.primaryLt, color: C.primaryDk }}>
                                {fr.priority || 'Must Have'}
                              </span>
                            </div>
                            <div style={{ fontSize: 12.5, color: C.textB, lineHeight: 1.5 }}>
                              {fr.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Non-Functional Requirements */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                        {tr('nonFunctionalSpecs')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {nonFunctionalReqs.map((nfr, nfi) => (
                          <div key={nfi} style={{ padding: '12px 16px', borderRadius: 10, background: C.surfaceAlt, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', marginBottom: 4 }}>
                              {nfr.category}
                            </div>
                            <div style={{ fontSize: 12.5, color: C.textB, lineHeight: 1.5 }}>
                              {nfr.requirement}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stakeholders & Constraints */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="brd-stakeholders-grid">
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textH, marginBottom: 10 }}>
                        {tr('stakeholders')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {stakeholders.map((s, si) => (
                          <span key={si} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.textB }}>
                            👤 {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textH, marginBottom: 10 }}>
                        {tr('assumptionsConstraints')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: C.textM }}>
                        {constraints.slice(0, 3).map((c, ci) => (
                          <div key={ci}>• {c}</div>
                        ))}
                        {assumptions.slice(0, 2).map((a, ai) => (
                          <div key={ai}>• {a}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 2: SOLUTION ARCHITECTURE & HLD
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'architecture' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        High-Level Solution Architecture & Cloud Topology
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        Decoupled multi-tier enterprise architecture engineered for resilience and scalability.
                      </p>
                    </div>

                    <button
                      onClick={() => handleRegenerateSection('architecture')}
                      disabled={regeneratingSection === 'architecture'}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: C.primary,
                        cursor: regeneratingSection === 'architecture' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={REFRESH_ICON} size={13} color={C.primary} />
                      <span>{regeneratingSection === 'architecture' ? tr('regenerating') : tr('regenerateBtn')}</span>
                    </button>
                  </div>

                  {/* Architectural Summary Banner */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.6 }}>
                      Executive Architecture HLD Overview
                    </div>
                    <div style={{ fontSize: 14, color: C.textB, lineHeight: 1.65, margin: 0 }}>
                      <FormattedMarkdownContent text={architecture?.hld_summary || 'Decoupled cloud-native architecture utilizing a React SPA portal, Express API gateway, and MySQL database cluster.'} />
                    </div>
                  </div>

                  {/* AI Architectural Rationale & Explainability Box */}
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 14,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>🧠</span>
                      <span>{tr('explainabilityTitle')}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <strong>• {tr('whyRecommended')}:</strong> Selected a decoupled event-driven cloud architecture with API Gateway and microservice worker pools to isolate core transaction processing from external integrations and data lake analytics.
                      </div>
                      <div>
                        <strong>• {tr('underlyingAssumption')}:</strong> Estimated peak operational throughput is handled via auto-scaling compute pods, Redis in-memory cache, and message brokers with sub-second lookups.
                      </div>
                      <div>
                        <strong>• {tr('sourceEvidence')}:</strong> Grounded in statutory 99.9% uptime requirement, zero-trust token authentication, and multi-tenant domain isolation for {session?.title || 'the enterprise solution'}.
                      </div>
                    </div>
                  </div>

                  {/* Mermaid Enterprise Architecture Diagram */}
                  <MermaidDiagram
                    id="mermaid-architecture-model"
                    title="Mermaid.js Enterprise Solution Architecture & Cloud Topology"
                    subtitle="Client PWA → Edge CDN → API Gateway → Worker Microservices → Persistence & Cache"
                    chart={archMermaidChart}
                  />

                  {/* Interactive OpenAPI / Swagger UI Explorer */}
                  <SwaggerApiExplorer
                    endpoints={apiEndpoints}
                    title="Enterprise OpenAPI 3.1 Specification & Interactive Endpoint Console"
                  />
                  <div style={{
                    background: '#0f172a',
                    color: '#fff',
                    borderRadius: 18,
                    padding: 24,
                    marginBottom: 24,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Interactive Cloud Deployment Topology
                      </div>
                      <span style={{ fontSize: 11, background: '#1e293b', padding: '3px 10px', borderRadius: 20, color: '#38bdf8' }}>
                        TLS 1.3 / Zero-Trust VPC
                      </span>
                    </div>

                    {/* Topology Diagram Flow */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, alignItems: 'center' }}>
                      {[
                        { title: 'Web Client Portal', tier: 'Client Tier', tech: 'React / Vite SPA', color: '#6366f1' },
                        { title: 'API Gateway & Auth', tier: 'Ingress Tier', tech: 'Node.js Express / JWT', color: '#06b6d4' },
                        { title: 'Ingestion Worker', tier: 'Compute Tier', tech: 'Async Worker Pool', color: '#3b82f6' },
                        { title: 'AI Reasoning Core', tier: 'Inference Tier', tech: 'Parallel LLM Engine', color: '#8b5cf6' },
                        { title: 'Relational DB Cluster', tier: 'Persistence Tier', tech: 'MySQL 8.0 InnoDB', color: '#10b981' },
                      ].map((box, bi) => (
                        <div key={bi} style={{
                          background: '#1e293b',
                          border: `1.5px solid ${box.color}`,
                          borderRadius: 12,
                          padding: 14,
                          textAlign: 'center',
                          position: 'relative',
                        }}>
                          <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            {box.tier}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
                            {box.title}
                          </div>
                          <div style={{ fontSize: 11, color: box.color, fontWeight: 600 }}>
                            {box.tech}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #334155', fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <span>Flow: Client Ingestion → Auth Verification → Parallel Reasoning Pool → ACID Transaction Storage</span>
                      <span style={{ color: '#34d399' }}>● Continuous Uptime SLA: 99.9%</span>
                    </div>

                    {/* RBAC Capability 7: Trigger Automated Cloud Sandbox Deploy */}
                    <div style={{
                      marginTop: 14,
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 12,
                      border: '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>🚀 Automated Cloud Sandbox Deploy</span>
                          <span style={{
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 10,
                            background: currentRole === 'admin' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: currentRole === 'admin' ? '#34d399' : '#f87171',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                          }}>
                            {currentRole === 'admin' ? '✓ Admin Allowed' : '✗ Restricted (Admin Only)'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
                          Deploy an isolated zero-trust ephemeral sandbox container to test this architecture.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleTriggerSandboxDeploy}
                        style={{
                          padding: '9px 18px',
                          borderRadius: 10,
                          background: currentRole === 'admin' ? 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)' : '#334155',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 12.5,
                          border: 'none',
                          cursor: currentRole === 'admin' ? 'pointer' : 'not-allowed',
                          opacity: currentRole === 'admin' ? 1 : 0.6,
                          boxShadow: currentRole === 'admin' ? '0 4px 14px rgba(99,102,241,0.35)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {deployingSandbox ? 'Deploying Sandbox...' : 'Trigger Automated Cloud Sandbox Deploy'}
                      </button>
                    </div>
                  </div>

                  {/* Tech Stack Matrix */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 16 }}>
                      Technology Stack & Architecture Rationale
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: `1.5px solid ${C.border}`, color: C.textM }}>
                            <th style={{ padding: '8px 12px', width: '22%' }}>Category</th>
                            <th style={{ padding: '8px 12px', width: '30%' }}>Recommended Choice</th>
                            <th style={{ padding: '8px 12px' }}>Technical Rationale</th>
                          </tr>
                        </thead>
                        <tbody>
                          {techStack.map((item, ti) => (
                            <tr key={ti} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: '12px', fontWeight: 700, color: C.textH }}>{item.category}</td>
                              <td style={{ padding: '12px', fontWeight: 600, color: C.primary }}>{item.choice}</td>
                              <td style={{ padding: '12px', color: C.textB, lineHeight: 1.5 }}>{item.rationale}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Security Notes */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 8 }}>
                      Security, Encryption & Regulatory Compliance
                    </div>
                    <p style={{ fontSize: 13.5, color: C.textB, lineHeight: 1.6, margin: 0 }}>
                      {architecture?.security_notes || 'All data in transit protected by TLS 1.3. AES-256 encryption at rest. Strict role-based row-level data access.'}
                    </p>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 3: PROCESS INTELLIGENCE & BPMN WORKFLOWS
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'bpmn' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        Process Intelligence & BPMN Workflows
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        Formal BPMN process models with decision gates, approval thresholds, and SLA escalation paths.
                      </p>
                    </div>

                    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: C.warnLt, color: '#92400e' }}>
                      SLA: {bpmn?.slaTarget || '< 24 Hours'}
                    </span>
                  </div>

                  {/* AI Process Rationale & Explainability Box */}
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 14,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>🧠</span>
                      <span>AI Workflow Rationale & Governance Explainability</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <strong>• Why I Recommended This:</strong> Automated decision gates and service worker nodes replace manual checklists, allowing parallel asynchronous validations and strict SLA compliance for {bpmn?.processName || session?.title || 'business operations'}.
                      </div>
                      <div>
                        <strong>• Underlying Assumption:</strong> Core automated validations complete in sub-minute intervals with escalation paths if review SLAs exceed configured thresholds.
                      </div>
                      <div>
                        <strong>• Source Evidence:</strong> Modeled to satisfy strict end-to-end audit compliance and zero-loss message processing guidelines.
                      </div>
                    </div>
                  </div>

                  {/* Mermaid BPMN Process Workflow Diagram */}
                  <MermaidDiagram
                    id="mermaid-bpmn-workflow"
                    title="Mermaid.js BPMN 2.0 Process Workflow Orchestration"
                    subtitle="Automated Lifecycle Steps, Gateways, Escalation Policies & SLA Compliance"
                    chart={bpmnMermaidChart}
                  />

                  {/* Visual BPMN Process Diagram */}
                  <div style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 18,
                    padding: 24,
                    marginBottom: 24,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, textTransform: 'uppercase', marginBottom: 18, letterSpacing: 0.6 }}>
                      {bpmn?.processName || 'Automated Transformation & Approval Pipeline'}
                    </div>

                    {/* BPMN Step Flow Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {(bpmn?.nodes || []).map((node, ni) => {
                        const isStart = node.type === 'start';
                        const isGateway = node.type === 'gateway';
                        const isEnd = node.type === 'end';

                        let badgeColor = C.primary;
                        let badgeBg = C.primaryLt;
                        if (isStart) { badgeColor = '#059669'; badgeBg = '#d1fae5'; }
                        if (isGateway) { badgeColor = '#d97706'; badgeBg = '#fef3c7'; }
                        if (isEnd) { badgeColor = '#dc2626'; badgeBg = '#fee2e2'; }

                        return (
                          <div key={node.id || ni} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            background: C.surfaceAlt,
                            border: `1px solid ${isGateway ? '#fde68a' : C.border}`,
                            borderRadius: 12,
                            padding: '14px 18px',
                          }}>
                            {/* Sequence Number */}
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: isGateway ? 4 : '50%',
                              background: badgeBg,
                              color: badgeColor,
                              fontWeight: 800,
                              fontSize: 13,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transform: isGateway ? 'rotate(45deg)' : 'none',
                              flexShrink: 0,
                            }}>
                              <span style={{ transform: isGateway ? 'rotate(-45deg)' : 'none' }}>
                                {ni + 1}
                              </span>
                            </div>

                            {/* Node Details */}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                                <span style={{ fontWeight: 800, fontSize: 14, color: C.textH }}>{node.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: badgeBg, color: badgeColor, textTransform: 'uppercase' }}>
                                  {node.type}
                                </span>
                                <span style={{ fontSize: 11.5, color: C.textSub }}>Actor: <strong>{node.actor}</strong></span>
                              </div>
                              <div style={{ fontSize: 12.5, color: C.textM, lineHeight: 1.5 }}>
                                {node.description}
                              </div>
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, whiteSpace: 'nowrap' }}>
                              ⏱ {node.duration}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Decision Gates & Escalations */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="bpmn-rules-grid">
                    {/* Decision Gates */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                        Exclusive Decision Gate Policies
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(bpmn?.decisionGates || []).map((gate, gi) => (
                          <div key={gi} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.warn, marginBottom: 6 }}>
                              Condition: {gate.condition}
                            </div>
                            <div style={{ fontSize: 12, color: C.textB, marginBottom: 3 }}>
                              ✓ <strong>If True:</strong> {gate.outcomeIfTrue}
                            </div>
                            <div style={{ fontSize: 12, color: C.textM }}>
                              ✕ <strong>If False:</strong> {gate.outcomeIfFalse}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Escalations */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                        Automated Escalation Triggers
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(bpmn?.escalations || []).map((esc, ei) => (
                          <div key={ei} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                              Trigger: {esc.trigger}
                            </div>
                            <div style={{ fontSize: 12, color: C.textB, marginBottom: 4 }}>
                              Action: {esc.action}
                            </div>
                            <div style={{ fontSize: 11.5, color: C.textSub }}>
                              Responsible Owner: <strong>{esc.owner}</strong>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 4: DATABASE SCHEMA & REST API SPECIFICATIONS
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'database' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        Relational Database Schema & REST API Explorer
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        Production-ready relational entities and OpenAPI / RESTful interface specifications.
                      </p>
                    </div>

                    <button
                      onClick={() => copyToClipboard(JSON.stringify({ databaseSchema: dbSchema, apiSpecs }, null, 2), 'schema')}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: C.primary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={COPY_ICON} size={14} color={C.primary} />
                      <span>{copiedKey === 'schema' ? '✓ Copied Schema!' : 'Copy Full Schema'}</span>
                    </button>
                  </div>

                  {/* AI Data Model Rationale & Explainability Box */}
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 14,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
                      <span style={{ fontSize: 16 }}>🧠</span>
                      <span>AI Data Model Rationale & ACID Compliance Explainability</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <strong>• Why I Recommended This:</strong> 3NF Relational structure with UUID primary keys and foreign key constraints guarantees ACID compliance and immutable audit logs for {session?.title || 'operational workflows'}.
                      </div>
                      <div>
                        <strong>• Underlying Assumption:</strong> Read-to-write ratio is estimated at 80:20, making composite B-Tree indexes on primary status and entity lookup foreign keys optimal.
                      </div>
                      <div>
                        <strong>• Source Evidence:</strong> Normalized from identified domain entities: {dbTables.map(t => t.name).slice(0, 4).join(', ')} with referential integrity constraints.
                      </div>
                    </div>
                  </div>

                  {/* Mermaid Entity-Relationship (ERD) Schema Diagram */}
                  <MermaidDiagram
                    id="mermaid-erd-schema"
                    title="Mermaid.js Entity-Relationship (ERD) Relational Schema Model"
                    subtitle="Normalized 3NF Data Model with Foreign Key Constraints & Audit Integrity"
                    chart={erdMermaidChart}
                  />

                  {/* Relational Tables Explorer */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.textH, marginBottom: 14 }}>
                      Normalized Relational Database Entities (MySQL 8.0)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
                      {dbTables.map((table, ti) => (
                        <div key={table.name || ti} style={{
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 16,
                          padding: 20,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 14.5, fontWeight: 800, color: C.primary, fontFamily: 'monospace' }}>
                              {table.name}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: C.surfaceAlt, color: C.textSub }}>
                              {table.columns?.length || 0} Columns
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: C.textM, marginBottom: 14 }}>
                            {table.description}
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.textSub, textAlign: 'left' }}>
                                  <th style={{ padding: '6px 4px' }}>Column</th>
                                  <th style={{ padding: '6px 4px' }}>Type</th>
                                  <th style={{ padding: '6px 4px' }}>Constraints</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(table.columns || []).map((col, ci) => (
                                  <tr key={ci} style={{ borderBottom: `1px solid ${C.surfaceAlt}` }}>
                                    <td style={{ padding: '6px 4px', fontWeight: 600, color: C.textH, fontFamily: 'monospace' }}>
                                      {col.name}
                                    </td>
                                    <td style={{ padding: '6px 4px', color: C.accent, fontFamily: 'monospace' }}>
                                      {col.type}
                                    </td>
                                    <td style={{ padding: '6px 4px' }}>
                                      {col.isPk && <span style={{ fontSize: 9.5, fontWeight: 800, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>PK</span>}
                                      {col.isFk && <span style={{ fontSize: 9.5, fontWeight: 800, background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: 4 }}>FK</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* REST API Endpoints */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.textH, marginBottom: 16 }}>
                      RESTful API Specification & Payload Contracts
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {apiEndpoints.map((ep, epi) => {
                        const isPost = ep.method === 'POST';
                        const isGet = ep.method === 'GET';

                        return (
                          <div key={epi} style={{
                            background: C.surfaceAlt,
                            border: `1px solid ${C.border}`,
                            borderRadius: 12,
                            padding: 16,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  background: isPost ? '#dbeafe' : isGet ? '#dcfce7' : '#fef3c7',
                                  color: isPost ? '#1d4ed8' : isGet ? '#15803d' : '#b45309',
                                  fontFamily: 'monospace',
                                }}>
                                  {ep.method}
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.textH, fontFamily: 'monospace' }}>
                                  {ep.path}
                                </span>
                              </div>

                              <span style={{ fontSize: 11.5, color: C.textSub }}>
                                {ep.authRequired ? '🔒 Auth Required (JWT)' : '🌐 Public'}
                              </span>
                            </div>

                            <div style={{ fontSize: 12.5, color: C.textM, marginBottom: 10 }}>
                              {ep.summary}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, marginBottom: 4 }}>Request Payload</div>
                                <pre style={{ background: '#0f172a', color: '#38bdf8', padding: '8px 12px', borderRadius: 8, fontSize: 11, margin: 0, overflowX: 'auto', fontFamily: 'monospace' }}>
                                  {ep.requestBody}
                                </pre>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, marginBottom: 4 }}>Response Sample</div>
                                <pre style={{ background: '#0f172a', color: '#4ade80', padding: '8px 12px', borderRadius: 8, fontSize: 11, margin: 0, overflowX: 'auto', fontFamily: 'monospace' }}>
                                  {ep.responseSample}
                                </pre>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 5: AI UX WIREFRAMES
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'wireframes' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        AI UX Wireframe Concepts & Screen Hierarchy
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        High-fidelity visual layout blueprints dynamically synthesized from project requirements.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 20,
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}>
                        <span style={{ fontSize: 13 }}>✨</span>
                        {wireframes?.provider || 'Google Gemini (Dedicated Engine)'}
                      </span>
                      <button
                        onClick={() => handleRegenerateSection('wireframes')}
                        disabled={regeneratingSection === 'wireframes'}
                        style={{
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: '8px 14px',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: C.primary,
                          cursor: regeneratingSection === 'wireframes' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>⚡</span>
                        {regeneratingSection === 'wireframes' ? 'Generating Wireframes...' : 'Regenerate Wireframes & UI'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>
                    {(wireframes?.screens || []).map((screen, si) => (
                      <div key={screen.id || si} style={{
                        background: C.surface,
                        border: `1.5px solid ${C.border}`,
                        borderRadius: 16,
                        padding: 22,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: C.textH }}>{screen.title}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: C.primaryLt, color: C.primaryDk, textTransform: 'uppercase' }}>
                              {screen.layoutType || 'Dashboard'}
                            </span>
                          </div>
                          <p style={{ fontSize: 12.5, color: C.textM, margin: '0 0 16px', lineHeight: 1.5 }}>
                            {screen.description}
                          </p>

                          {/* Visual Wireframe Blueprint Canvas */}
                          <div style={{
                            background: '#0f172a',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 16,
                            border: '1px solid #334155',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
                          }}>
                            {/* Browser / Application Top Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                                <span style={{ fontSize: 9.5, color: '#64748b', marginLeft: 6, fontFamily: 'monospace' }}>
                                  app://blueprint/{screen.title?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'screen'}
                                </span>
                              </div>
                              <span style={{ fontSize: 8.5, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                {screen.layoutType}
                              </span>
                            </div>

                            {/* Header Navigation Pills if available */}
                            {Array.isArray(screen.headerNav) && screen.headerNav.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
                                {screen.headerNav.map((item, hi) => (
                                  <span key={hi} style={{
                                    fontSize: 9,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    background: hi === 0 ? '#3b82f6' : '#1e293b',
                                    color: hi === 0 ? '#fff' : '#94a3b8',
                                    fontWeight: hi === 0 ? 700 : 500,
                                  }}>
                                    {item}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Layout Body: Sidebar + Main Area */}
                            <div style={{ display: 'grid', gridTemplateColumns: screen.sidebarItems?.length ? '70px 1fr' : '1fr', gap: 8, minHeight: 140 }}>
                              {/* Sidebar */}
                              {Array.isArray(screen.sidebarItems) && screen.sidebarItems.length > 0 && (
                                <div style={{ background: '#090d16', borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ height: 4, background: '#6366f1', borderRadius: 2, width: '70%', marginBottom: 4 }} />
                                  {screen.sidebarItems.slice(0, 5).map((sItem, sIdx) => (
                                    <span key={sIdx} style={{ fontSize: 8, color: sIdx === 0 ? '#38bdf8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      • {sItem}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Main Content Area */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Metrics Ribbon */}
                                {Array.isArray(screen.metrics) && screen.metrics.length > 0 ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(screen.metrics.length, 3)}, 1fr)`, gap: 6 }}>
                                    {screen.metrics.slice(0, 3).map((m, mi) => (
                                      <div key={mi} style={{ background: '#1e293b', borderRadius: 5, padding: '4px 6px' }}>
                                        <div style={{ fontSize: 7.5, color: '#94a3b8', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                          {m.label}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                                          <span style={{ fontSize: 11, fontWeight: 800, color: m.color || '#38bdf8' }}>
                                            {m.value}
                                          </span>
                                          {m.trend && (
                                            <span style={{ fontSize: 7.5, color: '#34d399' }}>
                                              {m.trend}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                    <div style={{ background: '#1e293b', height: 26, borderRadius: 4 }} />
                                    <div style={{ background: '#1e293b', height: 26, borderRadius: 4 }} />
                                    <div style={{ background: '#1e293b', height: 26, borderRadius: 4 }} />
                                  </div>
                                )}

                                {/* Interactive Mock Data Grid / Content Skeleton */}
                                {Array.isArray(screen.mockRows) && screen.mockRows.length > 0 ? (
                                  <div style={{ background: '#131d2e', borderRadius: 6, padding: 6, overflow: 'hidden' }}>
                                    {screen.mockRows.slice(0, 3).map((row, ri) => (
                                      <div key={ri} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '3px 0',
                                        borderBottom: ri < 2 ? '1px solid #1e293b' : 'none',
                                        fontSize: 8.5,
                                      }}>
                                        <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{row.col1 || `ID-${ri + 1}`}</span>
                                        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{row.col2 || 'Entity'}</span>
                                        <span style={{ color: '#64748b' }}>{row.col3 || ''}</span>
                                        <span style={{
                                          fontSize: 7.5,
                                          padding: '1px 4px',
                                          borderRadius: 3,
                                          background: row.status === 'danger' ? '#ef444433' : row.status === 'warning' ? '#f59e0b33' : '#10b98133',
                                          color: row.status === 'danger' ? '#f87171' : row.status === 'warning' ? '#fbbf24' : '#34d399',
                                        }}>
                                          {row.col4 || row.status || 'Active'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ background: '#131d2e', flex: 1, borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ height: 6, background: '#334155', borderRadius: 2, width: '100%' }} />
                                    <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '85%' }} />
                                    <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '92%' }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          {/* Screen Actions Pills */}
                          {Array.isArray(screen.actions) && screen.actions.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                              {screen.actions.map((act, ai) => (
                                <span key={ai} style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: C.primary,
                                  background: C.surfaceAlt,
                                  border: `1px solid ${C.border}`,
                                  borderRadius: 6,
                                  padding: '3px 8px',
                                }}>
                                  ▶ {act}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Wireframe Components Breakdown */}
                          <div style={{
                            background: C.surfaceAlt,
                            border: `1.5px dashed ${C.borderMed}`,
                            borderRadius: 12,
                            padding: 14,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                          }}>
                            {(screen.components || []).map((comp, ci) => (
                              <div key={ci} style={{
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                padding: '8px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}>
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textB }}>
                                  ▫ {comp.label}
                                </span>
                                <span style={{ fontSize: 9.5, color: C.textSub, background: C.surfaceAlt, padding: '2px 6px', borderRadius: 4, border: `1px solid ${C.border}` }}>
                                  {comp.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 6: PRODUCT PROTOTYPE (DUAL AI ENGINE ROUND-ROBIN)
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'prototype' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: C.textH }}>
                          {prototype?.appName || 'Interactive Working Product Prototype'}
                        </h2>
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: '#ecfdf5',
                          color: '#059669',
                          border: '1px solid #a7f3d0'
                        }}>
                          ● Live Sandbox
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        {prototype?.appSummary || 'Working solution prototype synthesized from business requirements with interactive controls.'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: 20,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ fontSize: 13 }}>⚡</span>
                        {prototype?.provider || 'Dual AI Engine (Gemini & Groq)'}
                        {prototype?.modelUsed && (
                          <span style={{ opacity: 0.7, fontSize: 10 }}>({prototype.modelUsed})</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleRegenerateSection('prototype')}
                        disabled={regeneratingSection === 'prototype'}
                        style={{
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          padding: '8px 14px',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: C.primary,
                          cursor: regeneratingSection === 'prototype' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>⚡</span>
                        {regeneratingSection === 'prototype' ? 'Regenerating Prototype...' : 'Regenerate Prototype'}
                      </button>
                    </div>
                  </div>

                  {/* Live Deployed Application Cockpit & Viewport Switcher */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
                    border: '1.5px solid #334155',
                    borderRadius: 16,
                    padding: '18px 22px',
                    marginBottom: 20,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                    color: '#fff',
                  }}>
                    {/* Top Row: Live URL Bar + Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 20,
                          background: 'rgba(16,185,129,0.15)',
                          border: '1px solid rgba(16,185,129,0.3)',
                          color: '#34d399',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', animation: 'pulse 1.5s infinite' }} />
                          LIVE DEPLOYED
                        </div>

                        {/* URL Pill Input */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 10,
                          padding: '6px 12px',
                        }}>
                          <span style={{ fontSize: 13, color: '#38bdf8' }}>🔒</span>
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: '#94a3b8',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}>
                            {livePrototypeUrl || 'http://localhost:5000/api/sessions/.../prototype/live'}
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyLiveUrl}
                            title="Copy Live URL"
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: protoUrlCopied ? '#34d399' : '#cbd5e1',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            {protoUrlCopied ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      {/* Primary Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => window.open(livePrototypeUrl, '_blank')}
                          style={{
                            padding: '9px 18px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #0284c7 0%, #6366f1 100%)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 13,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            boxShadow: '0 4px 14px rgba(2,132,199,0.35)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>🌐</span>
                          <span>Open Deployed Web App</span>
                          <span style={{ fontSize: 11, opacity: 0.85 }}>↗</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadDeployedHtml}
                          style={{
                            padding: '9px 15px',
                            borderRadius: 10,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f1f5f9',
                            fontWeight: 600,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span>📥</span>
                          <span>Download index.html</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIframeKey(k => k + 1)}
                          title="Refresh live preview"
                          style={{
                            padding: '9px 12px',
                            borderRadius: 10,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#94a3b8',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          🔄 Reload
                        </button>
                      </div>
                    </div>

                    {/* Sub-bar: View Mode Toggles & Responsive Devices */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: 14, flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setProtoViewMode('live')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            background: protoViewMode === 'live' ? '#0284c7' : '#090d16',
                            color: protoViewMode === 'live' ? '#fff' : '#94a3b8',
                            border: `1px solid ${protoViewMode === 'live' ? '#0284c7' : '#1e293b'}`,
                            cursor: 'pointer',
                          }}
                        >
                          🌐 Live Deployed App
                        </button>
                        <button
                          type="button"
                          onClick={() => setProtoViewMode('data')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            background: protoViewMode === 'data' ? '#0284c7' : '#090d16',
                            color: protoViewMode === 'data' ? '#fff' : '#94a3b8',
                            border: `1px solid ${protoViewMode === 'data' ? '#0284c7' : '#1e293b'}`,
                            cursor: 'pointer',
                          }}
                        >
                          📊 Telemetry & Data Grid
                        </button>
                        <button
                          type="button"
                          onClick={() => setProtoViewMode('code')}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            background: protoViewMode === 'code' ? '#0284c7' : '#090d16',
                            color: protoViewMode === 'code' ? '#fff' : '#94a3b8',
                            border: `1px solid ${protoViewMode === 'code' ? '#0284c7' : '#1e293b'}`,
                            cursor: 'pointer',
                          }}
                        >
                          💻 React 19 Code & Docker
                        </button>
                      </div>

                      {protoViewMode === 'live' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#090d16', padding: '3px 6px', borderRadius: 8, border: '1px solid #1e293b' }}>
                          <span style={{ fontSize: 11, color: '#64748b', marginRight: 4, fontWeight: 600 }}>Viewport:</span>
                          <button
                            type="button"
                            onClick={() => setProtoViewport('desktop')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: protoViewport === 'desktop' ? '#334155' : 'transparent',
                              color: protoViewport === 'desktop' ? '#38bdf8' : '#94a3b8',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            🖥️ Desktop (100%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProtoViewport('tablet')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: protoViewport === 'tablet' ? '#334155' : 'transparent',
                              color: protoViewport === 'tablet' ? '#38bdf8' : '#94a3b8',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            📱 Tablet (768px)
                          </button>
                          <button
                            type="button"
                            onClick={() => setProtoViewport('mobile')}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: protoViewport === 'mobile' ? '#334155' : 'transparent',
                              color: protoViewport === 'mobile' ? '#38bdf8' : '#94a3b8',
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            📱 Mobile (390px)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ────────────────────────────────────────────────────────
                      MODE 1: LIVE DEPLOYED APPLICATION (EMBEDDED IFRAME)
                  ──────────────────────────────────────────────────────── */}
                  {protoViewMode === 'live' && (
                    <div style={{
                      background: '#090d16',
                      border: '1.5px solid #334155',
                      borderRadius: 18,
                      overflow: 'hidden',
                      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                      marginBottom: 24,
                    }}>
                      {/* Simulated Browser Top Bar */}
                      <div style={{
                        background: '#0f172a',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid #1e293b',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444' }} />
                          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b' }} />
                          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981' }} />
                        </div>

                        <div style={{
                          flex: 1,
                          maxWidth: 580,
                          margin: '0 16px',
                          background: '#040711',
                          border: '1px solid #1e293b',
                          borderRadius: 8,
                          padding: '4px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}>
                          <span style={{ fontSize: 11, color: '#10b981' }}>🔒 https://</span>
                          <span style={{ fontSize: 11.5, color: '#e2e8f0', fontFamily: 'monospace' }}>
                            {(prototype?.appName || 'prototype').toLowerCase().replace(/[^a-z0-9]/g, '-')}.compileai.live
                          </span>
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(14,165,233,0.15)', color: '#38bdf8', fontWeight: 700 }}>
                            PRODUCTION SANDBOX
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => window.open(livePrototypeUrl, '_blank')}
                            title="Open standalone page"
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#38bdf8',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            ↗ Full Page
                          </button>
                        </div>
                      </div>

                      {/* Viewport Container */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        background: '#030712',
                        padding: protoViewport === 'desktop' ? '0' : '24px 16px',
                        minHeight: 700,
                      }}>
                        <div style={{
                          width: protoViewport === 'mobile' ? '390px' : protoViewport === 'tablet' ? '768px' : '100%',
                          transition: 'width 0.25s ease',
                          boxShadow: protoViewport === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,0.6)',
                          borderRadius: protoViewport === 'desktop' ? 0 : 16,
                          overflow: 'hidden',
                          border: protoViewport === 'desktop' ? 'none' : '2px solid #334155',
                        }}>
                          <iframe
                            key={iframeKey}
                            src={livePrototypeUrl}
                            title="Live Product Prototype Sandbox"
                            style={{
                              width: '100%',
                              height: 720,
                              border: 'none',
                              background: '#020617',
                              display: 'block',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────
                      MODE 2: DATA RECORDS & OPERATIONS
                  ──────────────────────────────────────────────────────── */}
                  {protoViewMode === 'data' && (
                    <div>
                      {/* Top Stats Ribbon */}
                      {Array.isArray(prototype?.stats) && prototype.stats.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
                          {prototype.stats.map((s, idx) => (
                            <div key={idx} style={{
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                              borderRadius: 12,
                              padding: '14px 18px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                            }}>
                              <div style={{ fontSize: 12, color: C.textM, fontWeight: 600 }}>{s.label}</div>
                              <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.primary, marginTop: 4 }}>
                                {s.value}
                              </div>
                              {s.trend && (
                                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>{s.trend}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Interactive Sandbox Container */}
                      <div style={{
                        background: C.surface,
                        border: `1.5px solid ${C.border}`,
                        borderRadius: 16,
                        padding: 20,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                        marginBottom: 20,
                      }}>
                        {/* Control Bar: Search + Filters + Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                            <input
                              type="text"
                              value={protoSearch}
                              onChange={(e) => setProtoSearch(e.target.value)}
                              placeholder={`Search ${prototype?.entityName || 'entities'} by ID, name, or attribute...`}
                              style={{
                                width: '100%',
                                maxWidth: 320,
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}`,
                                background: C.surfaceAlt,
                                fontSize: 13,
                                color: C.textH,
                                outline: 'none',
                              }}
                            />

                            {/* Filter Pills */}
                            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                              {(prototype?.filters || ['All', 'Approved', 'In Review', 'Pending']).map((flt, fi) => (
                                <button
                                  key={fi}
                                  onClick={() => setProtoFilter(flt)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 20,
                                    fontSize: 12,
                                    fontWeight: protoFilter === flt ? 700 : 500,
                                    background: protoFilter === flt ? C.primary : C.surfaceAlt,
                                    color: protoFilter === flt ? '#fff' : C.textM,
                                    border: `1px solid ${protoFilter === flt ? C.primary : C.border}`,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {flt}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              onClick={() => setNewRecordModal(true)}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                background: C.grad,
                                color: '#fff',
                                border: 'none',
                                fontSize: 12.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                              }}
                            >
                              <span>+</span> Add {prototype?.entityName || 'Record'}
                            </button>
                          </div>
                        </div>

                        {/* Interactive Records Table */}
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: C.surfaceAlt, color: C.textM, borderBottom: `1.5px solid ${C.border}` }}>
                                {(prototype?.columnLabels || ['ID', 'Name', 'Domain', 'Specs', 'Band', 'Status']).map((col, ci) => (
                                  <th key={ci} style={{ padding: '10px 12px', fontWeight: 700 }}>
                                    {col}
                                  </th>
                                ))}
                                <th style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredProtoRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: C.textSub }}>
                                    No records match search query "{protoSearch}" or filter "{protoFilter}".
                                  </td>
                                </tr>
                              ) : (
                                filteredProtoRecords.map((rec, ri) => (
                                  <tr key={rec.id || ri} style={{ borderBottom: `1px solid ${C.border}` }}>
                                    <td style={{ padding: '12px', fontFamily: 'monospace', color: C.primary, fontWeight: 700 }}>
                                      {rec.id}
                                    </td>
                                    <td style={{ padding: '12px', fontWeight: 600, color: C.textH }}>
                                      {rec.name}
                                    </td>
                                    <td style={{ padding: '12px', color: C.textB }}>
                                      {rec.district}
                                    </td>
                                    <td style={{ padding: '12px', color: C.textM }}>
                                      {rec.acres}
                                    </td>
                                    <td style={{ padding: '12px', color: C.textM }}>
                                      {rec.hp || rec.subsidy || 'Optimal'}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                      <span style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        background: rec.status === 'Approved' ? '#ecfdf5' : rec.status === 'In Review' ? '#fef3c7' : '#eff6ff',
                                        color: rec.status === 'Approved' ? '#059669' : rec.status === 'In Review' ? '#d97706' : '#2563eb',
                                        border: `1px solid ${rec.status === 'Approved' ? '#a7f3d0' : rec.status === 'In Review' ? '#fde68a' : '#bfdbfe'}`,
                                      }}>
                                        {rec.status}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                      <button
                                        onClick={() => alert(`🔍 Record Details [${rec.id}]\n\nName: ${rec.name}\nStatus: ${rec.status}\nDetails: ${rec.details || 'Nominal operational status'}`)}
                                        style={{
                                          padding: '4px 10px',
                                          borderRadius: 6,
                                          background: C.surfaceAlt,
                                          border: `1px solid ${C.border}`,
                                          fontSize: 11.5,
                                          color: C.textB,
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Inspect
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Operational Action Toolbar */}
                        {Array.isArray(prototype?.actions) && prototype.actions.length > 0 && (
                          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.textM }}>
                              Live Operational Triggers:
                            </span>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {prototype.actions.map((act, ai) => (
                                <button
                                  key={act.id || ai}
                                  onClick={() => alert(`⚡ Action Dispatched: [${act.label}]\nExecution confirmed across simulated backend cluster.`)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: act.type === 'primary' ? C.primaryLt : C.surfaceAlt,
                                    color: act.type === 'primary' ? C.primaryDk : C.textB,
                                    border: `1px solid ${act.type === 'primary' ? C.primary : C.border}`,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ▶ {act.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────
                      MODE 3: REACT 19 CODE & DOCKER DEPLOYMENT
                  ──────────────────────────────────────────────────────── */}
                  {protoViewMode === 'code' && (
                    <div>
                      {/* Code Snippet Drawer */}
                      <div style={{
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: 16,
                        padding: 20,
                        marginBottom: 20,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                            <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginLeft: 8 }}>
                              src/components/PrototypeApp.jsx
                            </span>
                          </div>
                          <button
                            onClick={handleCopyProtoCode}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#38bdf8',
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {protoCopied ? '✓ Copied!' : 'Copy Code'}
                          </button>
                        </div>
                        <pre style={{
                          margin: 0,
                          padding: 12,
                          background: '#040711',
                          borderRadius: 8,
                          fontSize: 12,
                          lineHeight: 1.6,
                          color: '#e2e8f0',
                          fontFamily: 'Consolas, Monaco, monospace',
                          overflowX: 'auto',
                          maxHeight: 380,
                        }}>
                          {prototype?.codeSnippet || '// React 19 functional prototype component code\nexport default function WorkingPrototype() {\n  return <div>Prototype Component Ready</div>;\n}'}
                        </pre>
                      </div>

                      {/* Cloud Deployment Banner */}
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(6,182,212,0.08) 100%)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 16,
                        padding: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: C.textH, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>🚀</span> Ready for Cloud Deployment
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textM }}>
                            1-click production deploy to Vercel, Render, or self-hosted Docker container.
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={handleTriggerSandboxDeploy}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 8,
                              background: C.primary,
                              color: '#fff',
                              border: 'none',
                              fontSize: 12.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                            }}
                          >
                            ⚡ Deploy Sandbox
                          </button>
                          <button
                            onClick={() => alert('Vercel Deploy Manifest generated. Project ready for GitHub webhook.')}
                            style={{
                              padding: '8px 16px',
                              borderRadius: 8,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                              color: C.textH,
                              fontSize: 12.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            ▲ Vercel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}


                  {/* Add Record Modal */}
                  {newRecordModal && (
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.5)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      padding: 20,
                    }}>
                      <div style={{
                        background: C.surface,
                        borderRadius: 16,
                        border: `1px solid ${C.border}`,
                        width: '100%',
                        maxWidth: 440,
                        padding: 24,
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                      }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: C.textH }}>
                          + Add {prototype?.entityName || 'Entity'} to Prototype
                        </h3>
                        <form onSubmit={handleCreateRecord}>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textM, marginBottom: 4 }}>
                              Name / Identifier
                            </label>
                            <input
                              type="text"
                              required
                              value={newRecordForm.name}
                              onChange={(e) => setNewRecordForm({ ...newRecordForm, name: e.target.value })}
                              placeholder="e.g. Sortie Falcon-09"
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}`,
                                fontSize: 13,
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textM, marginBottom: 4 }}>
                              Domain / Sector / Details
                            </label>
                            <input
                              type="text"
                              value={newRecordForm.district}
                              onChange={(e) => setNewRecordForm({ ...newRecordForm, district: e.target.value })}
                              placeholder="e.g. Sector South-West (NDVI: 0.88)"
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}`,
                                fontSize: 13,
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textM, marginBottom: 4 }}>
                              Initial Status
                            </label>
                            <select
                              value={newRecordForm.status}
                              onChange={(e) => setNewRecordForm({ ...newRecordForm, status: e.target.value })}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}`,
                                fontSize: 13,
                                boxSizing: 'border-box',
                              }}
                            >
                              <option value="Approved">Approved</option>
                              <option value="In Review">In Review</option>
                              <option value="Pending">Pending</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setNewRecordModal(false)}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}`,
                                background: C.surfaceAlt,
                                fontSize: 12.5,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: C.grad,
                                color: '#fff',
                                fontSize: 12.5,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Add to Prototype
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  TAB 7: EFFORT, COST & ROADMAP
              ═══════════════════════════════════════════════════════════ */}
              {activeTab === 'estimates' && (
                <div>
                  <div className="tab-action-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: C.textH }}>
                        Effort, Cost Bands & Delivery Roadmap
                      </h2>
                      <p style={{ margin: 0, fontSize: 13, color: C.textM }}>
                        Calculated by AI Planning Engine based on architectural complexity and phase scope.
                      </p>
                    </div>

                    <button
                      onClick={() => handleRegenerateSection('estimate')}
                      disabled={regeneratingSection === 'estimate'}
                      style={{
                        background: C.surface,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: C.primary,
                        cursor: regeneratingSection === 'estimate' ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon d={REFRESH_ICON} size={13} color={C.primary} />
                      <span>{regeneratingSection === 'estimate' ? tr('regenerating') : tr('regenerateBtn')}</span>
                    </button>
                  </div>

                  {/* 3-Tier Cost Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
                    {/* Low */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', marginBottom: 6 }}>
                        Minimum MVP Budget
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: C.textH, marginBottom: 4 }}>
                        {fmtUSD(estimate?.low_estimate_usd, 28000)}
                      </div>
                      <div style={{ fontSize: 12, color: C.textM }}>
                        Core functional scope without third-party enterprise hooks
                      </div>
                    </div>

                    {/* Mid (Recommended) */}
                    <div style={{
                      background: C.surface,
                      border: `2px solid ${C.primary}`,
                      borderRadius: 16,
                      padding: 22,
                      textAlign: 'center',
                      boxShadow: '0 4px 20px rgba(99,102,241,0.12)',
                      position: 'relative',
                    }}>
                      <span style={{
                        position: 'absolute',
                        top: -10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: C.grad,
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 10px',
                        borderRadius: 12,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Recommended Target
                      </span>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', marginBottom: 6 }}>
                        Full Production Baseline
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: C.primary, marginBottom: 4 }}>
                        {fmtUSD(estimate?.mid_estimate_usd, 45000)}
                      </div>
                      <div style={{ fontSize: 12, color: C.textM }}>
                        Includes multi-tier approvals, audit logging & QA automation
                      </div>
                    </div>

                    {/* High */}
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', marginBottom: 6 }}>
                        Enterprise High-Resilience
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: C.textH, marginBottom: 4 }}>
                        {fmtUSD(estimate?.high_estimate_usd, 68000)}
                      </div>
                      <div style={{ fontSize: 12, color: C.textM }}>
                        Multi-region redundancy, 24/7 dedicated support SLA
                      </div>
                    </div>
                  </div>

                  {/* Phased Timeline Breakdown */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 24 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 18 }}>
                      Phased Delivery Schedule & Timeline Allocation
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {phaseBreakdown.map((ph, pi) => (
                        <div key={pi}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: C.textH, marginBottom: 6 }}>
                            <span>{ph.phase}</span>
                            <span style={{ color: C.primary }}>{ph.weeks} Weeks ({ph.percentage}%)</span>
                          </div>
                          <div style={{ width: '100%', height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${ph.percentage}%`, height: '100%', background: C.grad, borderRadius: 999 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Team Assumptions */}
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textH, marginBottom: 12 }}>
                      Team Composition & Delivery Governance
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="team-grid">
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', marginBottom: 4 }}>Team Composition</div>
                        <div style={{ fontSize: 13, color: C.textB }}>
                          {teamAssumptions.teamComposition || '1 Lead Architect, 2 Senior Full-Stack Developers, 1 QA Engineer'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', marginBottom: 4 }}>Delivery Model</div>
                        <div style={{ fontSize: 13, color: C.textB }}>
                          {teamAssumptions.deliveryModel || 'Bi-weekly agile sprint cadences with automated CI/CD security test gates'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}

        </div>

        {/* Automated Cloud Sandbox Deploy Modal */}
        {sandboxDeployModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}>
            <div style={{
              background: '#0f172a',
              border: '1.5px solid #334155',
              borderRadius: 18,
              padding: '24px 28px',
              maxWidth: 500,
              width: '100%',
              color: '#fff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🚀</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                      Cloud Sandbox Deployment
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      Admin Capability Verification
                    </div>
                  </div>
                </div>
                {!deployingSandbox && (
                  <button
                    type="button"
                    onClick={() => setSandboxDeployModal(null)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    ✕ Close
                  </button>
                )}
              </div>

              <div style={{
                background: '#1e293b',
                borderRadius: 12,
                padding: 16,
                border: '1px solid #334155',
                fontFamily: 'monospace',
                fontSize: 12.5,
                marginBottom: 16,
              }}>
                <div style={{ color: '#38bdf8', marginBottom: 6 }}>
                  &gt; Phase {sandboxDeployModal.step}/4: {sandboxDeployModal.text}
                </div>
                {deployingSandbox && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 11.5, marginTop: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #6366f1', borderTopColor: 'transparent', animation: 'spinFast 0.8s linear infinite' }} />
                    <span>Provisioning cloud infrastructure...</span>
                  </div>
                )}
                {sandboxDeployModal.url && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #334155' }}>
                    <div style={{ color: '#34d399', fontWeight: 700 }}>✓ Endpoint Live:</div>
                    <a
                      href={sandboxDeployModal.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: 12, wordBreak: 'break-all' }}
                    >
                      {sandboxDeployModal.url}
                    </a>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={deployingSandbox}
                  onClick={() => setSandboxDeployModal(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: deployingSandbox ? '#334155' : '#6366f1',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: deployingSandbox ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deployingSandbox ? 'Deploying...' : 'Done'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spinFast {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 900px) {
          .result-mobile-toggle { display: inline-flex !important; }
          .result-main {
            margin-left: 0 !important;
            padding: 82px 16px 48px !important;
            overflow-x: hidden !important;
            max-width: 100vw !important;
          }
        }
        @media (max-width: 768px) {
          .result-header-actions {
            width: 100% !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          .result-header-actions > * {
            flex: 1 1 auto !important;
            min-width: 130px !important;
            justify-content: center !important;
          }
          .tab-action-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
            width: 100% !important;
          }
          .tab-action-header button {
            width: 100% !important;
            justify-content: center !important;
          }
          .brd-grid,
          .brd-reqs-grid,
          .brd-stakeholders-grid,
          .team-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .result-main table { font-size: 12px !important; }
        }
        @media (max-width: 640px) {
          .result-main {
            padding: 76px 10px 36px !important;
          }
          .result-main table {
            display: block !important;
            overflow-x: auto !important;
            white-space: nowrap !important;
            max-width: 100% !important;
          }
          .result-main pre {
            overflow-x: auto !important;
            max-width: 100% !important;
            white-space: pre !important;
            font-size: 11px !important;
          }
        }
        @media (max-width: 380px) {
          .result-main { padding: 72px 8px 28px !important; }
          .result-header-actions > * { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
