import Link from 'next/link'
export default async function SubmittedPage({searchParams}:{searchParams:Promise<{id?:string}>}){
 const {id}=await searchParams
 const valid=typeof id==='string' && /^[0-9a-f-]{36}$/i.test(id)
 return <main className="mx-auto max-w-2xl px-4 py-20 text-navy">
  <h1 className="font-display text-4xl">Thanks for helping improve Bearing</h1>
  <p className="mt-5 text-grey-blue">Your submission has been sent for review. Nothing changes automatically; a maintainer will inspect the evidence before acting.</p>
  {valid && <section className="mt-6 rounded-xl border border-cream-dark bg-white p-5">
    <p className="text-sm font-semibold">Your private reference</p>
    <p className="mt-1 break-all font-mono text-sm">{id}</p>
    <p className="mt-2 text-sm text-grey-blue">Save this link to check your report&apos;s review status. Anyone with this link can see the status, but not your submission text.</p>
    <Link href={'/contribute/status/'+id} className="mt-3 inline-block text-teal underline">Check review status →</Link>
  </section>}
  <Link href="/models" className="mt-6 inline-block underline text-teal">Explore models</Link>
 </main>
}
