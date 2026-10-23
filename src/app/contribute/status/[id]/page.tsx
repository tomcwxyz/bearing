import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFeedbackStatus } from '@/db/community-feedback'
export const dynamic='force-dynamic'
export default async function StatusPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params
 const entry=await getFeedbackStatus(id)
 if (!entry) notFound()
 const label=entry.status==='pending'?'Awaiting review':entry.status==='reviewed'?'Reviewed':'Closed without change'
 return <main className="mx-auto max-w-xl px-4 py-20 text-navy">
  <h1 className="font-display text-4xl">Contribution status</h1>
  <p className="mt-4 rounded-lg bg-cream-dark p-4 font-semibold">{label}</p>
  <p className="mt-4 text-sm text-grey-blue">Submitted {new Date(entry.createdAt).toLocaleDateString('en-GB')}. A reviewed report does not necessarily mean the model was changed: any correction requires separate source verification and an auditable decision.</p>
  <Link href="/contribute" className="mt-6 inline-block text-teal underline">Contribute again</Link>
 </main>
}
