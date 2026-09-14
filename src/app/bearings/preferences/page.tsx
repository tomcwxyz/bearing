import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import {
  LEARNABLE_PREFERENCE_FACTORS,
  type LearnablePreferenceFactor,
} from '@/lib/bearing-preferences'
import { getBearingPreferenceProfile } from '@/features/bearing/preferences'
import {
  resetBearingPreferences,
  saveBearingPreferences,
} from '@/features/bearing/preference-actions'

const FACTOR_COPY: Record<LearnablePreferenceFactor, { label: string; detail: string }> = {
  cost: {
    label: 'Cost sensitivity',
    detail: 'Give lower-cost credible models a little more influence in the automatic bearing.',
  },
  speed: {
    label: 'Speed',
    detail: 'Give faster credible models a little more influence when the task itself does not already demand realtime performance.',
  },
  privacy: {
    label: 'Privacy / local control',
    detail: 'Give privacy and local-control trade-offs more influence. Hard on-prem requirements remain task-level constraints.',
  },
  transparency: {
    label: 'Transparency',
    detail: 'Give open weights, methodology and provider disclosure a little more influence.',
  },
  sustainability: {
    label: 'Sustainability',
    detail: 'Give lower-impact models a little more influence when other task requirements allow it.',
  },
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default async function BearingPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reset?: string; error?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const [{ saved, reset, error }, profile] = await Promise.all([
    searchParams,
    getBearingPreferenceProfile(user.id),
  ])

  const manual = new Set(profile.settings.manualFactors)
  const learned = new Set(profile.learned.factors)
  const effective = new Set(profile.effectiveFactors)

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-display text-sm font-semibold text-teal">Inspectable defaults</p>
            <h1 className="font-display text-3xl font-bold text-navy">Bearing preferences</h1>
            <p className="mt-2 max-w-2xl text-grey-blue">
              Bearing can notice repeated trade-offs in the models you choose. These are small, visible nudges to automatic priorities — never hidden rules or capability exclusions.
            </p>
          </div>
          <Link href="/bearings" className="btn-secondary">Back to My bearings</Link>
        </div>

        {(saved === '1' || reset === '1' || error) && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            error ? 'border-coral/30 bg-coral/5 text-coral' : 'border-teal/30 bg-teal/5 text-teal'
          }`}>
            {error
              ? 'Bearing could not save that preference change. Migration 031 may not be applied yet.'
              : reset === '1'
                ? 'Preferences reset. Older experiment choices no longer influence your defaults; future choices can teach Bearing again.'
                : 'Bearing preferences saved.'}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-cream-dark bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-navy">What Bearing has noticed</h2>
          <p className="mt-2 text-sm leading-relaxed text-grey-blue">
            Learning uses only authenticated preferences you submit after Trio or Challenger experiments. It compares the structured factor scores recorded for those models; raw task descriptions and prompts are not used, and anonymous or shared-task clicks cannot affect this profile.
          </p>

          {profile.learned.decisions < 3 ? (
            <div className="mt-5 rounded-lg bg-cream/60 p-4">
              <p className="font-display text-sm font-semibold text-navy">Not enough evidence yet</p>
              <p className="mt-1 text-sm leading-relaxed text-grey-blue">
                Bearing has {profile.learned.decisions} usable override {profile.learned.decisions === 1 ? 'experiment' : 'experiments'}. It waits for at least three before learning a default, so one unusual decision cannot personalise future bearings.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {profile.learned.signals.map((signal) => (
                <div key={signal.factor} className="rounded-lg border border-cream-dark px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-semibold text-navy">
                        {FACTOR_COPY[signal.factor].label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-grey-blue">
                        {signal.support} of {signal.decisions} comparable override experiments moved materially towards this factor
                        {signal.support > 0 ? ` · average advantage ${pct(signal.meanPositiveDelta)}` : ''}.
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 font-display text-xs font-semibold ${
                      signal.learned
                        ? 'bg-teal/10 text-teal'
                        : 'bg-cream-dark text-navy/55'
                    }`}>
                      {signal.learned ? 'Learned default' : 'Watching'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <form action={saveBearingPreferences} className="rounded-xl border border-cream-dark bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="font-display text-xl font-semibold text-navy">Your defaults</h2>
              <p className="mt-2 text-sm leading-relaxed text-grey-blue">
                Explicit defaults and sufficiently supported learned defaults are combined. They only nudge the automatic bearing; task evidence still leads, and Adjust bearing always overrides them for that task.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                name="learning_enabled"
                defaultChecked={profile.settings.learningEnabled}
                className="h-4 w-4 accent-teal"
              />
              Learn from my choices
            </label>
          </div>

          <div className="mt-6 space-y-3">
            {LEARNABLE_PREFERENCE_FACTORS.map((factor) => (
              <label
                key={factor}
                className={`block cursor-pointer rounded-lg border px-4 py-4 transition-colors ${
                  effective.has(factor) ? 'border-teal/40 bg-teal/5' : 'border-cream-dark'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="preferred_factor"
                    value={factor}
                    defaultChecked={manual.has(factor)}
                    className="mt-1 h-4 w-4 accent-teal"
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-navy">
                        {FACTOR_COPY[factor].label}
                      </span>
                      {learned.has(factor) && (
                        <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-semibold text-teal">
                          learned
                        </span>
                      )}
                      {manual.has(factor) && (
                        <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[11px] font-semibold text-navy/60">
                          explicit
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-grey-blue">
                      {FACTOR_COPY[factor].detail}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cream-dark pt-5">
            <p className="text-xs leading-relaxed text-navy/45">
              Hard requirements such as vision, tool use, context length and on-prem hosting are never weakened by these preferences.
            </p>
            <button
              type="submit"
              className="rounded-lg bg-navy px-5 py-2.5 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light"
            >
              Save preferences
            </button>
          </div>
        </form>

        <form action={resetBearingPreferences} className="mt-4 text-right">
          <button type="submit" className="text-sm text-navy/55 underline hover:text-navy">
            Reset preference settings and learning history
          </button>
        </form>
      </div>
    </main>
  )
}
