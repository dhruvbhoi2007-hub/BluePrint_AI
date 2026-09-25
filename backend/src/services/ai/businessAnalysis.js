import { compileAiClient } from './compileAiClient.js';
import { inputAnalyzer } from './inputAnalyzer.js';
import { llmClient } from './llmClient.js';

export const businessAnalysis = {
  async generateBrd({ rawInput = '', context = {}, answeredQa = [], userLanguage = 'English' }) {
    const analysis = await inputAnalyzer.analyze(rawInput, context);
    const qaMap = {};
    for (const item of answeredQa || []) {
      if (item.question && item.answer) {
        qaMap[item.question] = item.answer;
      }
    }

    try {
      if (await compileAiClient.isHealthy()) {
        const sections = await compileAiClient.generate(rawInput, qaMap, 'brd', userLanguage);
        if (Array.isArray(sections) && sections.length > 0 && sections[0].content) {
          const content = sections[0].content;

          // Intelligently extract Objectives and Scope sections from the generated markdown
          const objMatch = content.match(/(?:##?\s*(?:1\.\s*)?Executive Objectives[\r\n]+)([\s\S]*?)(?=##?\s*(?:2\.\s*)?Scope|\n##|\n#|$)/i);
          const scopeMatch = content.match(/(?:##?\s*(?:2\.\s*)?Scope[\r\n]+)([\s\S]*?)(?=##?\s*(?:3\.\s*)?Functional|\n##|\n#|$)/i);

          const parsedObjectives = (objMatch && objMatch[1].trim().length > 30)
            ? objMatch[1].trim()
            : `### Primary Transformation Objective\nAutomate and digitise ${analysis.problemTitle} for ${analysis.industry}.\n\n### Strategic Business Outcomes & KPIs\n- **Operational Efficiency**: 70%+ reduction in processing latency and manual intervention.\n- **Data Governance**: Normalized schemas and automated audit trail tracking.\n- **High Availability**: Resilient cloud-native microservices with 99.5% uptime SLA.`;

          const parsedScope = (scopeMatch && scopeMatch[1].trim().length > 30)
            ? scopeMatch[1].trim()
            : `- **In-Scope**: Intake automation, status tracking, role-based access, and legacy tool integration.\n- **Out-of-Scope**: Bespoke physical infrastructure overhaul.`;

          return {
            objectives: parsedObjectives,
            scope: parsedScope,
            stakeholdersList: analysis.stakeholders || ['CTO', 'Operations Lead'],
            gapAnalysis: [
              { area: 'Operational Bottlenecks', impact: 'High', gap: 'Manual steps vs automated digital workflow' },
              { area: 'Compliance & Auditability', impact: 'Medium', gap: 'Fragmented logs vs automated compliance audit trail' }
            ],
            functionalRequirements: [
              { id: 'FR-1.1', title: 'Automated Processing Engine', description: `Automate ${analysis.problemTitle} workflows`, priority: 'Must Have' },
              { id: 'FR-1.2', title: 'Data Ingestion & Integration', description: 'Connect existing legacy data sources and tools', priority: 'Must Have' },
              { id: 'FR-1.3', title: 'Stakeholder Reporting Dashboard', description: 'Provide live status views for key operational leads', priority: 'Must Have' }
            ],
            nonFunctionalRequirements: [
              { category: 'Availability', requirement: '99.5% uptime target' },
              { category: 'Security', requirement: 'TLS 1.3 in transit and AES-256 at rest' }
            ],
            assumptions: [
              `Target budget band: ${analysis.budgetBand}`,
              'Existing data sources accessible via API or file export'
            ],
            constraintsData: [
              `Target completion window in ${analysis.industry} domain`
            ],
            rawBrdDocument: content,
          };
        }
      }
    } catch (err) {
      console.warn('[BusinessAnalysis] Compile AI server BRD generation fallback:', err.message);
    }

    return {
      objectives: `### Primary Transformation Objective\nAutomate and digitise ${analysis.problemTitle} for ${analysis.industry}.\n\n### Strategic Business Outcomes & KPIs\n- **Operational Efficiency**: 70%+ reduction in processing latency and manual intervention.\n- **Data Governance**: Normalized schemas and automated audit trail tracking.\n- **High Availability**: Resilient cloud-native microservices with 99.5% uptime SLA.`,
      scope: `### In-Scope Core Capabilities\n- Intake automation, status tracking, role-based access, and legacy integration for ${analysis.problemTitle}.\n- Automated rule execution, multi-tier approvals, and REST API integration endpoints.\n- Live operational dashboards for key business stakeholders.\n\n### Out-of-Scope Boundaries\n- Bespoke physical infrastructure overhaul or hardware decommissioning.\n- Custom non-standard third-party integrations outside the target scope.`,
      stakeholdersList: analysis.stakeholders || ['CTO', 'Operations Lead'],
      gapAnalysis: [
        { area: 'Operational Bottlenecks', impact: 'High', gap: 'Current manual steps cause delay. Desired state: Automated pipeline.' }
      ],
      functionalRequirements: [
        { id: 'FR-1.1', title: 'Data Ingestion', description: 'Capture and structure data into normalized schema', priority: 'Must Have' },
        { id: 'FR-1.2', title: 'Workflow Engine', description: 'Automate approval handoffs', priority: 'Must Have' }
      ],
      nonFunctionalRequirements: [
        { category: 'Availability', requirement: '99.5% uptime target' }
      ],
      assumptions: ['Legacy system data accessible'],
      constraintsData: ['Target launch within planned timeline']
    };
  }
};
