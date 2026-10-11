import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isUserAdmin } from '@/db/users'
import { listRetirementCandidates } from '@/db/model-retirement'
import RetirementCandidateList from '../retirement-candidate-list'

export const dynamic = 'force-dynamic'

export default async function RetirementReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/signin')
  if (!(await isUserAdmin(user.id))) redirect('/')
  const candidates = await listRetirementCandidates()
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <Link href="/admin?tab=models" className="text-sm text-teal underline">← Back to models</Link>
      <h1 className="mt-4 font-display text-4xl text-navy">Model retirement review</h1>
      <p className="mt-3 text-sm leading-6 text-navy/70">
        Models missing from the same catalogue in at least two checks over six or more days.
        These are suggestions, not automatic removals. Check other routes and provider notices
        before retiring. Historical records remain available.
      </p>
      <RetirementCandidateList candidates={candidates} />
    </main>
  )
}
