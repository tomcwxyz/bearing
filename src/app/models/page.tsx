import { getAllModelsLive, isModelClass, type ModelClass } from '@/lib/registry'
import ModelsList from './models-list'

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const allModels = await getAllModelsLive()
  // Deep link from the home-page hint (/models?type=embedding) pre-selects the
  // model-class filter. Anything else falls back to showing all models.
  const { type } = await searchParams
  const initialType: ModelClass | null = isModelClass(type) ? type : null

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Model Registry</h1>
        <ModelsList allModels={allModels} initialType={initialType} />
      </div>
    </div>
  )
}
