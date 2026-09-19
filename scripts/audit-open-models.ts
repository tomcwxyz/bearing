import { getAllModels } from '../src/lib/registry'
import { isLocalCapableModel, isOpenWeightModel } from '../src/lib/open-local-models'
import { fetchOllamaCloudModels, findOllamaCatalogueMatch } from '../src/lib/ollama-catalogue'
import { fetchHuggingFaceRouterModels } from '../src/lib/huggingface-catalogue'

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

  if (missingLocal.length > 0) {
    console.log('\nOpen-weight models missing local evidence:')
    for (const model of missingLocal) {
      console.log(`  - ${model.slug} — ${model.name}`)
    }
  }

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

  console.log('\nNo catalogue match is persisted by this audit. External evidence stays observational until reviewed.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
