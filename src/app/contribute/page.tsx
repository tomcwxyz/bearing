import Link from 'next/link'
import { submitCommunityFeedback } from './actions'
import { getAllModelsLive } from '@/lib/registry'

export const dynamic = 'force-dynamic'
export default async function ContributePage({searchParams}: {searchParams:Promise<{model?:string;limited?:string}>}) {
  const params=await searchParams
  const models=await getAllModelsLive()
  return <main className="mx-auto max-w-2xl px-4 py-12 text-navy">
    <h1 className="font-display text-4xl">Help improve Bearing</h1>
    <p className="mt-4 text-grey-blue">You can correct model information, question a recommendation or suggest a better approach. You don't need GitHub or programming knowledge.</p>
    {params.limited && <p role="alert" className="mt-5 rounded-lg border border-coral p-3">We couldn't accept another report right now. Please try again later or use <a className="underline" href="https://github.com/tomcwxyz/bearing/issues">GitHub Issues</a>.</p>}
    <form action={submitCommunityFeedback} className="mt-8 space-y-5 rounded-xl border border-cream-dark bg-white p-6">
      <label className="block font-semibold" htmlFor="kind">What would you like to share?</label>
      <select id="kind" name="kind" required defaultValue={params.model?'model_correction':'recommendation'} className="w-full rounded-lg border border-cream-dark p-3">
        <option value="model_correction">Correct model information</option><option value="recommendation">Question a recommendation</option><option value="methodology">Challenge the methodology</option><option value="usability">Improve the experience</option>
      </select>
      <label className="block font-semibold" htmlFor="model_slug">Model (optional)</label>
      <select id="model_slug" name="model_slug" defaultValue={models.some(m=>m.slug===params.model)?params.model:''} className="w-full rounded-lg border border-cream-dark p-3">
        <option value="">Not about a specific model</option>{models.map(m=><option key={m.slug} value={m.slug}>{m.name} — {m.provider}</option>)}
      </select>
      <label className="block font-semibold" htmlFor="description">What did you notice?</label>
      <textarea id="description" name="description" minLength={20} maxLength={2500} rows={6} required className="w-full rounded-lg border border-cream-dark p-3" placeholder="Explain the issue, what you expected and why. Please don't include private prompts or personal information."/>
      <label className="block font-semibold" htmlFor="evidence_url">Source or evidence link (optional)</label>
      <input type="url" id="evidence_url" name="evidence_url" placeholder="https://…" className="w-full rounded-lg border border-cream-dark p-3"/>
      <div className="hidden" aria-hidden="true"><label htmlFor="website">Leave blank</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
      <p className="text-sm text-grey-blue">Submissions go to a human review queue. They do not automatically change recommendations or the catalogue. Avoid private data; do not submit secrets or real task text.</p>
      <button type="submit" className="rounded-lg bg-navy px-6 py-3 font-semibold text-white hover:bg-teal">Send for review</button>
    </form>
    <p className="mt-6 text-sm text-grey-blue">Prefer to contribute code or structured evidence? See <Link className="underline" href="https://github.com/tomcwxyz/bearing/blob/master/CONTRIBUTING.md">the developer guide</Link>.</p>
  </main>
}
