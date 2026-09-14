import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth'
import { listCompletedTasksForUser } from '@/db/tasks'
import { getModel, TASK_TYPE_LABELS } from '@/lib/registry'
import { resumePathForTask } from '@/lib/task-continuity'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

export default async function BearingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')

  const tasks = await listCompletedTasksForUser(user.id)

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-display text-sm font-semibold text-teal">Continuity</p>
            <h1 className="font-display text-3xl font-bold text-navy">My bearings</h1>
            <p className="mt-2 max-w-2xl text-grey-blue">
              Resume completed bearings from this account. Bearing stores the structured task classification and recommendations, not your raw task description.
            </p>
          </div>
          <Link href="/" className="btn-secondary">
            Take a new bearing
          </Link>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-cream-dark bg-white p-8 text-center shadow-sm">
            <h2 className="font-display text-lg font-semibold text-navy">No saved bearings yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-grey-blue">
              Bearings you complete while signed in will appear here. Older anonymous bearings are deliberately not claimed retrospectively.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-lg bg-navy px-5 py-2.5 font-display text-sm font-semibold text-cream transition-colors hover:bg-navy-light"
            >
              Take a bearing
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const model = task.bestModelSlug ? getModel(task.bestModelSlug) : undefined
              const taskLabel = (TASK_TYPE_LABELS as Record<string, string>)[task.taskType] ?? task.taskType
              const resumePath = resumePathForTask({
                id: task.id,
                taskType: task.taskType,
                hasPipeline: task.hasPipeline,
              })

              return (
                <Link
                  key={task.id}
                  href={resumePath}
                  className="block rounded-xl border border-cream-dark bg-white p-5 shadow-sm transition-colors hover:border-teal/50 hover:bg-teal/5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cream-dark px-2.5 py-1 font-display text-xs font-semibold text-navy/70">
                          {taskLabel}
                        </span>
                        {task.hasPipeline && (
                          <span className="rounded-full bg-teal/10 px-2.5 py-1 font-display text-xs font-semibold text-teal">
                            Pipeline
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 font-display text-lg font-semibold text-navy">
                        {model?.name ?? task.bestModelSlug ?? 'Completed bearing'}
                      </h2>
                      <p className="mt-1 text-sm text-grey-blue">
                        Best fit at the time
                        {task.complexity ? ` · ${task.complexity} task` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-navy/45">{formatDate(task.createdAt)}</p>
                      <p className="mt-3 font-display text-sm font-semibold text-teal">Resume →</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <p className="mt-8 text-xs leading-relaxed text-navy/45">
          Only bearings that reached a recommendation are shown. Unfinished clarification sessions are not presented as resumable because Bearing does not retain the raw description needed to reconstruct them safely.
        </p>
      </div>
    </main>
  )
}
