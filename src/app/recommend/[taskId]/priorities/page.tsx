import { redirect } from 'next/navigation'
import { getTask, updateTaskPriorities } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { deriveBearingPriorities } from '@/lib/bearing-policy'
import { getEffectiveBearingPreferenceFactors } from '@/features/bearing/preferences'
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
  const [task, user] = await Promise.all([
    getTask(taskId),
    getCurrentUser(),
  ])

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

  // Preferences only personalise tasks owned by the current account. A shared
  // or anonymous task URL must never inherit whichever user happens to open it.
  const preferredFactors = user && task.user_id === user.id
    ? await getEffectiveBearingPreferenceFactors(user.id).catch((error) => {
        console.warn('[priorities] bearing preferences unavailable', error)
        return []
      })
    : []

  const inferred = deriveBearingPriorities(task, { preferredFactors })
  const existing = parseFactors(task.priority_order)
  const excluded = parseFactors(task.excluded_factors)

  // The normal route still lands here from submitBearingTask/submitClarification,
  // but Bearing does the prioritisation itself and immediately continues to
  // results. `?adjust=1` restores the explicit advanced control. Existing
  // per-task adjustments always win over account defaults.
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
