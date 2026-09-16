import { GOLDEN_TASKS } from './golden-tasks'
import type { ClassifierEvalCase } from './classifier-evaluation'

const goldenClassifierCases: ClassifierEvalCase[] = GOLDEN_TASKS.map((task) => ({
  id: task.id,
  description: task.description,
  why: task.why,
  expected: {
    taskType: task.classification.taskType,
    complexity: task.classification.complexity,
    inputLength: task.classification.inputLength,
    outputLength: task.classification.outputLength,
    needsVision: task.classification.needsVision,
    needsTools: task.classification.needsTools,
    needsCode: task.classification.needsCode,
    needsReasoning: task.classification.needsReasoning,
    dataSensitivity: task.classification.dataSensitivity,
    latencyTarget: task.classification.latencyTarget,
    volume: task.classification.volume,
    needsLongContext: task.classification.needsLongContext,
    needsMultilingual: task.classification.needsMultilingual,
    isAgentic: task.classification.isAgentic,
    clarificationNeeded: false,
  },
}))

const behaviourProbes: ClassifierEvalCase[] = [
  {
    id: 'clarify-vague-documents',
    description: 'I need help with some documents for work.',
    why: 'The job is too underspecified to take a confident bearing without learning what the user needs done.',
    expected: { clarificationNeeded: true },
  },
  {
    id: 'clarify-ai-project',
    description: 'We want to use AI in our organisation. What should we use?',
    why: 'A product or model recommendation is premature without knowing the actual job, constraints and data sensitivity.',
    expected: { clarificationNeeded: true },
  },
  {
    id: 'pipeline-invoices-to-report',
    description: 'Process 500 photographed invoices, extract the fields, analyse monthly spending patterns and produce a short management report.',
    why: 'This contains distinct vision extraction, analysis and generation stages that may benefit from different routes.',
    expected: { clarificationNeeded: false, pipelineRecommended: true },
  },
  {
    id: 'pipeline-research-to-comms',
    description: 'Research current evidence on a policy issue, compare the sources, then turn the findings into a concise public briefing and three social posts.',
    why: 'Research/synthesis and communications are distinct stages and should exercise pipeline detection.',
    expected: { clarificationNeeded: false, pipelineRecommended: true },
  },
]

/**
 * Live classifier evaluation corpus. Golden ranking tasks supply stable,
 * synthetic ground truth for the core task shape; behaviour probes cover
 * clarification and multi-stage pipeline decisions that ranking alone cannot
 * evaluate.
 */
export const CLASSIFIER_EVAL_CASES: ClassifierEvalCase[] = [
  ...goldenClassifierCases,
  ...behaviourProbes,
]
