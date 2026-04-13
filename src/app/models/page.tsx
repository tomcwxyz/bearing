import { getAllModelsLive } from '@/lib/registry'
import ModelsList from './models-list'

export default async function ModelsPage() {
  const allModels = await getAllModelsLive()

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <h1 className="font-display text-4xl text-navy">Model Registry</h1>
        <ModelsList allModels={allModels} />
      </div>
    </div>
  )
}
