import type { Model } from './registry'
import type { EvidenceProposal } from './model-evidence-proposals'

export function currentModelEvidenceValue(model: Model, field: string): unknown {
  switch (field) {
    case 'name': return model.name
    case 'context_window': return model.context_window
    case 'pricing.input_per_1m': return model.pricing.input_per_1m
    case 'pricing.output_per_1m': return model.pricing.output_per_1m
    case 'capabilities': return model.capabilities
    default:
      if (field.startsWith('task_fitness.')) {
        return model.task_fitness[field.slice('task_fitness.'.length)]
      }
      throw new Error('Unsupported evidence field')
  }
}

export function isEvidenceProposalCurrent(model: Model | null,
  proposal: Pick<EvidenceProposal,'field' | 'expected'>): boolean {
  if (!model) return false
  return JSON.stringify(currentModelEvidenceValue(model,proposal.field)) ===
    JSON.stringify(proposal.expected)
}
