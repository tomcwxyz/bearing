import { redirect } from 'next/navigation'
import { getTask, updateTaskPriorities } from '@/lib/db'
import { deriveBearingPriorities } from '@/lib/bearing-policy'
import type { Factor } from '@/lib/registry'
import { PrioritiesClient } from './priorities-client'

function parseFactors(value: unknown): Factor[] {
  if (!value) return []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return Array.isArray(parsed) ? parsed as Factor[] : []
  } catch {
    return []
  }
}

export default async function PrioritiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>
  searchParams: Promise<{ adjust?: string | string[] }>
}) {
  const { taskId } = await params
  const { adjust } = await searchParams
  const task = await getTask(taskId)

  if (!task) {
    return (
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-2xl font-bold text-navy">Task not found</h1>
          <p className="mt-2 text-grey-blue">Start a new bearing and try again.</p>
        </div>
      </main>
    )
  }

  const inferred = deriveBearingPriorities(task)
  const existing = parseFactors(task.priority_order)
  const excluded = parseFactors(task.excluded_factors)

  // The normal route still lands here from submitTask/submitClarification,
  // but Bearing now does the prioritisation itself and immediately continues
  // to results. `?adjust=1` turns this route back into the explicit advanced
  // control for people who want to override the automatic bearing.
  if (adjust !== '1') {
    await updateTaskPriorities(taskId, inferred, [])
    redirect(`/recommend/${taskId}/results`)
  }

  return (
    <PrioritiesClient
      initialOrder={existing.length > 0 ? existing : inferred}
      initialExcluded={excluded}
    />
  )
}
