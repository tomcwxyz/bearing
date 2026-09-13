import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/lib/db'
import {
  getCatalogueDriftReview,
  type CatalogueDriftChange,
} from '@/lib/catalogue-drift'
import { acceptCatalogueDriftAdmin } from '../catalogue-review-actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function money(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function fieldLabel(change: CatalogueDriftChange): string {
  switch (change.field) {
    case 'input_price': return 'Input price'
    case 'output_price': return 'Output price'
    case 'context_window': return 'Context window'
    case 'capabilities': return 'Observable capabilities'
  }
}

function valueLabel(change: CatalogueDriftChange, side: 'before' | 'after'): string {
  const value = change[side]
  if (change.field === 'input_price' || change.field === 'output_price') {
    return `${money(value as number)}/M`
  }
  if (change.field === 'context_window') {
    return `${(value as number).toLocaleString()} tokens`
  }
  return (value as string[]).join(', ') || 'none'
}

export default async function CatalogueReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')
  const admin = await isUserAdmin(user.id)
  if (!admin) redirect('/')

  const review = await getCatalogueDriftReview()
  const changeCount = review.items.reduce((sum, item) => sum + item.changes.length, 0)
  const availabilityCount = review.items.filter((item) => item.availabilityConcern).length

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-4xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin?tab=models" className="text-sm text-teal hover:text-teal-light">
              ← Back to models
            </Link>
            <h1 className="mt-3 font-display text-4xl text-navy">Catalogue review</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-navy/65">
              Review metadata that external catalogues disagree with. Nothing here changes the registry
              until you accept it, and availability evidence never deactivates a model automatically.
            </p>
          </div>
          <div className="text-sm text-navy/55 sm:text-right">
            <div>{changeCount} metadata change{changeCount === 1 ? '' : 's'}</div>
            <div>{availabilityCount} availability concern{availabilityCount === 1 ? '' : 's'}</div>
          </div>
        </div>

        {(review.openRouterFailure || review.providerFailures.length > 0 || review.skippedProviders.length > 0) && (
          <details className="mt-6 rounded-lg border border-cream-dark bg-white/40 px-4 py-3 text-sm text-navy/65">
            <summary className="cursor-pointer font-medium text-navy">Source coverage</summary>
            <div className="mt-3 space-y-2 text-xs leading-5">
              {review.openRouterFailure && (
                <p><span className="font-medium">OpenRouter failed:</span> {review.openRouterFailure}</p>
              )}
              {review.providerFailures.map((failure) => (
                <p key={failure.provider}>
                  <span className="font-medium">{failure.provider} failed:</span> {failure.error}
                </p>
              ))}
              {review.skippedProviders.map((skipped) => (
                <p key={skipped.provider}>
                  <span className="font-medium">{skipped.provider} skipped:</span> {skipped.reason}
                </p>
              ))}
            </div>
          </details>
        )}

        {review.items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-teal/25 bg-teal/5 p-6">
            <h2 className="font-display text-2xl text-navy">No current drift to review</h2>
            <p className="mt-2 text-sm text-navy/65">
              The catalogue sources that were available agree with Bearing&apos;s current model metadata.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {review.items.map((item) => (
              <section key={item.slug} className="rounded-xl border border-cream-dark bg-white/55 p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-display text-2xl text-navy">{item.name}</h2>
                    <div className="mt-1 font-mono text-xs text-navy/45">{item.slug} · {item.provider}</div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <Link
                      href={`/admin/models/${item.slug}/identifiers`}
                      className="text-navy/55 underline underline-offset-2 hover:text-navy"
                    >
                      IDs
                    </Link>
                    <Link
                      href={`/admin/models/${item.slug}`}
                      className="text-teal underline underline-offset-2 hover:text-teal-light"
                    >
                      Edit model
                    </Link>
                  </div>
                </div>

                {item.availabilityConcern && (
                  <div className="mt-4 rounded-lg border border-coral/30 bg-coral/5 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-coral">Availability review</div>
                    <p className="mt-1 text-sm leading-5 text-navy/70">{item.availabilityConcern.message}</p>
                    <div className="mt-1 font-mono text-[10px] text-navy/45">{item.availabilityConcern.source}</div>
                  </div>
                )}

                {item.changes.length > 0 && (
                  <form action={acceptCatalogueDriftAdmin} className="mt-4">
                    <input type="hidden" name="slug" value={item.slug} />
                    <div className="overflow-hidden rounded-lg border border-cream-dark">
                      {item.changes.map((change) => (
                        <label
                          key={change.field}
                          className="grid cursor-pointer gap-3 border-b border-cream-dark px-4 py-3 last:border-b-0 sm:grid-cols-[auto_1fr_1fr] sm:items-center"
                        >
                          <div className="flex items-center gap-3 sm:col-span-1">
                            <input
                              type="checkbox"
                              name="field"
                              value={change.field}
                              defaultChecked
                              className="h-4 w-4 accent-teal"
                            />
                            <span className="min-w-32 text-sm font-medium text-navy">{fieldLabel(change)}</span>
                          </div>
                          <div className="text-xs text-navy/50">
                            <div className="mb-1 uppercase tracking-wide">Bearing</div>
                            <div className="break-words font-mono text-navy/70">{valueLabel(change, 'before')}</div>
                          </div>
                          <div className="text-xs text-navy/50">
                            <div className="mb-1 uppercase tracking-wide">Observed · {change.source}</div>
                            <div className="break-words font-mono text-navy">{valueLabel(change, 'after')}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <p className="text-xs leading-5 text-navy/50">
                        Values are re-fetched server-side before they are applied, then catalogue verification runs again.
                      </p>
                      <button type="submit" className="btn-primary shrink-0 text-sm">
                        Accept selected
                      </button>
                    </div>
                  </form>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
