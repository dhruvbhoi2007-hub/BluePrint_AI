import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import DashboardSidebar from '../components/layout/DashboardSidebar';
import { getStoredToken, getStoredUser, getStoredSidebarCollapsed, deductUserCredit, getUserCredits, getUserRole } from '../utils/cookieUtils';
import { getCurrentLanguage, t, useTranslation } from '../utils/i18n';

/* ─── Inline SVG Icons ─── */
function Icon({ d, size = 18, color = 'currentColor', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  );
}

const SEND_ICON = 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z';
const SPARK_ICON = 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83';
const CHECK_ICON = 'M20 6L9 17l-5-5';
const BOT_ICON = 'M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7zm4 4h.01M16 15h.01';
const USER_ICON = 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z';
const FILE_ICON = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6';
const EDIT_ICON = 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z';
const MENU_ICON = 'M4 6h16M4 12h16M4 18h16';

/* ─── Inline Markdown Formatter ─── */
function formatInline(str) {
  if (!str) return '';
  return str
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[11.5px] font-mono">$1</code>');
}

/* ─── Chat Markdown & Data Table Renderer ─── */
function ChatMarkdownRenderer({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let inTable = false;
  let tableHeader = [];
  let tableRows = [];
  let inCodeBlock = false;
  let codeBlockLines = [];

  const flushTable = (key) => {
    if (tableHeader.length > 0 || tableRows.length > 0) {
      elements.push(
        <div key={key} className="overflow-x-auto my-2.5 rounded-xl border border-slate-200/90 shadow-sm bg-white">
          <table className="w-full text-left border-collapse text-[12px]">
            {tableHeader.length > 0 && (
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200">
                  {tableHeader.map((h, i) => (
                    <th key={i} className="px-3 py-2 font-bold text-slate-800" dangerouslySetInnerHTML={{ __html: formatInline(h) }} />
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 border-t border-slate-100 text-slate-700" dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableHeader = [];
      tableRows = [];
      inTable = false;
    }
  };

  const flushCode = (key) => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre key={key} className="my-2 p-3 rounded-xl bg-slate-900 text-cyan-300 font-mono text-[12px] overflow-x-auto shadow-inner">
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      );
      codeBlockLines = [];
      inCodeBlock = false;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        flushCode(`code_${idx}`);
      } else {
        if (inTable) flushTable(`tbl_${idx}`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else {
      if (inTable) {
        flushTable(`tbl_${idx}`);
      }
    }

    if (!trimmed) {
      elements.push(<div key={`sp_${idx}`} className="h-1.5" />);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3_${idx}`} className="text-[13.5px] font-extrabold text-slate-900 mt-2 mb-1">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2_${idx}`} className="text-[14.5px] font-extrabold text-indigo-700 mt-2.5 mb-1">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1_${idx}`} className="text-[15.5px] font-extrabold text-slate-900 mt-3 mb-1.5">
          {trimmed.replace(/^#\s+/, '')}
        </h2>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={`li_${idx}`} className="flex items-start gap-2 pl-1.5 text-[13px] text-slate-700 leading-relaxed my-0.5">
          <span className="text-indigo-500 font-bold shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.replace(/^[-*]\s+/, '')) }} />
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+\.)\s/)[1];
      const rest = trimmed.replace(/^\d+\.\s+/, '');
      elements.push(
        <div key={`oli_${idx}`} className="flex items-start gap-2 pl-1.5 text-[13px] text-slate-700 leading-relaxed my-0.5">
          <span className="text-indigo-600 font-bold shrink-0">{num}</span>
          <span dangerouslySetInnerHTML={{ __html: formatInline(rest) }} />
        </div>
      );
    } else {
      elements.push(
        <p key={`p_${idx}`} className="m-0 text-[13px] text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
      );
    }
  }

  if (inTable) flushTable(`tbl_end`);
  if (inCodeBlock) flushCode(`code_end`);

  return <div className="space-y-1">{elements}</div>;
}

const QUICK_PROMPTS = [
  { icon: '📊', label: 'Tech Stack & Architecture', prompt: 'Generate a recommended tech stack and high-level architecture with rationale for this initiative.' },
  { icon: '📋', label: 'Functional Requirements', prompt: 'Generate the structured functional and non-functional requirements breakdown for this project.' },
  { icon: '🗄️', label: 'Database Schema & Tables', prompt: 'Generate the recommended database entity schema, primary keys, and relationships for this system.' },
  { icon: '⏱️', label: 'Timeline & Cost Estimate', prompt: 'Generate a realistic phase-by-phase project timeline in weeks and a 3-tier USD cost estimate for an MVP and enterprise build.' },
  { icon: '🛡️', label: 'Security & Compliance', prompt: 'What security controls, data protections, and regulatory compliance standards (HIPAA, SOC 2, PCI-DSS) apply here?' },
];

export default function DiscoveryChat() {
  const { id: paramSessionId } = useParams();
  const navigate = useNavigate();

  // Multilingual & RBAC State
  const { t, currentLanguage } = useTranslation();
  const [currentRole, setCurrentRole] = useState(() => getUserRole());
  useEffect(() => {
    const handleRole = (e) => setCurrentRole(e.detail?.role || getUserRole());
    window.addEventListener('role_changed', handleRole);
    return () => window.removeEventListener('role_changed', handleRole);
  }, []);
  const isViewer = currentRole === 'viewer';

  // User & Auth State
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return getStoredSidebarCollapsed();
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Active Session & All Available Sessions
  const [activeSessionId, setActiveSessionId] = useState(paramSessionId || null);
  const [allSessions, setAllSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [context, setContext] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState('');

  // Conversational Chat Thread
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [answeringQaId, setAnsweringQaId] = useState(null);
  const [draftAnswers, setDraftAnswers] = useState({});
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [isGeneratingChat, setIsGeneratingChat] = useState(false);

  // Quick Starter Input for Empty State
  const [starterTitle, setStarterTitle] = useState('Enterprise Transformation Blueprint');
  const [starterText, setStarterText] = useState('');
  const [startingSession, setStartingSession] = useState(false);

  // Parallel Blueprint Compilation State
  const [compiling, setCompiling] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationStage, setCompilationStage] = useState('');

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, answeringQaId]);

  // Initial Load: Check Auth and Resolve Session
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      navigate('/login');
      return;
    }
    setUser(getStoredUser());
    resolveAndLoadSession(token, paramSessionId);
  }, [paramSessionId, navigate]);

  // Smart Session Resolution
  const resolveAndLoadSession = async (token, targetId) => {
    setLoading(true);
    setErrorNotice('');

    try {
      const res = await fetch('http://localhost:5000/api/sessions', {
        headers: { Authorization: `Bearer ${token || getStoredToken()}` },
      });

      let sessionsList = [];
      if (res.ok) {
        const data = await res.json();
        sessionsList = data.sessions || [];
        setAllSessions(sessionsList);
      }

      let resolvedId = targetId;

      if (!resolvedId) {
        const lastRemembered = typeof localStorage !== 'undefined' ? localStorage.getItem('compile_last_session_id') : null;
        if (lastRemembered && sessionsList.some(s => s.id === lastRemembered)) {
          resolvedId = lastRemembered;
        } else if (sessionsList.length > 0) {
          const discoverySess = sessionsList.find(s => s.status === 'discovery');
          resolvedId = discoverySess ? discoverySess.id : sessionsList[0].id;
        }
      }

      if (resolvedId) {
        setActiveSessionId(resolvedId);
        await loadSessionDetails(token, resolvedId);
      } else {
        setSession(null);
        setLoading(false);
      }

    } catch (err) {
      console.error(err);
      setErrorNotice('Could not connect to backend server on port 5000.');
      setLoading(false);
    }
  };

  const loadSessionDetails = async (token, sessId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/sessions/${sessId}`, {
        headers: { Authorization: `Bearer ${token || getStoredToken()}` },
      });

      if (!res.ok) {
        throw new Error('Session not found or unavailable.');
      }

      const data = await res.json();
      setSession(data.session);
      setDocuments(data.documents || []);
      setContext(data.context || null);

      const qas = data.discoveryQas || [];
      setQuestions(qas);

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('compile_last_session_id', sessId);
        }
      } catch (e) { }

      const drafts = {};
      qas.forEach(q => {
        if (q.answer) drafts[q.id] = q.answer;
      });
      setDraftAnswers(drafts);

      buildInitialMessages(data.session, data.documents || [], qas, data.messages || []);

    } catch (err) {
      setErrorNotice(err.message || 'Error loading session details.');
    } finally {
      setLoading(false);
    }
  };

  const buildInitialMessages = (sess, docs, qas, dbMessages = []) => {
    if (dbMessages && dbMessages.length > 0) {
      const thread = dbMessages.map(m => ({
        id: m.id,
        sender: m.sender,
        timestamp: m.created_at,
        text: m.message_text,
      }));
      setMessages(thread);
      return;
    }

    const thread = [
      {
        id: 'welcome',
        sender: 'ai',
        timestamp: sess?.created_at || new Date().toISOString(),
        text: `Hello! I am your **AI Business Consultant & Solution Architect** (Chaos2Commit 2026).

I am reviewing your transformation blueprint: **"${sess?.title || 'Transformation Blueprint'}"**.

${docs.length > 0 ? `I have ingested ${docs.length} attached document(s): ${docs.map(d => d.file_name).join(', ')}.` : 'I have ingested your initial business goals and problem statement.'}

To produce an implementation-ready enterprise architecture and structured BRD, I have formulated **${qas.length || 5} clarifying discovery questions**. You can answer them below or converse directly with me.`,
      },
    ];
    setMessages(thread);
  };

  const handleCreateStarterSession = async (e) => {
    if (e) e.preventDefault();
    const token = getStoredToken();
    if (!token) return;

    setStartingSession(true);
    try {
      const res = await fetch('http://localhost:5000/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: starterTitle.trim() || 'Enterprise Cloud & Process Automation',
          initialText: starterText.trim() || 'Transform core enterprise workflows with automated AI processing, cloud microservices, and modern API integration.',
        }),
      });

      if (!res.ok) throw new Error('Failed to initialize session.');
      const data = await res.json();
      const newId = data.session.id;

      setActiveSessionId(newId);
      setAllSessions(prev => [data.session, ...prev]);
      await loadSessionDetails(token, newId);

    } catch (err) {
      alert(err.message || 'Error creating starter discovery session.');
    } finally {
      setStartingSession(false);
    }
  };

  const handleAnswerSubmit = async (qaId) => {
    if (isViewer) {
      alert('🔒 Access Restricted: Answering discovery questions is disabled in Viewer (Read-Only) mode. Switch your role to Developer or Admin in the navigation bar.');
      return;
    }
    const answerText = (draftAnswers[qaId] || '').trim();
    if (!answerText) return;

    const token = getStoredToken();
    if (!token) return;

    setSavingAnswer(true);
    try {
      const res = await fetch(`http://localhost:5000/api/sessions/qa/${qaId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answer: answerText }),
      });

      if (!res.ok) throw new Error('Could not save answer.');

      setQuestions(prev => prev.map(q => q.id === qaId ? { ...q, answer: answerText } : q));

      const matchedQ = questions.find(q => q.id === qaId);
      setMessages(prev => [
        ...prev,
        {
          id: 'user_' + Date.now(),
          sender: 'user',
          timestamp: new Date().toISOString(),
          text: `**[Re: ${matchedQ?.question || 'Discovery Question'}]**\n\n${answerText}`,
        },
        {
          id: 'ai_' + Date.now(),
          sender: 'ai',
          timestamp: new Date().toISOString(),
          text: 'Thank you. I have incorporated this constraint into the transformation context. It will directly inform our architectural tech stack and non-functional requirements.',
        }
      ]);

      setAnsweringQaId(null);
    } catch (err) {
      alert(err.message || 'Error recording answer.');
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleSendMessage = async (e, customPrompt) => {
    if (e && e.preventDefault) e.preventDefault();
    const text = (customPrompt || chatInput).trim();
    if (!text || !activeSessionId || isGeneratingChat) return;

    const token = getStoredToken();
    if (!token) return;

    const tempUserMsg = {
      id: 'usr_' + Date.now(),
      sender: 'user',
      timestamp: new Date().toISOString(),
      text,
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setChatInput('');
    setIsGeneratingChat(true);

    try {
      const res = await fetch(`http://localhost:5000/api/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.aiMessage) {
          setMessages(prev => [
            ...prev,
            {
              id: data.aiMessage.id,
              sender: data.aiMessage.sender,
              timestamp: data.aiMessage.createdAt || data.aiMessage.created_at,
              text: data.aiMessage.messageText || data.aiMessage.message_text,
            },
          ]);
        }
      } else {
        console.warn('Could not persist message to database.');
      }
    } catch (err) {
      console.error('Error in message exchange:', err);
    } finally {
      setIsGeneratingChat(false);
    }
  };

  const handleGenerateBlueprint = async () => {
    if (isViewer) {
      alert('🔒 Access Restricted: Compiling and generating blueprints is disabled in Viewer (Read-Only) mode. Switch your role to Developer or Admin in the navigation bar.');
      return;
    }
    const token = getStoredToken();
    if (!token || !activeSessionId) return;

    const availableCredits = getUserCredits();
    if (availableCredits <= 0) {
      alert('🪙 Insufficient Coins: Compiling an architecture blueprint costs 1 coin. You have 0 coins left. Redirecting to Pricing to recharge...');
      navigate('/pricing');
      return;
    }

    deductUserCredit(1);

    setCompiling(true);
    setCompilationProgress(15);
    setCompilationStage('Ingesting Discovery Q&A and Context Normalization...');

    try {
      const progressTimer = setInterval(() => {
        setCompilationProgress(p => {
          if (p < 40) {
            setCompilationStage('Business Analysis Engine: Formulating Executive BRD & FRs...');
            return p + 12;
          }
          if (p < 70) {
            setCompilationStage('Solution Architecture Builder: Designing HLD & Cloud Topology...');
            return p + 18;
          }
          if (p < 90) {
            setCompilationStage('AI Planning Engine: Computing Effort Estimates & Phase Schedules...');
            return p + 10;
          }
          return p;
        });
      }, 700);

      const res = await fetch(`http://localhost:5000/api/sessions/${activeSessionId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      clearInterval(progressTimer);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402 || errData.error === 'INSUFFICIENT_CREDITS') {
          alert('🪙 Insufficient Coins: You have 0 coins left. Redirecting to Pricing...');
          navigate('/pricing');
          return;
        }
        throw new Error(errData.message || 'Blueprint compilation failed.');
      }

      setCompilationProgress(100);
      setCompilationStage('✓ Transformation Blueprint Compiled Successfully!');

      setTimeout(() => {
        setCompiling(false);
        navigate(`/session/${activeSessionId}/result`);
      }, 800);

    } catch (err) {
      console.error(err);
      alert(err.message || 'Error generating blueprint.');
      setCompiling(false);
    }
  };

  const answeredCount = questions.filter(q => q.answer && q.answer.trim().length > 0).length;
  const totalQuestions = questions.length || 1;
  const completionPercentage = Math.round((answeredCount / totalQuestions) * 100);
  const isCompleted = session?.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      <style>{`@keyframes spinFast { to { transform: rotate(360deg); } }`}</style>

      {/* Ambient background glow — matches the sidebar's decorative blobs */}
      <div aria-hidden className="fixed top-[-120px] right-[-140px] w-[420px] h-[420px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)' }} />
      <div aria-hidden className="fixed bottom-[-160px] left-[-120px] w-[420px] h-[420px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)' }} />

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

      <main className={`relative z-10 transition-[margin-left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] px-3 sm:px-5 lg:px-7 pt-24 lg:pt-28 pb-10 box-border ${sidebarCollapsed ? 'lg:ml-[74px]' : 'lg:ml-[260px]'}`}>
        <div className="max-w-[1240px] mx-auto">

          {/* Mobile Sidebar Toggle */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 mb-4 px-3.5 py-2 rounded-xl bg-white/85 backdrop-blur-md border border-slate-200/80 text-indigo-600 text-[12.5px] font-bold cursor-pointer shadow-[0_2px_8px_rgba(99,102,241,0.08)]"
          >
            <Icon d={MENU_ICON} size={15} color="#6366f1" />
            Navigation & Pages
          </button>

          {/* ─── Loading State ─── */}
          {loading && (
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl px-6 py-16 text-center shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
              <div
                className="w-9 h-9 rounded-full mx-auto mb-4 border-[3px] border-indigo-100"
                style={{ borderTopColor: '#6366f1', animation: 'spinFast 0.8s linear infinite' }}
              />
              <h3 className="m-0 mb-1.5 text-[17px] font-bold text-slate-900">
                Loading Discovery Workspace...
              </h3>
              <p className="m-0 text-[13.5px] text-slate-500">
                Connecting to MySQL session & AI Business Consultant
              </p>
            </div>
          )}

          {/* ─── Empty State ─── */}
          {!loading && !session && (
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-[22px] p-6 sm:p-9 max-w-[680px] mx-auto text-center shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4.5">
                <Icon d={BOT_ICON} size={28} color="#6366f1" />
              </div>
              <h2 className="text-[21px] sm:text-[22px] font-extrabold m-0 mb-2.5 text-slate-900">
                Start Your AI Discovery Session
              </h2>
              <p className="text-[14px] text-slate-500 mx-auto mb-7 max-w-[480px] leading-relaxed">
                You don't have an active discovery session yet. Create your first transformation initiative to engage with the AI Business Consultant.
              </p>

              <form onSubmit={handleCreateStarterSession} className="text-left bg-slate-50/80 p-5 sm:p-5.5 rounded-2xl border border-slate-200/70">
                <div className="mb-3.5">
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                    Blueprint Project Title
                  </label>
                  <input
                    type="text"
                    value={starterTitle}
                    onChange={e => setStarterTitle(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-slate-200 text-[14px] box-border outline-none transition-colors focus:border-indigo-400"
                  />
                </div>

                <div className="mb-4.5">
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                    Initial Problem Statement / Goals
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Briefly describe what you want to automate or modernize..."
                    value={starterText}
                    onChange={e => setStarterText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-slate-200 text-[13.5px] box-border outline-none resize-y transition-colors focus:border-indigo-400"
                  />
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/session/new')}
                    className="bg-transparent border-none text-indigo-600 text-[13px] font-semibold cursor-pointer p-0"
                  >
                    Or use full multi-format intake (SOP / PDF upload) →
                  </button>

                  <button
                    type="submit"
                    disabled={startingSession}
                    className={`flex items-center gap-2 text-white border-none px-5 py-2.5 rounded-xl font-bold text-[13.5px] shadow-[0_4px_14px_rgba(99,102,241,0.35)] transition-all duration-200 ${startingSession ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-br from-indigo-500 to-cyan-500 cursor-pointer hover:-translate-y-0.5'}`}
                  >
                    <Icon d={SPARK_ICON} size={15} color="#fff" />
                    <span>{startingSession ? 'Initializing...' : 'Launch Discovery Chat →'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─── Active Session Loaded: Discovery Chat Workspace ─── */}
          {!loading && session && (
            <>
              {/* Header Bar with Session Switcher */}
              <div className="flex items-center justify-between flex-wrap gap-4 bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl px-5 sm:px-6 py-4.5 mb-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-1 flex-wrap">
                    <span className="cursor-pointer text-indigo-600 font-semibold" onClick={() => navigate('/dashboard')}>
                      Dashboard
                    </span>
                    <span>/</span>
                    <span>Blueprints</span>
                    <span>/</span>
                    <span className="text-slate-600 font-semibold">Stage 2: AI Discovery Q&A</span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {allSessions.length > 1 ? (
                      <select
                        value={activeSessionId || ''}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setActiveSessionId(newId);
                          navigate(`/session/${newId}`);
                          loadSessionDetails(getStoredToken(), newId);
                        }}
                        className="text-[17px] sm:text-[18px] font-extrabold text-slate-900 border border-slate-200/80 rounded-lg px-2.5 py-1 bg-white cursor-pointer max-w-full w-full sm:w-auto"
                      >
                        {allSessions.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.title} ({s.status})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <h1 className="text-[20px] sm:text-[22px] font-extrabold text-slate-900 m-0 break-words max-w-full">
                        {session.title}
                      </h1>
                    )}

                    <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border tracking-[0.2px] whitespace-nowrap ${isCompleted ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                      {isCompleted ? '✓ Compiled & Ready' : '⏳ In Discovery Q&A'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                  <button
                    onClick={() => navigate('/session/new')}
                    className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap transition-colors hover:bg-white hover:border-slate-300"
                  >
                    + New Blueprint
                  </button>

                  {isCompleted && (
                    <button
                      onClick={() => navigate(`/session/${activeSessionId}/result`)}
                      className="inline-flex items-center gap-2 bg-gradient-to-br from-indigo-500 to-cyan-500 text-white border-none px-4.5 py-2.5 rounded-xl font-bold text-[13.5px] cursor-pointer whitespace-nowrap shadow-[0_4px_14px_rgba(99,102,241,0.3)] transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <Icon d={CHECK_ICON} size={15} color="#fff" />
                      <span>View Solution Blueprint →</span>
                    </button>
                  )}

                  <button
                    onClick={() => navigate(`/session/${activeSessionId}/generating`)}
                    className={[
                      'inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl font-bold text-[13.5px] cursor-pointer whitespace-nowrap transition-all duration-200',
                      isCompleted
                        ? 'bg-white border border-slate-200/80 text-slate-700 hover:bg-slate-50'
                        : 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-white border-none shadow-[0_4px_14px_rgba(99,102,241,0.3)] hover:-translate-y-0.5',
                    ].join(' ')}
                  >
                    <Icon d={SPARK_ICON} size={15} color={isCompleted ? '#6366f1' : '#fff'} />
                    <span>{isCompleted ? 'Re-Compile' : 'Compile Solution Blueprint →'}</span>
                  </button>
                </div>
              </div>

              {/* Two-Column Discovery Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

                {/* Left: Chat & Question Cards */}
                <div className="flex flex-col bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-[22px] shadow-[0_4px_16px_rgba(15,23,42,0.04)] overflow-hidden h-auto lg:h-[calc(100vh-240px)] min-h-[480px] lg:min-h-[620px]">
                  {/* Chat Subheader */}
                  <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 border-b border-slate-200/70 bg-slate-50/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0">
                        <Icon d={BOT_ICON} size={15} color="#fff" />
                      </div>
                      <div>
                        <div className="text-[13.5px] font-bold text-slate-900">
                          AI Business Consultant (Chaos2Commit 2026)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Validating requirements & architecture trade-offs
                        </div>
                      </div>
                    </div>

                    <div className="text-[12px] font-semibold text-indigo-600 whitespace-nowrap">
                      {answeredCount} of {totalQuestions} Clarified ({completionPercentage}%)
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 p-4 sm:p-5 overflow-y-auto flex flex-col gap-4.5">
                    {messages.map((m) => {
                      const isAi = m.sender === 'ai';
                      return (
                        <div key={m.id} className={`flex gap-3 items-start ${isAi ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAi ? 'bg-gradient-to-br from-indigo-500 to-cyan-500' : 'bg-indigo-50'}`}>
                            {isAi ? <Icon d={BOT_ICON} size={16} color="#fff" /> : <Icon d={USER_ICON} size={16} color="#4f46e5" />}
                          </div>

                          <div className={`max-w-[85%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed shadow-[0_1px_4px_rgba(15,23,42,0.03)] border ${isAi ? 'bg-slate-50/90 border-slate-200/70 text-slate-800' : 'bg-indigo-50/90 border-indigo-200/70 text-slate-700'}`}>
                            {isAi ? <ChatMarkdownRenderer text={m.text} /> : <div className="whitespace-pre-line">{m.text}</div>}
                          </div>
                        </div>
                      );
                    })}

                    {/* AI Generating Thinking Indicator */}
                    {isGeneratingChat && (
                      <div className="flex gap-3 items-start flex-row animate-pulse">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500 to-cyan-500">
                          <Icon d={BOT_ICON} size={16} color="#fff" />
                        </div>
                        <div className="rounded-2xl px-4 py-3 text-[13px] bg-indigo-50/80 border border-indigo-200/90 text-indigo-700 flex items-center gap-2.5 shadow-sm">
                          <div className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0" />
                          <span className="font-medium">AI Consultant is searching dataset and synthesizing technical specifications...</span>
                        </div>
                      </div>
                    )}

                    {/* Question Cards */}
                    {questions.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-3.5">
                        <div className="flex items-center gap-2 text-[11.5px] font-bold text-slate-400 uppercase tracking-[0.04em]">
                          <Icon d={SPARK_ICON} size={13} color="#6366f1" />
                          Consultant Discovery Cards ({questions.length})
                        </div>

                        {questions.map((q, idx) => {
                          const hasAnswer = q.answer && q.answer.trim().length > 0;
                          const isEditing = answeringQaId === q.id;

                          return (
                            <div
                              key={q.id || idx}
                              className={`rounded-2xl p-4 sm:p-4.5 border-[1.5px] shadow-[0_2px_8px_rgba(15,23,42,0.03)] ${hasAnswer ? 'bg-slate-50/70 border-emerald-200' : 'bg-white border-indigo-100'}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className={`w-[22px] h-[22px] rounded-full text-white flex items-center justify-center text-[11px] font-extrabold shrink-0 ${hasAnswer ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                                    {hasAnswer ? '✓' : idx + 1}
                                  </span>
                                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${hasAnswer ? 'text-emerald-700 bg-emerald-50' : 'text-indigo-700 bg-indigo-50'}`}>
                                    {q.category || 'Architecture & Scope'}
                                  </span>
                                </div>

                                {hasAnswer && !isEditing && (
                                  <button
                                    onClick={() => setAnsweringQaId(q.id)}
                                    className="bg-transparent border-none text-indigo-600 text-[12px] font-semibold cursor-pointer flex items-center gap-1 p-0"
                                  >
                                    <Icon d={EDIT_ICON} size={13} color="#6366f1" /> Edit
                                  </button>
                                )}
                              </div>

                              <h3 className="text-[14px] font-bold text-slate-900 m-0 mb-2 leading-snug">
                                {q.question}
                              </h3>

                              {q.rationale && (
                                <p className="text-[12px] text-slate-400 m-0 mb-2.5">
                                  💡 <em>Why this matters:</em> {q.rationale}
                                </p>
                              )}

                              {hasAnswer && !isEditing && (
                                <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-3.5 py-2.5 text-[13px] text-emerald-800 leading-relaxed">
                                  <strong>Your Input:</strong> {q.answer}
                                </div>
                              )}

                              {(!hasAnswer || isEditing) && (
                                <div className="mt-2.5">
                                  <textarea
                                    rows={3}
                                    placeholder="Type your answer, requirements, or constraints..."
                                    value={draftAnswers[q.id] || ''}
                                    onChange={e => setDraftAnswers({ ...draftAnswers, [q.id]: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] text-slate-900 outline-none box-border font-inherit resize-y transition-colors focus:border-indigo-400"
                                  />
                                  <div className="flex justify-end gap-2 mt-2">
                                    {isEditing && (
                                      <button
                                        type="button"
                                        onClick={() => setAnsweringQaId(null)}
                                        className="bg-transparent border border-slate-200 rounded-lg px-3 py-1.5 text-[12px] text-slate-500 cursor-pointer transition-colors hover:bg-slate-50"
                                      >
                                        Cancel
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleAnswerSubmit(q.id)}
                                      disabled={savingAnswer || !(draftAnswers[q.id] || '').trim()}
                                      className={`flex items-center gap-1.5 text-white border-none rounded-lg px-4 py-1.5 text-[12.5px] font-bold transition-colors ${!(draftAnswers[q.id] || '').trim() ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 cursor-pointer hover:bg-indigo-700'}`}
                                    >
                                      <Icon d={CHECK_ICON} size={13} color="#fff" />
                                      <span>Save Clarification</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  {/* Quick Data Action Chips */}
                  <div className="px-3.5 py-2 bg-slate-50/80 border-t border-slate-200/70 overflow-x-auto flex items-center gap-1.5 no-scrollbar">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                      <Icon d={SPARK_ICON} size={12} color="#6366f1" /> Ask Data:
                    </span>
                    {QUICK_PROMPTS.map((qp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(null, qp.prompt)}
                        disabled={isGeneratingChat}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200/90 text-[11.5px] font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                      >
                        <span>{qp.icon}</span>
                        <span>{qp.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Freeform Message Input Bar */}
                  <form
                    onSubmit={(e) => handleSendMessage(e)}
                    className="flex items-center gap-2.5 px-4 sm:px-4.5 py-3 border-t border-slate-200/70 bg-white/95"
                  >
                    <input
                      type="text"
                      placeholder={isGeneratingChat ? "Consultant is synthesizing technical data..." : "Ask your AI Consultant questions (e.g. 'Generate tech stack', 'Database schema', 'MVP cost')..."}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      disabled={isGeneratingChat}
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border-[1.5px] border-slate-200 text-[13.5px] text-slate-900 outline-none bg-slate-50/80 transition-colors focus:border-indigo-400 disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isGeneratingChat}
                      className={`w-10 h-10 shrink-0 rounded-xl border-none flex items-center justify-center transition-all duration-200 ${chatInput.trim() && !isGeneratingChat ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-white cursor-pointer hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 cursor-default'}`}
                    >
                      <Icon d={SEND_ICON} size={16} />
                    </button>
                  </form>
                </div>

                {/* Right: Readiness Rail */}
                <div className="flex flex-col gap-5">
                  <div className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-5.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-[15px] font-extrabold m-0 text-slate-900">
                        Discovery Readiness
                      </h2>
                      <span className="text-[13px] font-extrabold text-indigo-600">
                        {completionPercentage}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3.5">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-400 ease-out"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>

                    <p className="text-[12.5px] text-slate-500 leading-relaxed m-0 mb-4">
                      {completionPercentage < 60
                        ? 'Answer key questions to eliminate ambiguity before compiling the solution architecture and BRD.'
                        : 'High discovery fidelity achieved! The AI engine has enough context to formulate high-confidence blueprints.'}
                    </p>

                    <button
                      onClick={handleGenerateBlueprint}
                      disabled={compiling}
                      className={`w-full flex items-center justify-center gap-2 text-white border-none py-3 rounded-xl font-bold text-[13.5px] shadow-[0_4px_14px_rgba(99,102,241,0.3)] transition-all duration-200 ${compiling ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-br from-indigo-500 to-cyan-500 cursor-pointer hover:-translate-y-0.5'}`}
                    >
                      <Icon d={SPARK_ICON} size={15} color="#fff" />
                      <span>{compiling ? 'Compiling Blueprint...' : 'Compile Solution Blueprint'}</span>
                    </button>
                  </div>

                  {/* Ingested Documents */}
                  <div className="bg-white/90 backdrop-blur-xl border border-slate-200/70 rounded-2xl p-5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-bold text-slate-900 m-0 flex items-center gap-1.5">
                        <Icon d={FILE_ICON} size={16} color="#6366f1" />
                        Attached Context Documents
                      </h3>
                      <span className="text-[11.5px] font-bold text-slate-400">
                        {documents.length}
                      </span>
                    </div>

                    {documents.length === 0 ? (
                      <p className="text-[12.5px] text-slate-400 m-0">
                        No files attached. Initial prompt text is active as source material.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {documents.map((d, i) => (
                          <div
                            key={d.id || i}
                            className="flex items-center justify-between gap-2 bg-slate-50/80 border border-slate-200/70 rounded-lg px-3 py-2 text-[12.5px]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon d={FILE_ICON} size={14} color="#6366f1" />
                              <span className="font-semibold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap">
                                {d.file_name}
                              </span>
                            </div>
                            <span className="text-[10.5px] text-emerald-600 font-bold shrink-0">
                              Parsed
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </main>

      {/* Parallel Compilation Modal Overlay */}
      {compiling && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-md z-[2000] flex items-center justify-center p-5">
          <div className="bg-white/95 backdrop-blur-xl rounded-[22px] px-7 sm:px-8 py-8 sm:py-9 max-w-[480px] w-full text-center shadow-[0_24px_64px_rgba(15,23,42,0.25)] border border-slate-200/70">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 mx-auto mb-4.5 flex items-center justify-center shadow-[0_6px_20px_rgba(99,102,241,0.4)]">
              <Icon d={SPARK_ICON} size={26} color="#fff" />
            </div>

            <h2 className="text-[20px] font-extrabold text-slate-900 m-0 mb-2">
              Compiling Transformation Blueprint
            </h2>
            <p className="text-[13.5px] text-slate-500 m-0 mb-5 leading-relaxed">
              {compilationStage}
            </p>

            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-400 ease-out"
                style={{ width: `${compilationProgress}%` }}
              />
            </div>

            <div className="flex justify-between text-[12px] text-slate-400 font-semibold">
              <span>Parallel Multi-Agent Synthesis</span>
              <span>{compilationProgress}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}