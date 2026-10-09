import { getAllModels, getRegistry, type Factor } from '@/lib/registry'
import { scoreModelsDetailed, type ScoringInput, type ScoredModel, type HardFilterReason } from '@/lib/scoring'
import { selectTradeoffAlternatives, type FeaturedAlternative } from '@/lib/tradeoff-alternatives'
import { priorityToWeights } from '@/lib/weights'

export type DemoFocus = 'balanced' | 'quality' | 'cost' | 'privacy' | 'sustainability'
export type DemoScenarioId = 'summary' | 'coding' | 'private-analysis' | 'embedding' | 'translation'
export interface DemoScenario {
  id: DemoScenarioId
  title: string
  description: string
  taskType: string
  complexity: string
  inputLength: string
  outputLength: string
  needsVision: boolean
  needsTools: boolean
  needsCode: boolean
  needsReasoning: boolean
  needsMultilingual: boolean
  dataSensitivity: string
}
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'summary', title: 'Summarise a policy report',
    description: 'Turn a long public policy report into a clear two-page briefing.',
    taskType: 'summarise', complexity: 'moderate', inputLength: 'very_long', outputLength: 'medium',
    needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
    needsMultilingual: false, dataSensitivity: 'none',
  },
  {
    id: 'coding', title: 'Review a software feature',
    description: 'Assess a complex fictional code change and propose tests and fixes.',
    taskType: 'code', complexity: 'complex', inputLength: 'long', outputLength: 'long',
    needsVision: false, needsTools: true, needsCode: true, needsReasoning: true,
    needsMultilingual: false, dataSensitivity: 'none',
  },
  {
    id: 'private-analysis', title: 'Analyse sensitive case notes',
    description: 'Identify themes in synthetic personally sensitive case records.',
    taskType: 'analyse', complexity: 'moderate', inputLength: 'long', outputLength: 'medium',
    needsVision: false, needsTools: false, needsCode: false, needsReasoning: true,
    needsMultilingual: false, dataSensitivity: 'pii',
  },
  {
    id: 'embedding', title: 'Build a search index',
    description: 'Choose an embedding model for a fictional document collection.',
    taskType: 'embedding', complexity: 'simple', inputLength: 'medium', outputLength: 'short',
    needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
    needsMultilingual: false, dataSensitivity: 'none',
  },
  {
    id: 'translation', title: 'Translate community information',
    description: 'Translate a public service leaflet into several languages.',
    taskType: 'translate', complexity: 'moderate', inputLength: 'medium', outputLength: 'medium',
    needsVision: false, needsTools: false, needsCode: false, needsReasoning: false,
    needsMultilingual: true, dataSensitivity: 'none',
  },
]
export const DEMO_FOCUS: Record<DemoFocus, { label: string; note: string; priorities: Factor[] }> = {
  balanced: {
    label: 'Balanced', note: 'Balance performance, capability and cost.',
    priorities: ['quality', 'capability', 'cost', 'privacy', 'speed', 'sustainability', 'transparency'],
  },
  quality: {
    label: 'Quality first', note: 'Emphasise task performance and capabilities.',
    priorities: ['quality', 'capability', 'privacy', 'speed', 'cost', 'transparency', 'sustainability'],
  },
  cost: {
    label: 'Low cost', note: 'Emphasise cost after capability requirements are met.',
    priorities: ['cost', 'capability', 'quality', 'speed', 'privacy', 'sustainability', 'transparency'],
  },
  privacy: {
    label: 'Privacy first', note: 'Prioritise privacy without requiring local execution.',
    priorities: ['privacy', 'capability', 'quality', 'transparency', 'cost', 'sustainability', 'speed'],
  },
  sustainability: {
    label: 'Sustainability first', note: 'Elevate environmental evidence and transparency.',
    priorities: ['sustainability', 'transparency', 'quality', 'capability', 'cost', 'privacy', 'speed'],
  },
}
export interface DemoRequest {
  scenarioId: DemoScenarioId
  focus: DemoFocus
  onPremOnly: boolean
}
export interface DemoResult {
  request: DemoRequest
  scenario: DemoScenario
  models: ScoredModel[]
  alternatives: FeaturedAlternative[]
  excludedByReason: Partial<Record<HardFilterReason, number>>
  eligibleCount: number
  excludedCount: number
  modelCount: number
  effectiveWeights: Record<Factor, number>
  registryDate: string
}

// Uses the same deterministic scoring and trade-off code as live recommendations.
// Only public, committed model metadata and synthetic tasks: no database,
// classification API, provider call, persistence, or user task text.
export function runContributorDemo(request: DemoRequest): DemoResult {
  const scenario = DEMO_SCENARIOS.find(s => s.id === request.scenarioId)
  const focus = DEMO_FOCUS[request.focus]
  if (!scenario || !focus || typeof request.onPremOnly !== 'boolean') {
    throw new Error('Unknown local demo setting.')
  }
  const input: ScoringInput = {
    taskType: scenario.taskType,
    complexity: scenario.complexity,
    inputLength: scenario.inputLength,
    outputLength: scenario.outputLength,
    needsVision: scenario.needsVision,
    needsTools: scenario.needsTools,
    needsCode: scenario.needsCode,
    needsReasoning: scenario.needsReasoning,
    needsMultilingual: scenario.needsMultilingual,
    dataSensitivity: request.onPremOnly ? 'on_prem_required' : scenario.dataSensitivity,
    priorityOrder: [...focus.priorities],
  }
  const { models, excluded } = scoreModelsDetailed(input)
  const excludedByReason: Partial<Record<HardFilterReason, number>> = {}
  for (const item of excluded) {
    excludedByReason[item.reason] = (excludedByReason[item.reason] ?? 0) + 1
  }
  const catalogue = getAllModels()
  const localSlugs = new Set(catalogue.filter(m => Boolean(m.local_info)).map(m => m.slug))
  const alternatives = selectTradeoffAlternatives(models, {
    limit: 2,
    isLocal: slug => localSlugs.has(slug),
  })
  return {
    request, scenario,
    models: models.slice(0, 12),
    alternatives, excludedByReason,
    eligibleCount: models.length,
    excludedCount: excluded.length,
    modelCount: catalogue.length,
    effectiveWeights: priorityToWeights(input.priorityOrder, { complexity: input.complexity }),
    registryDate: getRegistry().meta.updated,
  }
}
