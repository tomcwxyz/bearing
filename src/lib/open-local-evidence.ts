import evidenceData from '@/data/open-local-evidence.json'
import type { LocalInfo } from './registry'

export type OpenLocalEvidenceStatus =
  | 'confirmed_local'
  | 'hosted_only'
  | 'weights_available'
  | 'unverified'

export interface OpenLocalEvidenceSource {
  kind: 'huggingface' | 'ollama'
  url: string
  checkedAt: string
  note?: string
}

export interface ReviewedOpenLocalEvidence {
  slug: string
  status: OpenLocalEvidenceStatus
  huggingFaceId?: string
  ollamaModelId?: string
  localInfo?: LocalInfo
  sources: OpenLocalEvidenceSource[]
  note: string
}

export const REVIEWED_OPEN_LOCAL_EVIDENCE = evidenceData as ReviewedOpenLocalEvidence[]

const evidenceBySlug = new Map(
  REVIEWED_OPEN_LOCAL_EVIDENCE.map((entry) => [entry.slug, entry]),
)

export function getReviewedOpenLocalEvidence(
  slug: string,
): ReviewedOpenLocalEvidence | undefined {
  return evidenceBySlug.get(slug)
}
