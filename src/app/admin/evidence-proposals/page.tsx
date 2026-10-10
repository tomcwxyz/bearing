import Link from 'next/link'
import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import manifest from '@/data/model-evidence-proposals.json'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { getAllModelsForAdmin } from '@/db/models'
import { listEvidenceReviews } from '@/db/model-evidence-reviews'
import { currentModelEvidenceValue, isEvidenceProposalCurrent } from '@/lib/model-evidence-current'
import { validateEvidenceProposal } from '@/lib/model-evidence-proposals'
import { ReviewControls } from './review-controls'

export const dynamic = 'force-dynamic'

function show(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export default async function EvidenceProposalsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')
  if (!(await isUserAdmin(user.id))) redirect('/')

  const proposals = (manifest as unknown[]).map(validateEvidenceProposal)
  const [catalogue, reviews] = await Promise.all([
    getAllModelsForAdmin(), listEvidenceReviews(),
  ])
  const bySlug = new Map(catalogue.map(model => [model.slug, model]))

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <Link href="/admin" className="text-sm text-teal hover:underline">← Back to admin</Link>
      <h1 className="mt-3 font-display text-4xl text-navy">Community model evidence</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-grey-blue">
        Public correction proposals merged into the repository are shown here for
        deliberate maintainer review. Nothing is applied automatically.
        Acceptance updates the canonical Neon row, never the generated JSON snapshot.
        Stale changes are blocked, and every decision is recorded.
      </p>
      {proposals.length === 0 ? (
        <section className="mt-8 rounded-xl border border-cream-dark bg-white p-6">
          <h2 className="font-display text-xl text-navy">No submitted proposals yet</h2>
          <p className="mt-2 text-sm text-grey-blue">
            Contributors can add a validated JSON proposal to the public repository.
            The review queue is populated after their pull request is merged and deployed.
          </p>
          <Link href="https://github.com/tomcwxyz/bearing/blob/master/docs/model-evidence-contributions.md"
            className="mt-3 inline-block text-sm text-teal underline">How to contribute evidence</Link>
        </section>
      ) : (
        <div className="mt-8 space-y-5">
          {proposals.map(proposal => {
            const model = bySlug.get(proposal.model_slug) ?? null
            const review = reviews.get(proposal.id)
            const digest = createHash('sha256').update(JSON.stringify(proposal)).digest('hex')
            const changedSinceReview = Boolean(review && review.digest !== digest)
            const current = model ? currentModelEvidenceValue(model, proposal.field) : null
            const upToDate = isEvidenceProposalCurrent(model, proposal)
            const status = changedSinceReview ? 'Previously reviewed ID modified'
              : review ? review.status
                : !model ? 'Model missing'
                  : !upToDate ? 'Stale proposal'
                    : 'Awaiting review'
            return (
              <section key={proposal.id} className="rounded-xl border border-cream-dark bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-navy">{proposal.model_slug}</h2>
                    <p className="mt-1 font-mono text-xs text-grey-blue">{proposal.id} · {proposal.field}</p>
                  </div>
                  <span className="rounded-full bg-cream-dark px-3 py-1 text-xs font-medium text-navy">{status}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-xs text-grey-blue">Expected</p><p className="break-words font-mono text-navy">{show(proposal.expected)}</p></div>
                  <div><p className="text-xs text-grey-blue">Current</p><p className="break-words font-mono text-navy">{show(current)}</p></div>
                  <div><p className="text-xs text-grey-blue">Proposed</p><p className="break-words font-mono text-navy">{show(proposal.proposed)}</p></div>
                </div>
                <p className="mt-4 text-sm text-navy">{proposal.rationale}</p>
                <div className="mt-3 text-xs leading-5 text-grey-blue">
                  <a href={proposal.evidence.url} target="_blank" rel="noopener noreferrer"
                    className="font-medium text-teal underline">{proposal.evidence.title}</a>
                  {' · observed ' + proposal.evidence.observed_on}
                  <p>{proposal.evidence.claim}</p>
                  {proposal.evidence.variant && <p>Evaluation variant: {proposal.evidence.variant}</p>}
                  {proposal.evidence.licence_note && <p>Reuse terms: {proposal.evidence.licence_note}</p>}
                  {proposal.evaluation && <p>Validation plan: {proposal.evaluation}</p>}
                </div>
                {review && (
                  <p className="mt-4 border-t border-cream-dark pt-3 text-xs text-grey-blue">
                    Reviewed {review.reviewedAt}. {review.note ?? ''}{changedSinceReview ? ' Reuse a new proposal ID for later corrections.' : ''}
                  </p>
                )}
                {!review && <ReviewControls id={proposal.id} disabled={!upToDate} />}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
