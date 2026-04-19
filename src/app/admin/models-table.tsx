'use client'

import Link from 'next/link'
import type { AdminModel } from '@/lib/db'

export default function ModelsTable({ models }: { models: AdminModel[] }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-navy/60">
          {models.length} models in registry
        </p>
        <Link href="/admin/models/new" className="btn-primary text-sm">
          Add Model
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-cream-dark">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-dark/60">
            <tr>
              <th className="px-3 py-2 font-medium text-navy">Name</th>
              <th className="px-3 py-2 font-medium text-navy">Provider</th>
              <th className="px-3 py-2 font-medium text-navy">Tier</th>
              <th className="px-3 py-2 font-medium text-navy">Speed</th>
              <th className="px-3 py-2 font-medium text-navy">Pricing</th>
              <th className="px-3 py-2 font-medium text-navy"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {models.map((model) => (
              <tr key={model.slug} className="hover:bg-cream-dark/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy">{model.name}</span>
                    {!model.active && (
                      <span className="rounded-full border border-coral/40 bg-coral/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-coral">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-navy/50">{model.slug}</div>
                </td>
                <td className="px-3 py-2 text-navy/70">{model.provider}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-cream-dark px-2 py-0.5 font-mono text-xs text-navy">
                    {model.tier.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  {model.speed_score.toFixed(2)}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-navy/70">
                  ${model.pricing.input_per_1m}/{model.pricing.output_per_1m}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/models/${model.slug}`}
                    className="text-teal hover:text-teal-light text-sm underline underline-offset-2"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
