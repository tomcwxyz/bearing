import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getModelAdmin } from '@/app/admin/actions'
import {
  getModelExternalIdsAdmin,
  saveModelExternalIdsAdmin,
} from '@/app/admin/model-mapping-actions'

export default async function ModelIdentifiersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [model, ids] = await Promise.all([
    getModelAdmin(slug),
    getModelExternalIdsAdmin(slug),
  ])

  if (!model) notFound()

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl space-y-8">
        <div>
          <Link href="/admin" className="text-sm text-teal hover:text-teal-light">
            ← Back to models
          </Link>
          <h1 className="mt-4 font-display text-3xl text-navy">Catalogue identifiers</h1>
          <p className="mt-2 text-sm text-navy/60">
            {model.name} · <span className="font-mono">{model.slug}</span>
          </p>
        </div>

        <div className="rounded-lg border border-teal/20 bg-teal/5 px-4 py-3 text-sm leading-relaxed text-navy/75">
          Use exact IDs from provider or OpenRouter documentation. Bearing deliberately does not infer these from model names: an uncertain mapping should stay blank rather than produce false availability evidence.
        </div>

        <form action={saveModelExternalIdsAdmin} className="space-y-6 rounded-xl border border-cream-dark bg-white p-6 shadow-sm">
          <input type="hidden" name="slug" value={model.slug} />

          <label className="block">
            <span className="font-display text-sm font-medium text-navy">Provider-native model ID</span>
            <span className="mt-1 block text-xs leading-relaxed text-navy/50">
              Canonical API identifier from {model.provider}, used as the primary freshness source when that provider adapter is configured.
            </span>
            <input
              name="provider_model_id"
              defaultValue={ids.providerModelId ?? ''}
              placeholder="e.g. claude-sonnet-5"
              className="input-field mt-2 font-mono"
              autoComplete="off"
            />
          </label>

          <label className="block">
            <span className="font-display text-sm font-medium text-navy">OpenRouter ID</span>
            <span className="mt-1 block text-xs leading-relaxed text-navy/50">
              Optional fallback catalogue mapping. Keep blank when the model is not exposed through OpenRouter.
            </span>
            <input
              name="openrouter_id"
              defaultValue={ids.openrouterId ?? ''}
              placeholder="e.g. anthropic/claude-sonnet-5"
              className="input-field mt-2 font-mono"
              autoComplete="off"
            />
          </label>

          <div className="flex items-center justify-end gap-3 border-t border-cream-dark pt-5">
            <Link href="/admin" className="text-sm text-navy/60 hover:text-navy">
              Cancel
            </Link>
            <button type="submit" className="btn-primary text-sm">
              Save identifiers
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
