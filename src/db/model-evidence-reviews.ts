import { neon } from '@neondatabase/serverless'
import type { EvidenceProposal } from '@/lib/model-evidence-proposals'

function db() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is required')
  return neon(url)
}

export interface EvidenceReview {
  proposalId: string
  digest: string
  status: 'accepted' | 'rejected'
  note: string | null
  reviewedAt: string
}

export async function listEvidenceReviews(): Promise<Map<string, EvidenceReview>> {
  const rows = await db()`
    SELECT proposal_id, proposal_digest, status, review_note,
      reviewed_at::text AS reviewed_at FROM model_evidence_reviews ORDER BY reviewed_at DESC
  `
  return new Map(rows.map(row => [String(row.proposal_id), {
    proposalId: String(row.proposal_id),
    digest: String(row.proposal_digest),
    status: row.status as EvidenceReview['status'],
    note: row.review_note == null ? null : String(row.review_note),
    reviewedAt: String(row.reviewed_at),
  }]))
}

// One SQL statement updates the exact current field AND records acceptance.
// A stale current value or already-reviewed ID makes no change.
export async function acceptEvidenceProposal(
  proposal: EvidenceProposal, digest: string, reviewer: string, note: string,
): Promise<boolean> {
  const field=proposal.field
  const name=field === 'name'
  const context=field === 'context_window'
  const caps=field === 'capabilities'
  const pricing=field.startsWith('pricing.')
  const fitness=field.startsWith('task_fitness.')
  const priceKey=field.slice('pricing.'.length)
  const taskKey=field.slice('task_fitness.'.length)
  const number=typeof proposal.proposed === 'number' ? proposal.proposed : 0
  const proposedName=typeof proposal.proposed === 'string' ? proposal.proposed : ''
  const proposedCaps=Array.isArray(proposal.proposed) ? proposal.proposed : []
  const before=JSON.stringify(proposal.expected)
  const after=JSON.stringify(proposal.proposed)
  const metadata=pricing || context || caps
  const rows=await db()`
    WITH changed AS (
      UPDATE models m SET
        name = CASE WHEN ${name} THEN ${proposedName} ELSE m.name END,
        context_window = CASE WHEN ${context} THEN ${number} ELSE m.context_window END,
        capabilities = CASE WHEN ${caps} THEN ${proposedCaps}::text[] ELSE m.capabilities END,
        pricing = CASE WHEN ${pricing}
          THEN jsonb_set(m.pricing, ARRAY[${priceKey}], ${after}::jsonb, false)
          ELSE m.pricing END,
        task_fitness = CASE WHEN ${fitness}
          THEN jsonb_set(m.task_fitness, ARRAY[${taskKey}], ${after}::jsonb, false)
          ELSE m.task_fitness END,
        updated_at = now(),
        last_verified_at = CASE WHEN ${metadata} THEN NULL ELSE m.last_verified_at END,
        verification_status = CASE WHEN ${metadata} THEN 'unknown' ELSE m.verification_status END,
        verification_source = CASE WHEN ${metadata} THEN NULL ELSE m.verification_source END,
        verification_note = CASE WHEN ${metadata}
          THEN 'Reviewed evidence change; awaiting re-verification.' ELSE m.verification_note END
      WHERE m.slug = ${proposal.model_slug}
        AND NOT EXISTS (SELECT 1 FROM model_evidence_reviews r WHERE r.proposal_id=${proposal.id})
        AND (
          (${name} AND to_jsonb(m.name) = ${before}::jsonb)
          OR (${context} AND to_jsonb(m.context_window) = ${before}::jsonb)
          OR (${caps} AND to_jsonb(m.capabilities) = ${before}::jsonb)
          OR (${pricing} AND m.pricing -> ${priceKey} = ${before}::jsonb)
          OR (${fitness} AND m.task_fitness -> ${taskKey} = ${before}::jsonb)
        )
      RETURNING m.slug
    ),
    reviewed AS (
      INSERT INTO model_evidence_reviews (
        proposal_id, proposal_digest, model_slug, field, expected_value,
        proposed_value, evidence, status, reviewed_by, review_note
      )
      SELECT ${proposal.id}, ${digest}, ${proposal.model_slug}, ${field},
        ${before}::jsonb, ${after}::jsonb, ${JSON.stringify(proposal.evidence)}::jsonb,
        'accepted', ${reviewer}::uuid, ${note}
      FROM changed RETURNING proposal_id
    )
    SELECT proposal_id FROM reviewed
  `
  return rows.length === 1
}

export async function rejectEvidenceProposal(
  proposal: EvidenceProposal, digest: string, reviewer: string, note: string,
): Promise<boolean> {
  const rows=await db()`
    INSERT INTO model_evidence_reviews (
      proposal_id, proposal_digest, model_slug, field,
      expected_value, proposed_value, evidence, status, reviewed_by, review_note
    ) VALUES (
      ${proposal.id}, ${digest}, ${proposal.model_slug}, ${proposal.field},
      ${JSON.stringify(proposal.expected)}::jsonb, ${JSON.stringify(proposal.proposed)}::jsonb,
      ${JSON.stringify(proposal.evidence)}::jsonb, 'rejected', ${reviewer}::uuid, ${note}
    )
    ON CONFLICT (proposal_id) DO NOTHING RETURNING proposal_id
  `
  return rows.length === 1
}
