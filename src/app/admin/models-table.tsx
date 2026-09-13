'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AdminModel } from '@/lib/db'
import type { ModelVerificationSummary } from '@/db/model-verification'
import { assessModelFreshness, freshnessLabel } from '@/lib/model-freshness'
import { verifyOpenRouterCatalogueAdmin } from './freshness-actions'

function ageLabel(ageDays: number | null): string {
  if (ageDays == null) return 'never'
  if (ageDays < 1) return '<1d ago'
  return `${Math.floor(ageDays)}d ago`
}

function isCatalogueLinked(summary: ModelVerificationSummary): boolean {
  return Boolean(summary.providerModelId || summary.openrouterId)
}

function freshnessClasses(summary: ModelVerificationSummary): string {
  if (!isCatalogueLinked(summary)) return 'border-navy/15 bg-navy/5 text-navy/60'
  const assessment = assessModelFreshness(summary)
  if (assessment.status === 'current' && !assessment.isStale) {
    return 'border-teal/30 bg-teal/5 text-teal'
  }
  if (assessment.status === 'unavailable') {
    return 'border-coral/50 bg-coral/10 text-coral'
  }
  return 'border-coral/30 bg-coral/5 text-coral'
}

function FreshnessCell({ summary }: { summary?: ModelVerificationSummary }) {
  if (!summary) {
    return <span className="text-xs text-navy/40">Not loaded</span>
  }

  if (!isCatalogueLinked(summary)) {
    return (
      <span className="rounded-full border border-navy/15 bg-navy/5 px-2 py-0.5 text-[10px] font-medium text-navy/60">
        No catalogue link
      </span>
    )
  }

  const assessment = assessModelFreshness(summary)
  const mappingSource = summary.providerModelId ? 'provider' : 'OpenRouter'
  return (
    <div className="space-y-1" title={summary.verification_note ?? summary.verification_source ?? undefined}>
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${freshnessClasses(summary)}`}>
        {freshnessLabel(assessment)}
      </span>
      <div className="font-mono text-[10px] text-navy/45">
        {mappingSource} · {ageLabel(assessment.ageDays)}
      </div>
    </div>
  )
}

export default function ModelsTable({
  models,
  verification,
}: {
  models: AdminModel[]
  verification: ModelVerificationSummary[]
}) {
  const router = useRouter()
  const [isVerifying, startVerifying] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const verificationBySlug = useMemo(
    () => new Map(verification.map((row) => [row.slug, row])),
    [verification],
  )

  const activeVerification = verification.filter((row) => row.active)
  const mappedCount = activeVerification.filter(isCatalogueLinked).length
  const providerMappedCount = activeVerification.filter((row) => row.providerModelId).length
  const needsAttentionCount = activeVerification.filter((row) => (
    isCatalogueLinked(row) ? assessModelFreshness(row).needsAttention : false
  )).length

  function verifyCatalogue() {
    setFeedback(null)
    startVerifying(async () => {
      const result = await verifyOpenRouterCatalogueAdmin()
      if (!result.success || !result.report) {
        setFeedback(result.error ?? 'Catalogue verification failed.')
        return
      }

      const report = result.report
      setFeedback(
        `Checked ${report.checked} models: ${report.current} current, ${report.attention} need review, ${report.unavailable} unavailable.`,
      )
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-navy/60">
            {models.length} models in registry
          </p>
          {verification.length > 0 ? (
            <p className="mt-1 text-xs text-navy/45">
              {mappedCount} active models linked to a catalogue · {providerMappedCount} provider-native
              {needsAttentionCount > 0 ? ` · ${needsAttentionCount} need attention` : ' · catalogue looks current'}
            </p>
          ) : (
            <p className="mt-1 text-xs text-coral/80">
              Freshness data is not available yet. Apply the latest catalogue migrations to enable verification.
            </p>
          )}
          {feedback && (
            <p className="mt-2 text-xs text-navy/70">{feedback}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={verifyCatalogue}
            disabled={isVerifying}
            className="rounded-md border border-teal/30 px-3 py-2 text-sm font-medium text-teal transition-colors hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isVerifying ? 'Verifying…' : 'Verify catalogue'}
          </button>
          <Link href="/admin/models/new" className="btn-primary text-sm">
            Add Model
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-cream-dark">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-dark/60">
            <tr>
              <th className="px-3 py-2 font-medium text-navy">Name</th>
              <th className="px-3 py-2 font-medium text-navy">Provider</th>
              <th className="px-3 py-2 font-medium text-navy">Tier</th>
              <th className="px-3 py-2 font-medium text-navy">Freshness</th>
              <th className="px-3 py-2 font-medium text-navy">Speed</th>
              <th className="px-3 py-2 font-medium text-navy">Pricing</th>
              <th className="px-3 py-2 font-medium text-navy"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {models.map((model) => (
              <tr key={model.slug} className="hover:bg-cream-dark/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy">{model.name}</span>
                    {!model.active && (
                      <span className="rounded-full border border-coral/40 bg-coral/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-coral">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-navy/50">{model.slug}</div>
                </td>
                <td className="px-3 py-2 text-navy/70">{model.provider}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-cream-dark px-2 py-0.5 font-mono text-xs text-navy">
                    {model.tier.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <FreshnessCell summary={verificationBySlug.get(model.slug)} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  {model.speed_score.toFixed(2)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  ${model.pricing.input_per_1m}/{model.pricing.output_per_1m}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/admin/models/${model.slug}/identifiers`}
                      className="text-navy/55 hover:text-navy text-sm underline underline-offset-2"
                    >
                      IDs
                    </Link>
                    <Link
                      href={`/admin/models/${model.slug}`}
                      className="text-teal hover:text-teal-light text-sm underline underline-offset-2"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
