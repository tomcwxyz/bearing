import { getAllModelsLive } from '@/lib/registry'
import ValidateForm from './validate-form'

// Prevent a build-time snapshot: model choices reflect the current live DB.
export const dynamic = 'force-dynamic'

export default async function ValidatePage() {
  const models = await getAllModelsLive()
  return <ValidateForm modelOptions={models.map(({ slug, name, provider }) => ({
    slug, name, provider,
  }))} />
}
