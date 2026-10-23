'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { feedbackFingerprint, submitFeedback, validateFeedback } from '@/db/community-feedback'

export async function submitCommunityFeedback(form: FormData) {
  // Quietly discard automated submissions that fill the hidden honeypot.
  if (form.get('website')) redirect('/contribute/submitted')
  const data = validateFeedback({
    kind: String(form.get('kind') ?? ''),
    modelSlug: String(form.get('model_slug') ?? ''),
    description: String(form.get('description') ?? ''),
    evidenceUrl: String(form.get('evidence_url') ?? ''),
  })
  const h = await headers()
  const ip = (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0,128)
  const fingerprint = feedbackFingerprint(ip)
  const user = await getCurrentUser()
  const saved = await submitFeedback(data, fingerprint, user?.id ?? null)
  if (!saved) redirect('/contribute?limited=1')
  redirect('/contribute/submitted')
}
