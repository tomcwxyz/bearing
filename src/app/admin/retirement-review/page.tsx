import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { listRetirementCandidates } from '@/db/model-retirement'

export const dynamic = 'force-dynamic'

export default async function RetirementReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')
  if (!(await isUserAdmin(user.id))) redirect('/')
  const candidates = await listRetirementCandidates()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <Link href="/admin?tab=models" className="text-sm text-teal underline">← Back to models</Link>
      <h1 className="mt-4 font-display text-4xl text-navy">Model retirement review</h1>
      <p className="mt-3 text-sm leading-6 text-navy/70">
        Models missing from the same catalogue in at least two checks over six or more days.
        These are suggestions, not automatic removals. Check other routes and provider notices
        before deactivating. Historical records remain available.
      </p>
      <p className="mt-5 text-sm text-navy/60">{candidates.length} model{candidates.length === 1 ? '' : 's'} to review</p>
      {candidates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-cream-dark bg-white p-6 text-navy/65">
          No sustained unavailability detected yet. Evidence accumulates during weekly catalogue checks.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {candidates.map(model => (
            <article key={model.slug + model.source} className="rounded-lg border border-cream-dark bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-navy">{model.name}</h2>
                  <p className="mt-1 text-xs text-navy/60">{model.provider} · {model.slug}</p>
                </div>
                <span className="text-xs font-medium text-coral">{model.active ? 'Live · review retirement' : 'Inactive · check restoration'}</span>
              </div>
              <p className="mt-3 text-sm text-navy/70">{model.missingChecks} consecutive missing checks · {model.source}</p>
              <p className="mt-1 text-xs text-navy/55">First: {new Date(model.firstMissingAt).toLocaleDateString('en-GB')} · Latest: {new Date(model.lastMissingAt).toLocaleDateString('en-GB')}</p>
              {model.note && <p className="mt-2 text-xs text-navy/60">{model.note}</p>}
              <Link className="mt-3 inline-block text-sm text-teal underline" href={`/admin/models/${encodeURIComponent(model.slug)}`}>Review and edit model</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
