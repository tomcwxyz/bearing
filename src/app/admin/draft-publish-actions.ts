'use server'

import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { getAllModelsForAdmin } from '@/db/models'
import { activateDraftSlugs, listDraftPublishMeta } from '@/db/draft-publishing'
import { assessDraftReadiness } from '@/lib/draft-publish'
import { runCatalogueVerification } from '@/lib/verify-catalogue'

export interface BatchPublishResult {
  published: string[]
  skipped: Array<{ slug: string; reason: string }>
}

export async function publishDraftBatch(
  requested: string[],
  acknowledgeWarnings: boolean,
): Promise<BatchPublishResult> {
  const user = await getCurrentUser()
  if (!user || !(await isUserAdmin(user.id))) throw new Error('Not authorised')
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 100 ||
      requested.some(slug => typeof slug !== 'string' || !/^[a-zA-Z0-9._/-]{1,140}$/.test(slug))) {
    throw new Error('Select between 1 and 100 valid draft models')
  }
  const slugs = [...new Set(requested)]
  const [models, metadata] = await Promise.all([getAllModelsForAdmin(), listDraftPublishMeta()])
  const modelMap = new Map(models.map(model => [model.slug, model]))
  const metaMap = new Map(metadata.map(row => [row.slug, row]))
  const eligible: string[] = []
  const skipped: BatchPublishResult['skipped'] = []
  for (const slug of slugs) {
    const model = modelMap.get(slug)
    const meta = metaMap.get(slug)
    if (!model || model.active || !meta) {
      skipped.push({ slug, reason: 'Model is not a draft' })
      continue
    }
    const check = assessDraftReadiness(model, meta)
    if (!check.ready) {
      skipped.push({ slug, reason: check.blockers.join('; ') })
    } else if (check.warnings.length && !acknowledgeWarnings) {
      skipped.push({ slug, reason: 'Confirm editorial warnings before publishing' })
    } else {
      eligible.push(slug)
    }
  }
  const published = await activateDraftSlugs(eligible)
  const publishedSet = new Set(published)
  for (const slug of eligible) {
    if (!publishedSet.has(slug)) skipped.push({ slug, reason: 'No longer a draft' })
  }
  return { published, skipped }
}

/** Verify only selected drafts. Does not publish or change editorial fields. */
export async function verifySelectedDrafts(requested: string[]): Promise<{
  checked: number
  current: number
  attention: number
  unavailable: number
  missing: string[]
  sourceIssues: string[]
}> {
  const user = await getCurrentUser()
  if (!user || !(await isUserAdmin(user.id))) throw new Error('Not authorised')
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 100 ||
    requested.some(slug => typeof slug !== 'string' || !/^[a-zA-Z0-9._/-]{1,140}$/.test(slug))) {
    throw new Error('Select between 1 and 100 valid drafts')
  }
  const selected = [...new Set(requested)]
  const models = await getAllModelsForAdmin()
  const draftSet = new Set(models.filter(model => !model.active).map(model => model.slug))
  const invalid = selected.filter(slug => !draftSet.has(slug))
  if (invalid.length) throw new Error(`Not drafts: ${invalid.join(', ')}`)
  const report = await runCatalogueVerification(selected)
  const checkedSlugs = new Set(report.observations.map(o => o.slug))
  return {
    checked: report.checked, current: report.current,
    attention: report.attention, unavailable: report.unavailable,
    missing: selected.filter(slug => !checkedSlugs.has(slug)),
    sourceIssues: [
      ...report.providerFailures.map(f => `${f.provider}: ${f.error}`),
      ...(report.openRouterFailure ? [`OpenRouter: ${report.openRouterFailure}`] : []),
    ],
  }
}
