import { SessionModel } from '../models/Session.js';
import { UserModel } from '../models/User.js';
import { InputDocumentModel } from '../models/InputDocument.js';
import { BusinessContextModel } from '../models/BusinessContext.js';
import { DiscoveryQaModel } from '../models/DiscoveryQa.js';
import { BrdModel } from '../models/Brd.js';
import { SolutionArchitectureModel } from '../models/SolutionArchitecture.js';
import { EffortEstimateModel } from '../models/EffortEstimate.js';
import { SessionVersionModel } from '../models/SessionVersion.js';
import { SessionMessageModel } from '../models/SessionMessage.js';

import { documentParser } from '../services/ingestion/documentParser.js';
import { contextNormalizer } from '../services/ingestion/contextNormalizer.js';
import { discoveryEngine } from '../services/ai/discoveryEngine.js';
import { businessAnalysis } from '../services/ai/businessAnalysis.js';
import { solutionArchitecture } from '../services/ai/solutionArchitecture.js';
import { estimation } from '../services/ai/estimation.js';
import { llmClient } from '../services/ai/llmClient.js';
import { inputAnalyzer } from '../services/ai/inputAnalyzer.js';
import { compileAiClient } from '../services/ai/compileAiClient.js';
import { wireframeGenerator } from '../services/ai/wireframeGenerator.js';
import { prototypeGenerator } from '../services/ai/prototypeGenerator.js';

export const sessionController = {
  // 1. List user sessions
  async listSessions(req, res, next) {
    try {
      const workspaceId = req.user.workspaceId;
      const sessions = await SessionModel.findByWorkspaceId(workspaceId);
      res.json({ success: true, sessions });
    } catch (err) {
      next(err);
    }
  },

  // 2. Create new session (Costs 1 Coin per generation)
  async createSession(req, res, next) {
    try {
      // 0. Enforce 1 Coin per Generation
      const userCredits = await UserModel.getCredits(req.user.userId);
      if (userCredits < 1) {
        return res.status(402).json({
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message: 'You have used all your coins (0 coins available). Please recharge on the Pricing page to generate blueprints.',
          redirect: '/pricing',
          currentCredits: userCredits,
        });
      }

      const { title = 'New Transformation Blueprint', initialText = '', userLanguage = 'English' } = req.body;
      const session = await SessionModel.create({
        workspaceId: req.user.workspaceId,
        userId: req.user.userId,
        title,
      });

      let initialSummary = '';
      if (initialText && initialText.trim()) {
        const validation = await inputAnalyzer.validateInput(initialText.trim());
        if (!validation.isValid) {
          // Clean up the created empty session draft since input failed validation
          await SessionModel.delete(session.id);
          return res.status(422).json({
            success: false,
            isValid: false,
            message: 'Input is not a valid Standard Operating Procedure (SOP) or Business Requirements Document (BRD). Please provide an operational workflow, business pain points, or an existing SOP/PRD.',
            validation,
          });
        }

        await InputDocumentModel.create({
          sessionId: session.id,
          fileName: 'initial_notes.txt',
          fileType: 'text',
          parsedText: initialText.trim(),
        });
        const norm = contextNormalizer.normalize({ rawText: initialText.trim() });
        const context = await BusinessContextModel.upsert({
          sessionId: session.id,
          ...norm,
        });
        const questions = await discoveryEngine.generateQuestions(initialText.trim(), context, userLanguage);
        await DiscoveryQaModel.bulkCreate(session.id, questions);
        await SessionModel.updateStatus(session.id, 'discovery');
        session.status = 'discovery';
        initialSummary = initialText.trim().slice(0, 140);
      }

      // Deduct 1 coin atomically from MySQL
      const deduction = await UserModel.deductCredit(req.user.userId, 1);

      res.status(201).json({
        success: true,
        remainingCredits: deduction.remainingCredits,
        session: {
          ...session,
          summary: initialSummary || 'Fresh blueprint session initialized.',
          tags: session.status === 'discovery' ? ['0/5 Questions Answered', 'Discovery Q&A'] : ['Draft Intake'],
          version: 1,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 3. Add input text or file to session (FR-1)
  async addInput(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const { text, fileType = 'text', fileName = 'input.txt', userLanguage = 'English' } = req.body;

      let parsedText = text || '';
      if (req.file) {
        parsedText = await documentParser.parse({
          buffer: req.file.buffer,
          fileType: req.file.mimetype,
          fileName: req.file.originalname,
        });
      }

      // Validate input text with LLM
      if (parsedText && parsedText.trim()) {
        const validation = await inputAnalyzer.validateInput(parsedText.trim());
        if (!validation.isValid) {
          return res.status(422).json({
            success: false,
            isValid: false,
            message: 'The submitted document or text is not a valid SOP or Business Requirements Document.',
            validation,
          });
        }
      }

      // Save input document
      const doc = await InputDocumentModel.create({
        sessionId,
        fileName: req.file ? req.file.originalname : fileName,
        fileType: req.file ? req.file.mimetype : fileType,
        parsedText,
      });

      // Update business context
      const allText = await InputDocumentModel.getAllParsedText(sessionId);
      const norm = contextNormalizer.normalize({ rawText: allText });
      const context = await BusinessContextModel.upsert({
        sessionId,
        ...norm,
      });

      // Generate clarifying discovery questions only if not already initialized
      const existingQas = await DiscoveryQaModel.findBySessionId(sessionId);
      let createdQas = existingQas;
      if (!existingQas || existingQas.length === 0) {
        const questions = await discoveryEngine.generateQuestions(allText, context, userLanguage);
        createdQas = await DiscoveryQaModel.bulkCreate(sessionId, questions);
      }

      await SessionModel.updateStatus(sessionId, 'discovery');

      res.json({
        success: true,
        document: doc,
        context,
        discoveryQuestions: createdQas,
      });
    } catch (err) {
      next(err);
    }
  },

  // 4. Answer a discovery question (FR-2.3)
  async answerDiscovery(req, res, next) {
    try {
      const { qaId } = req.params;
      const { answer } = req.body;
      await DiscoveryQaModel.answer(qaId, answer);
      res.json({ success: true, message: 'Answer recorded.' });
    } catch (err) {
      next(err);
    }
  },

  // 5. Generate Blueprint (Runs BRD, Architecture, and Estimate in parallel) (FR-3, FR-4, FR-5)
  async generateBlueprint(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const { userLanguage = 'English' } = req.body || {};
      const session = await SessionModel.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      await SessionModel.updateStatus(sessionId, 'generating');

      const rawInput = await InputDocumentModel.getAllParsedText(sessionId);
      const context = await BusinessContextModel.findBySessionId(sessionId);
      const qas = await DiscoveryQaModel.findBySessionId(sessionId);

      // Execute AI generation in parallel for maximum speed (<30s NFR)
      const [brdData, archData, estData] = await Promise.all([
        businessAnalysis.generateBrd({ rawInput, context, answeredQa: qas, userLanguage }),
        solutionArchitecture.generateArchitecture({ brd: {}, context, rawInput, sessionTitle: session.title, userLanguage }),
        estimation.generateEstimate({ brd: {}, architecture: {}, rawInput, context, discoveryAnswers: qas, userLanguage }),
      ]);

      // Persist generated records to MySQL
      const brd = await BrdModel.upsert({ sessionId, ...brdData });
      const architecture = await SolutionArchitectureModel.upsert({ sessionId, ...archData });
      const estimate = await EffortEstimateModel.upsert({ sessionId, ...estData });

      // Save version snapshot (FR-6.4)
      await SessionVersionModel.create({
        sessionId,
        changedSection: 'full_generation',
        snapshotData: { brd, architecture, estimate },
      });

      await SessionModel.updateStatus(sessionId, 'completed');

      res.json({
        success: true,
        message: 'Blueprint generated successfully.',
        brd,
        architecture,
        estimate,
      });
    } catch (err) {
      next(err);
    }
  },

  // 6. Regenerate single section (Costs 1 Coin per generation)
  async regenerateSection(req, res, next) {
    try {
      const userCredits = await UserModel.getCredits(req.user.userId);
      if (userCredits < 1) {
        return res.status(402).json({
          success: false,
          error: 'INSUFFICIENT_CREDITS',
          message: 'You have used all your coins. Please recharge on the Pricing page to regenerate sections.',
          redirect: '/pricing',
          currentCredits: userCredits,
        });
      }

      const { id: sessionId, section } = req.params; // section = 'brd' | 'architecture' | 'estimate'
      const { userLanguage = 'English' } = req.body || {};
      const rawInput = await InputDocumentModel.getAllParsedText(sessionId);
      const context = await BusinessContextModel.findBySessionId(sessionId);

      let updated = null;
      if (section === 'brd') {
        const data = await businessAnalysis.generateBrd({ rawInput, context, userLanguage });
        updated = await BrdModel.upsert({ sessionId, ...data });
      } else if (section === 'architecture') {
        const brd = await BrdModel.findBySessionId(sessionId);
        const data = await solutionArchitecture.generateArchitecture({ brd, context, rawInput, userLanguage });
        updated = await SolutionArchitectureModel.upsert({ sessionId, ...data });
      } else if (section === 'wireframes') {
        const session = await SessionModel.findById(sessionId);
        const wireframeData = await wireframeGenerator.generateWireframes({
          rawInput,
          sessionTitle: session?.title || '',
          context,
          userLanguage,
        });
        updated = await SolutionArchitectureModel.updateWireframes(sessionId, wireframeData);
      } else if (section === 'prototype') {
        const session = await SessionModel.findById(sessionId);
        const prototypeData = await prototypeGenerator.generatePrototype({
          rawInput,
          sessionTitle: session?.title || '',
          context,
          userLanguage,
        });
        updated = await SolutionArchitectureModel.updatePrototype(sessionId, prototypeData);
      } else if (section === 'estimate') {
        const brd = await BrdModel.findBySessionId(sessionId);
        const arch = await SolutionArchitectureModel.findBySessionId(sessionId);
        const qas = await DiscoveryQaModel.findBySessionId(sessionId);
        const data = await estimation.generateEstimate({ brd, architecture: arch, rawInput, context, discoveryAnswers: qas, userLanguage });
        updated = await EffortEstimateModel.upsert({ sessionId, ...data });
      } else {
        return res.status(400).json({ success: false, message: 'Invalid section' });
      }

      await SessionVersionModel.create({
        sessionId,
        changedSection: `regenerate_${section}`,
        snapshotData: { section, data: updated },
      });

      const deduction = await UserModel.deductCredit(req.user.userId, 1);
      res.json({ success: true, section, data: updated, remainingCredits: deduction.remainingCredits });
    } catch (err) {
      next(err);
    }
  },

  // 7. Get full session details
  async getSessionDetails(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const [session, docs, context, qas, brd, architecture, estimate, versions, messages] = await Promise.all([
        SessionModel.findById(sessionId),
        InputDocumentModel.findBySessionId(sessionId),
        BusinessContextModel.findBySessionId(sessionId),
        DiscoveryQaModel.findBySessionId(sessionId),
        BrdModel.findBySessionId(sessionId),
        SolutionArchitectureModel.findBySessionId(sessionId),
        EffortEstimateModel.findBySessionId(sessionId),
        SessionVersionModel.findBySessionId(sessionId),
        SessionMessageModel.findBySessionId(sessionId),
      ]);

      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }

      res.json({
        success: true,
        session,
        documents: docs,
        context,
        discoveryQas: qas,
        brd,
        architecture,
        estimate,
        versions,
        messages: messages || [],
      });
    } catch (err) {
      next(err);
    }
  },

  // 8. Get session version history
  async getVersions(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const versions = await SessionVersionModel.findBySessionId(sessionId);
      res.json({ success: true, versions });
    } catch (err) {
      next(err);
    }
  },

  // 9. Restore session version snapshot (Rollback)
  async restoreVersion(req, res, next) {
    try {
      const { id: sessionId, versionId } = req.params;
      const version = await SessionVersionModel.findById(versionId);
      if (!version) {
        return res.status(404).json({ success: false, message: 'Version snapshot not found' });
      }

      const snap = version.snapshot_data || {};
      let restoredBrd = null;
      let restoredArch = null;
      let restoredEst = null;

      if (snap.brd) {
        restoredBrd = await BrdModel.upsert({ sessionId, ...snap.brd });
      }
      if (snap.architecture) {
        restoredArch = await SolutionArchitectureModel.upsert({ sessionId, ...snap.architecture });
      }
      if (snap.estimate) {
        restoredEst = await EffortEstimateModel.upsert({ sessionId, ...snap.estimate });
      }

      if (snap.section && snap.data) {
        if (snap.section === 'brd') {
          restoredBrd = await BrdModel.upsert({ sessionId, ...snap.data });
        } else if (snap.section === 'architecture') {
          restoredArch = await SolutionArchitectureModel.upsert({ sessionId, ...snap.data });
        } else if (snap.section === 'estimate') {
          restoredEst = await EffortEstimateModel.upsert({ sessionId, ...snap.data });
        }
      }

      const newVersion = await SessionVersionModel.create({
        sessionId,
        changedSection: `rollback_v${version.version_number}`,
        snapshotData: {
          brd: restoredBrd || (await BrdModel.findBySessionId(sessionId)),
          architecture: restoredArch || (await SolutionArchitectureModel.findBySessionId(sessionId)),
          estimate: restoredEst || (await EffortEstimateModel.findBySessionId(sessionId)),
        },
      });

      res.json({
        success: true,
        message: `Successfully restored blueprint to Version ${version.version_number}.0`,
        restoredVersionNumber: version.version_number,
        newVersionNumber: newVersion.versionNumber,
        brd: restoredBrd,
        architecture: restoredArch,
        estimate: restoredEst,
      });
    } catch (err) {
      next(err);
    }
  },

  // 8. Delete session
  async deleteSession(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      await SessionModel.delete(sessionId);
      res.json({ success: true, message: 'Session deleted successfully.' });
    } catch (err) {
      next(err);
    }
  },

  // 9. Get session chat history from MySQL memory
  async getSessionMessages(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const messages = await SessionMessageModel.findBySessionId(sessionId);
      res.json({ success: true, messages });
    } catch (err) {
      next(err);
    }
  },

  // 10. Post message & generate rich data / AI consultation response with database memory storage
  // 10. Post message & generate rich data / AI consultation response with database memory storage
  async postSessionMessage(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const { text, userLanguage = 'English' } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'Message text is required' });
      }

      // 1. Save user message to MySQL database memory
      const userMessage = await SessionMessageModel.create({
        sessionId,
        sender: 'user',
        messageText: text.trim(),
      });

      // 2. Load transformation context for grounded AI data generation
      const [session, context, docs, qas, pastMessages] = await Promise.all([
        SessionModel.findById(sessionId),
        BusinessContextModel.findBySessionId(sessionId),
        InputDocumentModel.findBySessionId(sessionId),
        DiscoveryQaModel.findBySessionId(sessionId),
        SessionMessageModel.findBySessionId(sessionId),
      ]);

      const discoveryAnswers = {};
      (qas || []).forEach((q) => {
        if (q.answer && q.answer.trim()) {
          discoveryAnswers[q.question] = q.answer.trim();
        }
      });

      const conversationHistory = (pastMessages || []).slice(-8).map((m) => ({
        sender: m.sender,
        text: m.message_text || m.messageText || '',
      }));

      const rawInputText = (docs || []).map((d) => d.parsed_text).filter(Boolean).join('\n\n') || context?.raw_summary || '';

      // 3. Primary AI Generation: Call Python Compile AI Engine with Gemini & 105,500-row Dataset AFC
      let aiResponseText = null;
      try {
        const chatResult = await compileAiClient.consultantChat({
          message: text.trim(),
          sessionTitle: session?.title || 'Enterprise Transformation Blueprint',
          rawInputText,
          contextGoals: context?.goals || '',
          contextConstraints: context?.constraints_text || '',
          discoveryAnswers,
          conversationHistory,
          userLanguage: userLanguage || 'English',
        });
        if (chatResult && chatResult.reply) {
          aiResponseText = chatResult.reply;
        }
      } catch (compileErr) {
        console.warn('[DiscoveryChat] Compile AI Python chat error, trying multi-LLM fallback:', compileErr.message);
      }

      // 4. Secondary Fallback: Multi-LLM Client (Gemini REST)
      if (!aiResponseText) {
        const langInstruction = (userLanguage && userLanguage !== 'English' && userLanguage !== 'en')
          ? `\n\nCRITICAL MULTILINGUAL INSTRUCTION:\nThe client's selected language or message language is: ${userLanguage}.\nYou MUST reply and generate your entire architectural guidance in ${userLanguage}! Technical terms like React, Node.js, PostgreSQL can stay in English, but all explanations, advice, and Markdown headers must be in ${userLanguage}.`
          : `\n\nCRITICAL MULTILINGUAL INSTRUCTION:\nDetect the user's message language. If the user writes in Hindi (हिंदी), Gujarati (ગુજરાતી), Spanish, or any other language, you MUST reply in that exact same language!`;

        const systemPrompt = `You are Compile AI, an elite Principal Enterprise Solution Architect and Senior Business Analyst conducting an interactive discovery consultation.
Initiative: "${session?.title || 'Transformation Blueprint'}"
Context:
- Goals: ${context?.goals || 'Enterprise digital transformation'}
- Constraints: ${context?.constraints_text || 'Standard cloud enterprise architecture'}
- Documents: ${(docs || []).map((d) => d.file_name).join(', ') || 'Initial brief'}
- Answered Discovery: ${Object.entries(discoveryAnswers).map(([q, a]) => `Q: ${q} -> A: ${a}`).join('; ')}

Instructions:
The client is asking for specific advice, data, architecture, requirements, or analysis outside the fixed discovery questions.
CRITICAL: You MUST directly base your generated analysis, specifications, numbers, and recommendations on ALL the data the client has already provided in Context, Documents, and Answered Discovery!
- Explicitly synthesize their stated MVP timeline, required integrations, security/compliance policies, 90-day operational metrics, and user roles into your response.
- Directly reference and cite the client's provided inputs in your answer.
- Generate authoritative, structured, concrete data:
- Use Markdown tables for comparisons, timelines, and schemas
- Provide exact technology choices, functional requirements, or phase breakdowns
- Be precise, technical, and actionable.${langInstruction}`;

        try {
          aiResponseText = await llmClient.complete({
            systemPrompt,
            userPrompt: text.trim(),
          });
        } catch (llmErr) {
          console.warn('[DiscoveryChat] llmClient fallback error:', llmErr.message);
        }
      }

      // 5. Intelligent Heuristic Fallback (Ensures data is ALWAYS returned even offline)
      if (!aiResponseText) {
        const lower = text.toLowerCase();
        if (lower.includes('azure') || lower.includes('microsoft')) {
          aiResponseText = `### Recommended Microsoft Azure Solution Architecture

| Component | Azure Service | Rationale |
|---|---|---|
| **Frontend App** | Azure Static Web Apps / Container Apps | Global edge distribution, integrated CI/CD |
| **API Backend** | Azure App Service (Linux) / Azure Functions | Microservices architecture with auto-scaling |
| **Primary Data** | Azure Cosmos DB / Azure SQL Database | High availability, multi-region replication |
| **Identity & Access** | Microsoft Entra ID (Azure AD) | Enterprise SSO, MFA, conditional access policies |
| **Monitoring** | Azure Application Insights | Distributed tracing, APM, telemetry |`;
        } else if (lower.includes('timeline') || lower.includes('cost') || lower.includes('effort') || lower.includes('price')) {
          aiResponseText = `### Project Timeline & Cost Band Estimate

| Phase | Timeline | Primary Objective |
|---|---|---|
| **Phase 1: Discovery & Architecture** | 2 Weeks | BRD, system topology, security baseline |
| **Phase 2: Core Engineering** | 6–8 Weeks | Full-stack APIs, database schema, data models |
| **Phase 3: Integration & Testing** | 2–3 Weeks | QA, security penetration tests, compliance check |
| **Phase 4: Deployment & Pilot** | 2 Weeks | Production release, CI/CD, telemetry |

**Estimated Cost Band**:
- **MVP Baseline**: $25,000 – $45,000 USD
- **Production Enterprise**: $55,000 – $95,000 USD`;
        } else if (lower.includes('security') || lower.includes('compliance')) {
          aiResponseText = `### Security Controls & Compliance Architecture

- **Data Protection**: TLS 1.3 encryption in-transit and AES-256 at-rest encryption.
- **Identity & Authorization**: Role-Based Access Control (RBAC) with scoped tokens.
- **Compliance Alignment**: SOC 2 Type II audit logging, ISO 27001 baseline, and GDPR data residency controls.
- **Audit Trails**: Immutable event ledger tracking all CRUD operations.`;
        } else {
          aiResponseText = `### Architectural Advisory for "${text.trim()}"

1. **Functional Impact**: This requirement will be integrated into the core solution scope, establishing dedicated microservices and API endpoints.
2. **Data & Schema**: An entity model will be provisioned in the primary database with foreign key relationships and index optimization.
3. **Delivery Alignment**: We have updated the transformation context so that this specification is incorporated into the Business Requirements Document (BRD) and High-Level Design (HLD).`;
        }
      }

      // 6. Save AI response to MySQL database memory
      const aiMessage = await SessionMessageModel.create({
        sessionId,
        sender: 'ai',
        messageText: aiResponseText,
      });

      // 7. Sync new architectural constraints into MySQL business context
      try {
        if (context) {
          const existingConstraints = context.constraints_text || '';
          if (!existingConstraints.includes(text.trim().substring(0, 30))) {
            const updatedConstraints = existingConstraints
              ? `${existingConstraints}\n- Chat input: ${text.trim()}`
              : `Chat input: ${text.trim()}`;
            await BusinessContextModel.upsert({
              sessionId,
              constraints_text: updatedConstraints.substring(0, 4000),
            });
          }
        }
      } catch (ctxErr) {
        console.warn('[DiscoveryChat] Context sync notice:', ctxErr.message);
      }

      res.json({
        success: true,
        userMessage,
        aiMessage,
      });
    } catch (err) {
      next(err);
    }
  },

  // 8. Translate session deliverables (BRD, Architecture, Estimate) on-the-fly
  async translateBlueprint(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const { targetLanguage = 'English' } = req.body || {};

      const LANG_MAP = {
        en: 'English',
        hi: 'Hindi',
        gu: 'Gujarati',
        es: 'Spanish',
        fr: 'French',
      };
      const resolvedLang = LANG_MAP[targetLanguage.toLowerCase()] || targetLanguage;

      const [brd, architecture, estimate] = await Promise.all([
        BrdModel.findBySessionId(sessionId),
        SolutionArchitectureModel.findBySessionId(sessionId),
        EffortEstimateModel.findBySessionId(sessionId),
      ]);

      if (!brd && !architecture && !estimate) {
        return res.status(404).json({ success: false, message: 'Deliverables not found' });
      }

      if (!resolvedLang || resolvedLang.toLowerCase() === 'english') {
        return res.json({
          success: true,
          targetLanguage: 'English',
          brd,
          architecture,
          estimate,
        });
      }

      // Translate core text sections in parallel for speed
      const [
        translatedObjectives,
        translatedScope,
        translatedHld,
        translatedDataFlow,
        translatedSecurity,
      ] = await Promise.all([
        brd?.objectives ? compileAiClient.translate(brd.objectives, resolvedLang) : Promise.resolve(''),
        brd?.scope ? compileAiClient.translate(brd.scope, resolvedLang) : Promise.resolve(''),
        architecture?.hld_summary ? compileAiClient.translate(architecture.hld_summary, resolvedLang) : Promise.resolve(''),
        architecture?.data_flow ? compileAiClient.translate(architecture.data_flow, resolvedLang) : Promise.resolve(''),
        architecture?.security_notes ? compileAiClient.translate(architecture.security_notes, resolvedLang) : Promise.resolve(''),
      ]);

      const translatedBrd = brd ? {
        ...brd,
        objectives: translatedObjectives || brd.objectives,
        scope: translatedScope || brd.scope,
      } : null;

      const translatedArchitecture = architecture ? {
        ...architecture,
        hld_summary: translatedHld || architecture.hld_summary,
        data_flow: translatedDataFlow || architecture.data_flow,
        security_notes: translatedSecurity || architecture.security_notes,
      } : null;

      res.json({
        success: true,
        targetLanguage: resolvedLang,
        brd: translatedBrd,
        architecture: translatedArchitecture,
        estimate,
      });
    } catch (err) {
      next(err);
    }
  },

  // 12. Get live standalone deployed prototype webpage (HTML)
  async getLivePrototype(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const [session, architecture] = await Promise.all([
        SessionModel.findById(sessionId),
        SolutionArchitectureModel.findBySessionId(sessionId),
      ]);

      if (!session) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(`
          <!DOCTYPE html>
          <html lang="en">
          <head><meta charset="utf-8"><title>Session Not Found</title><script src="https://cdn.tailwindcss.com"></script></head>
          <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6 text-center">
            <div class="max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
              <h1 class="text-xl font-bold text-red-400 mb-2">Session Not Found</h1>
              <p class="text-sm text-slate-400">The requested blueprint session ID does not exist or has been removed.</p>
            </div>
          </body>
          </html>
        `);
      }

      let prototype = architecture?.prototype;
      if (!prototype || !prototype.appName) {
        // If not generated yet, generate dynamically
        const rawInput = await InputDocumentModel.getAllParsedText(sessionId);
        const context = await BusinessContextModel.findBySessionId(sessionId);
        prototype = await prototypeGenerator.generatePrototype({
          rawInput: rawInput || session.title || '',
          sessionTitle: session.title || 'Platform',
          context,
          userLanguage: 'English',
        });
        await SolutionArchitectureModel.updatePrototype(sessionId, prototype);
      }

      const html = prototype.deployedHtml || prototypeGenerator.buildDeployedWebpageHtml(prototype);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
      return res.send(html);
    } catch (err) {
      console.error('[getLivePrototype] Error:', err);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="utf-8"><title>Error</title><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6 text-center">
          <div class="max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
            <h1 class="text-xl font-bold text-amber-400 mb-2">Prototype Deployment Warning</h1>
            <p class="text-sm text-slate-400">${err.message}</p>
          </div>
        </body>
        </html>
      `);
    }
  },
};

