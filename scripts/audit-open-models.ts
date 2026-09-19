import { getAllModels } from '../src/lib/registry'
import { isLocalCapableModel, isOpenWeightModel } from '../src/lib/open-local-models'
import { fetchOllamaCloudModels, findOllamaCatalogueMatch } from '../src/lib/ollama-catalogue'
import { fetchHuggingFaceRouterModels } from '../src/lib/huggingface-catalogue'
import { REVIEWED_OPEN_LOCAL_EVIDENCE } from '../src/lib/open-local-evidence'

async function main() {
  const models = getAllModels()
  const open = models.filter(isOpenWeightModel)
  const local = open.filter(isLocalCapableModel)
  const missingLocal = open.filter((model) => !isLocalCapableModel(model))

  console.log('Bearing open/local coverage')
  console.log(`  models: ${models.length}`)
  console.log(`  open-weight: ${open.length}`)
  console.log(`  open-weight with local evidence: ${local.length}`)
  console.log(`  open-weight missing local evidence: ${missingLocal.length}`)

  const reviewedBySlug = new Map(REVIEWED_OPEN_LOCAL_EVIDENCE.map((entry) => [entry.slug, entry]))
  if (missingLocal.length > 0) {
    console.log('\nOpen-weight models missing persisted local_info:')
    for (const model of missingLocal) {
      const reviewed = reviewedBySlug.get(model.slug)
      const status = reviewed ? ` [reviewed: ${reviewed.status}]` : ' [unreviewed]'
      console.log(`  - ${model.slug} — ${model.name}${status}`)
    }
  }

  const confirmedAwaitingBackfill = missingLocal.filter(
    (model) => reviewedBySlug.get(model.slug)?.status === 'confirmed_local',
  )
  console.log(`\nReviewed mappings: ${REVIEWED_OPEN_LOCAL_EVIDENCE.length}`)
  console.log(`  confirmed local awaiting local_info backfill: ${confirmedAwaitingBackfill.length}`)
  console.log(`  unresolved open models: ${missingLocal.filter((model) => !reviewedBySlug.has(model.slug)).length}`)

  try {
    const ollama = await fetchOllamaCloudModels()
    console.log(`\nOllama Cloud catalogue: ${ollama.length} models`)
    for (const model of open) {
      const match = findOllamaCatalogueMatch(ollama, [model.slug, model.name])
      if (match) {
        console.log(`  ✓ ${model.slug} → ${match.model}`)
      }
    }
  } catch (error) {
    console.warn('\nOllama Cloud catalogue unavailable:', error)
  }

  try {
    const hf = await fetchHuggingFaceRouterModels({ token: process.env.HF_TOKEN })
    const hfIds = new Set(hf.map((model) => model.id.toLowerCase()))
    console.log(`\nHugging Face router catalogue: ${hf.length} models`)
    const exactSlugMatches = open.filter((model) =>
      [...hfIds].some((id) => id.endsWith(`/${model.slug.toLowerCase()}`))
    )
    console.log(`  exact slug matches: ${exactSlugMatches.length}`)
    for (const model of exactSlugMatches) {
      console.log(`  ✓ ${model.slug}`)
    }
  } catch (error) {
    console.warn('\nHugging Face router catalogue unavailable:', error)
  }

  console.log('\nAutomatic catalogue matches are never persisted by this audit. Only entries in the reviewed evidence registry may be backfilled.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
