import { getResults } from '@/app/actions'
import { ResultsClient } from './results-client'

export default async function ResultsPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const result = await getResults(taskId)

  if ('error' in result && result.error) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-2 font-display text-navy">Something went wrong</h2>
          <p className="text-grey-blue">{result.error}</p>
        </div>
      </main>
    )
  }

  const { task, models, reasoning } = result as {
    task: { task_type: string }
    models: import('@/lib/scoring').ScoredModel[]
    reasoning: Record<string, string>
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2 font-display text-navy">Your results</h2>
        <p className="text-grey-blue mb-8">
          Ranked for <strong>{task.task_type}</strong> tasks based on your priorities
        </p>
        <ResultsClient taskId={taskId} models={models} reasoning={reasoning} />
      </div>
    </main>
  )
}
