import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { listFeedback } from '@/db/community-feedback'
import { decideFeedback } from './actions'
export const dynamic='force-dynamic'
export default async function FeedbackReviewPage(){
 const user=await getCurrentUser()
 if (!user) redirect('/auth/signin')
 if (!await isUserAdmin(user.id)) redirect('/')
 const reports=await listFeedback()
 return <main className="mx-auto max-w-4xl px-4 py-12">
  <Link href="/admin/evidence-proposals" className="text-teal underline">← Evidence review</Link>
  <h1 className="mt-5 font-display text-4xl text-navy">Community feedback</h1>
  <p className="mt-3 text-grey-blue">Review plain-language contributions. Marking a report reviewed does not change canonical model data; material corrections require a structured, sourced evidence proposal.</p>
  <div className="mt-8 space-y-5">{reports.map(r=><section key={String(r.id)} className="rounded-xl border border-cream-dark bg-white p-5">
   <p className="text-xs font-mono text-grey-blue">{String(r.kind)} · {String(r.model_slug??'General')} · {String(r.status)} · {String(r.created_at)}</p>
   <p className="mt-3 whitespace-pre-wrap break-words text-navy">{String(r.description)}</p>
   {r.evidence_url && <a href={String(r.evidence_url)} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block break-all text-teal underline">Submitted evidence link</a>}
   {r.status==='pending'?<form action={decideFeedback} className="mt-4 space-y-3">
    <input type="hidden" name="id" value={String(r.id)}/>
    <label className="block text-sm" htmlFor={'note-'+r.id}>Decision rationale</label>
    <textarea id={'note-'+r.id} name="note" minLength={10} maxLength={1500} required className="w-full rounded border p-2"/>
    <div className="flex gap-3"><button name="decision" value="reviewed" className="rounded bg-teal px-4 py-2 text-white">Reviewed</button><button name="decision" value="dismissed" className="rounded border px-4 py-2">Dismiss</button></div>
   </form>:<p className="mt-3 text-sm text-grey-blue">Decision: {String(r.review_note??'')}</p>}
  </section>)}{reports.length===0&&<p className="text-grey-blue">No submissions yet.</p>}</div>
 </main>
}
