import type { ScoringInput } from '@/lib/scoring'
import type { TaskType } from '@/lib/registry'

export type GoldenClassification = Omit<ScoringInput, 'priorityOrder' | 'excludedFactors' | 'benchmarkScores'> & {
  taskType: TaskType
}

export interface GoldenTask {
  id: string
  description: string
  why: string
  classification: GoldenClassification
}

/**
 * Versioned, synthetic tasks used to evaluate Bearing without storing user
 * prompts. They deliberately span every canonical task type plus the main hard
 * gates and policy extremes: vision, tools, code, long context, on-prem,
 * realtime, high volume, regulated data, multilingual and agentic work.
 *
 * The prose description is retained so the same corpus can later evaluate the
 * classifier. Ranking evaluation currently consumes only `classification`.
 */
export const GOLDEN_TASKS: GoldenTask[] = [
  {
    id: 'summarise-board-pack',
    description: 'Summarise a 35-page board pack into a two-page briefing with the main decisions and risks.',
    why: 'Long-input summarisation with a concise output.',
    classification: {
      taskType: 'summarise', complexity: 'moderate', inputLength: 'long', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'summarise-pii-case-notes',
    description: 'Summarise case notes containing names, addresses and support needs for an internal handover.',
    why: 'PII should raise privacy without becoming an on-prem hard gate.',
    classification: {
      taskType: 'summarise', complexity: 'moderate', inputLength: 'long', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'pii', latencyTarget: 'interactive', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'extract-invoices-vision',
    description: 'Extract supplier, invoice number, date, VAT and totals from photographed invoices into structured fields.',
    why: 'Extraction task with a vision hard gate and structured-output preference.',
    classification: {
      taskType: 'extract', complexity: 'simple', inputLength: 'medium', outputLength: 'short',
      needsVision: true, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'extract-policy-table',
    description: 'Extract every eligibility criterion and exception from a long policy document into a table.',
    why: 'Long-context extraction without vision.',
    classification: {
      taskType: 'extract', complexity: 'moderate', inputLength: 'very_long', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'one_off',
      needsLongContext: true, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'generate-funding-case',
    description: 'Draft a persuasive 2,000-word funding case from supplied evidence while preserving nuance and caveats.',
    why: 'Complex long-form generation where quality should dominate.',
    classification: {
      taskType: 'generate', complexity: 'complex', inputLength: 'long', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'comms-client-email',
    description: 'Turn rough meeting notes into a concise, warm follow-up email with clear next actions.',
    why: 'Everyday business communication where cost and speed can matter.',
    classification: {
      taskType: 'comms', complexity: 'simple', inputLength: 'short', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'code-refactor-service',
    description: 'Refactor a TypeScript service, preserve behaviour, add tests and explain the architectural trade-offs.',
    why: 'Complex coding with reasoning and code capability hard gate.',
    classification: {
      taskType: 'code', complexity: 'complex', inputLength: 'long', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: true, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'code-agentic-repo-fix',
    description: 'Inspect a repository, trace a failing test, edit several files, run checks and fix the issue autonomously.',
    why: 'Agentic coding should favour models with tools plus extended thinking.',
    classification: {
      taskType: 'code', complexity: 'complex', inputLength: 'very_long', outputLength: 'long',
      needsVision: false, needsTools: true, needsCode: true, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: true, needsMultilingual: false, isAgentic: true,
    },
  },
  {
    id: 'math-proof',
    description: 'Solve a difficult probability problem and provide a rigorous proof with intermediate reasoning.',
    why: 'Complex mathematical reasoning.',
    classification: {
      taskType: 'math', complexity: 'complex', inputLength: 'medium', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'reasoning-strategy',
    description: 'Compare three operating models, reason through second-order effects and recommend a strategy under uncertainty.',
    why: 'General complex reasoning where reasoning capability should matter.',
    classification: {
      taskType: 'reasoning', complexity: 'complex', inputLength: 'long', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'analyse-finance-regulated',
    description: 'Analyse a regulated financial-services dataset and explain anomalies for an internal risk review.',
    why: 'Analysis where regulated sensitivity should materially raise privacy.',
    classification: {
      taskType: 'analyse', complexity: 'complex', inputLength: 'long', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'regulated_finance', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'analyse-on-prem',
    description: 'Analyse confidential internal workforce data that is not permitted to leave our own infrastructure.',
    why: 'On-prem requirement must hard-filter every hosted-only model.',
    classification: {
      taskType: 'analyse', complexity: 'moderate', inputLength: 'long', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'on_prem_required', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'research-landscape',
    description: 'Research a policy landscape, compare competing evidence and produce a sourced briefing with uncertainties.',
    why: 'Research task with high reasoning demand.',
    classification: {
      taskType: 'research', complexity: 'complex', inputLength: 'long', outputLength: 'long',
      needsVision: false, needsTools: true, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: true,
    },
  },
  {
    id: 'research-long-context',
    description: 'Read a corpus of very long reports and synthesise the evidence into themes, contradictions and gaps.',
    why: 'Research with a long-context hard gate.',
    classification: {
      taskType: 'research', complexity: 'complex', inputLength: 'very_long', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'one_off',
      needsLongContext: true, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'qa-fast-helpdesk',
    description: 'Answer short factual helpdesk questions interactively with low latency.',
    why: 'Realtime QA should enforce the speed hard gate.',
    classification: {
      taskType: 'qa', complexity: 'simple', inputLength: 'short', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'realtime', volume: 'thousands_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'qa-complex-domain',
    description: 'Answer a specialist technical question using a supplied standards document and explain the reasoning.',
    why: 'Quality-led QA distinct from the low-latency fixture.',
    classification: {
      taskType: 'qa', complexity: 'complex', inputLength: 'long', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'one_off',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'translate-multilingual',
    description: 'Translate a public service guide from English into Polish and Arabic while preserving plain language and terminology.',
    why: 'Translation where multilingual capability is directly relevant.',
    classification: {
      taskType: 'translate', complexity: 'moderate', inputLength: 'long', outputLength: 'long',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: true, isAgentic: false,
    },
  },
  {
    id: 'conversation-live-assistant',
    description: 'Power a live conversational assistant where replies need to feel immediate.',
    why: 'Conversation under a realtime latency constraint.',
    classification: {
      taskType: 'conversation', complexity: 'simple', inputLength: 'short', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'realtime', volume: 'thousands_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'conversation-sensitive',
    description: 'Support staff drafting responses in a conversation that contains personal case information.',
    why: 'Conversation with PII and moderate nuance.',
    classification: {
      taskType: 'conversation', complexity: 'moderate', inputLength: 'medium', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
      dataSensitivity: 'pii', latencyTarget: 'interactive', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'embedding-rag-index',
    description: 'Create embeddings for a large document collection used for semantic search and RAG retrieval.',
    why: 'Canonical embedding workload with high volume.',
    classification: {
      taskType: 'embedding', complexity: 'moderate', inputLength: 'medium', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'millions_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'embedding-multilingual',
    description: 'Embed a multilingual knowledge base for cross-language semantic retrieval.',
    why: 'Embedding model class with multilingual preference.',
    classification: {
      taskType: 'embedding', complexity: 'moderate', inputLength: 'medium', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'thousands_per_day',
      needsLongContext: false, needsMultilingual: true, isAgentic: false,
    },
  },
  {
    id: 'summarise-batch-million',
    description: 'Summarise a very large daily stream of short public submissions into one-paragraph digests.',
    why: 'Extreme volume should push cost strongly without losing task fitness.',
    classification: {
      taskType: 'summarise', complexity: 'simple', inputLength: 'short', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'batch', volume: 'millions_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'extract-regulated-health',
    description: 'Extract coded fields from clinical correspondence for an approved internal health workflow.',
    why: 'Regulated-health extraction should increase privacy weighting.',
    classification: {
      taskType: 'extract', complexity: 'moderate', inputLength: 'long', outputLength: 'short',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'regulated_health', latencyTarget: 'batch', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: false, isAgentic: false,
    },
  },
  {
    id: 'generate-multilingual-campaign',
    description: 'Create campaign copy in English, Welsh and Polish with consistent meaning and tone.',
    why: 'Generation with multilingual capability preference.',
    classification: {
      taskType: 'generate', complexity: 'moderate', inputLength: 'medium', outputLength: 'medium',
      needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
      dataSensitivity: 'none', latencyTarget: 'interactive', volume: 'hundreds_per_day',
      needsLongContext: false, needsMultilingual: true, isAgentic: false,
    },
  },
]
