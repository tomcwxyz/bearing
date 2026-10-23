import Link from 'next/link'
export default function SubmittedPage(){
  return <main className="mx-auto max-w-2xl px-4 py-20 text-navy">
    <h1 className="font-display text-4xl">Thanks for helping improve Bearing</h1>
    <p className="mt-5 text-grey-blue">Your submission has been sent for review. Nothing changes automatically; a maintainer will inspect the evidence before acting.</p>
    <Link href="/models" className="mt-6 inline-block underline text-teal">Explore models</Link>
  </main>
}
