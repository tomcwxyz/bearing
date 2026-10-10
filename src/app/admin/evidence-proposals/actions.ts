'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import manifest from '@/data/model-evidence-proposals.json'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { getModelForAdmin } from '@/db/models'
import { acceptEvidenceProposal, rejectEvidenceProposal, listEvidenceReviews } from '@/db/model-evidence-reviews'
import { validateEvidenceProposal, type EvidenceProposal } from '@/lib/model-evidence-proposals'
import { isEvidenceProposalCurrent } from '@/lib/model-evidence-current'

function getProposal(id: string): EvidenceProposal | null {
  const found = (manifest as unknown[]).find(input =>
    typeof input === 'object' && input !== null && 'id' in input &&
    (input as { id?: unknown }).id === id)
  return found ? validateEvidenceProposal(found) : null
}

export async function reviewModelEvidence(
  id: string, decision: 'accept' | 'reject', note: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser()
  if (!user || !(await isUserAdmin(user.id))) throw new Error('Not authorised')
  if (typeof id !== 'string' || id.length > 100 ||
      (decision !== 'accept' && decision !== 'reject') ||
      typeof note !== 'string' || note.length > 2000) {
    return { ok: false, message: 'Invalid review request.' }
  }
  if (decision === 'reject' && note.trim().length < 10) {
    return { ok: false, message: 'Please explain why this proposal was rejected.' }
  }
  const proposal = getProposal(id)
  if (!proposal) return { ok: false, message: 'Proposal is not in the deployed review manifest.' }

  // A public PR file becomes reviewable only after merge/deployment; the
  // browser cannot provide trusted field values or sources.
  const digest = createHash('sha256').update(JSON.stringify(proposal)).digest('hex')
  const existing = await listEvidenceReviews()
  if (existing.has(id)) return { ok: false, message: 'This proposal ID has already been reviewed.' }

  if (decision === 'accept') {
    const current = await getModelForAdmin(proposal.model_slug)
    if (!isEvidenceProposalCurrent(current, proposal)) {
      return { ok: false, message: 'The catalogue value has changed or the model is missing. Rebase this proposal against the current record.' }
    }
  }

  const applied = decision === 'accept'
    ? await acceptEvidenceProposal(proposal, digest, user.id, note.trim())
    : await rejectEvidenceProposal(proposal, digest, user.id, note.trim())

  if (!applied) return { ok: false, message: 'Review no longer applies; another decision or catalogue change may have been made.' }
  revalidatePath('/admin/evidence-proposals')
  revalidatePath('/admin')
  revalidatePath('/models')
  revalidatePath('/models/' + proposal.model_slug)
  return { ok: true, message: decision === 'accept' ? 'Applied to Neon and recorded in the audit. Redeploy to refresh the bundled scoring snapshot.' : 'Rejection recorded.' }
}
