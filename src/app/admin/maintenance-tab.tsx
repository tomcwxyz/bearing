'use client'

import { useState, useTransition } from 'react'
import {
  runCatalogueMaintenance,
  runEcoLogitsMaintenance,
  runRoutabilityMaintenance,
  type MaintenanceRunResult,
  type MaintenanceState,
} from './maintenance-actions'

interface MaintenanceTabProps {
  initialData: MaintenanceState
}

function formatCheckedAt(value: string): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MaintenanceTab({ initialData }: MaintenanceTabProps) {
  const [routability, setRoutability] = useState(initialData.routability)
  const [message, setMessage] = useState<string | null>(null)
  const [messageOk, setMessageOk] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const counts = routability.reduce(
    (acc, row) => {
      acc[row.status] += 1
      return acc
    },
    { healthy: 0, degraded: 0, unavailable: 0, unknown: 0 },
  )

  function run(label: string, action: () => Promise<MaintenanceRunResult>) {
    setPendingAction(label)
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      if (result.routability) setRoutability(result.routability)
      setMessage(result.message)
      setMessageOk(result.success)
      setPendingAction(null)
    })
  }

  return (
    <div className="space-y-6">
      {!initialData.cronConfigured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Scheduled maintenance is not authenticated.</p>
          <p className="mt-1">
            <code>CRON_SECRET</code> is missing from the production environment, so Vercel cron requests fail closed before these jobs run. Add the secret in Vercel to restore unattended maintenance. Manual controls below remain admin-only.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-cream-dark bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-navy/45">Cron auth</p>
          <p className="mt-2 text-lg font-semibold text-navy">{initialData.cronConfigured ? 'Configured' : 'Missing'}</p>
        </div>
        <div className="rounded-xl border border-cream-dark bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-navy/45">Healthy routes</p>
          <p className="mt-2 text-lg font-semibold text-navy">{counts.healthy}</p>
        </div>
        <div className="rounded-xl border border-cream-dark bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-navy/45">Degraded routes</p>
          <p className="mt-2 text-lg font-semibold text-navy">{counts.degraded}</p>
        </div>
        <div className="rounded-xl border border-cream-dark bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-navy/45">Unavailable routes</p>
          <p className="mt-2 text-lg font-semibold text-navy">{counts.unavailable}</p>
        </div>
      </div>

      <div className="rounded-xl border border-cream-dark bg-white p-5">
        <div>
          <h2 className="font-display text-2xl text-navy">Run maintenance</h2>
          <p className="mt-1 max-w-2xl text-sm text-navy/60">
            These controls use your admin session. Routability probes execute active chat models and may incur small provider costs; degraded results never remove a model from routing.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run('routability', runRoutabilityMaintenance)}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-cream disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && pendingAction === 'routability' ? 'Checking routes…' : 'Check routability'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run('catalogue', runCatalogueMaintenance)}
            className="rounded-lg border border-navy/20 px-4 py-2 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && pendingAction === 'catalogue' ? 'Verifying catalogue…' : 'Verify catalogue'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run('ecologits', runEcoLogitsMaintenance)}
            className="rounded-lg border border-navy/20 px-4 py-2 text-sm font-medium text-navy disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && pendingAction === 'ecologits' ? 'Refreshing EcoLogits…' : 'Refresh EcoLogits'}
          </button>
        </div>

        {message && (
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${messageOk ? 'bg-teal/10 text-navy' : 'bg-red-50 text-red-800'}`}>
            {message}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-cream-dark bg-white">
        <div className="border-b border-cream-dark px-5 py-4">
          <h2 className="font-display text-2xl text-navy">Runtime observations</h2>
          <p className="mt-1 text-sm text-navy/60">
            Evidence only. A degraded check means the route could not be proven healthy; it is not evidence that the model has disappeared.
          </p>
        </div>

        {routability.length === 0 ? (
          <p className="px-5 py-8 text-sm text-navy/50">No routability observations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-cream/60 text-xs uppercase tracking-wide text-navy/45">
                <tr>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Failures</th>
                  <th className="px-5 py-3 font-medium">Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {routability.map((row) => (
                  <tr key={row.slug}>
                    <td className="px-5 py-3 font-medium text-navy">{row.slug}</td>
                    <td className="px-5 py-3 text-navy/75">{row.status}</td>
                    <td className="px-5 py-3 text-navy/60">{row.source}</td>
                    <td className="px-5 py-3 text-navy/60">{row.consecutiveFailures}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-navy/60">{formatCheckedAt(row.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
