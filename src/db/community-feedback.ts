import { neon } from '@neondatabase/serverless'
import { createHash, randomUUID } from 'node:crypto'

export type FeedbackKind = 'model_correction' | 'recommendation' | 'methodology' | 'usability'
const kinds = new Set<FeedbackKind>(['model_correction','recommendation','methodology','usability'])

function sql() {
  if (!process.env.NEON_DATABASE_URL) throw new Error('Database is not configured')
  return neon(process.env.NEON_DATABASE_URL)
}
export function validateFeedback(input: { kind: string; modelSlug: string; description: string; evidenceUrl: string }) {
  if (!kinds.has(input.kind as FeedbackKind)) throw new Error('Choose a contribution type.')
  const description = input.description.trim()
  if (description.length < 20 || description.length > 2500) throw new Error('Please explain your observation in 20–2,500 characters.')
  const modelSlug = input.modelSlug.trim() || null
  if (modelSlug && (modelSlug.length > 150 || !/^[a-zA-Z0-9._/-]+$/.test(modelSlug))) throw new Error('Invalid model.')
  const evidenceUrl = input.evidenceUrl.trim() || null
  if (evidenceUrl) {
    try {
      const url = new URL(evidenceUrl)
      if (url.protocol !== 'https:' || url.username || url.password || evidenceUrl.length > 1000) throw new Error()
    } catch { throw new Error('Evidence links must be public HTTPS URLs.') }
  }
  return {kind: input.kind as FeedbackKind, modelSlug, description, evidenceUrl}
}
export function feedbackFingerprint(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!salt || salt.length < 20) throw new Error('Feedback protection is not configured')
  return createHash('sha256').update(salt).update(':bearing-feedback:').update(ip).digest('hex')
}
export async function submitFeedback(input: ReturnType<typeof validateFeedback>, fingerprint: string, userId: string | null) {
  const id = randomUUID()
  // DB-side rate gate: max three submissions per fingerprint in 24 hours.
  // The slug is verified against the live catalogue; no raw IP is retained.
  const rows = await sql()`
    INSERT INTO community_feedback(id,kind,model_slug,description,evidence_url,source_fingerprint,submitted_by)
    SELECT ${id}::uuid,${input.kind},${input.modelSlug},${input.description},${input.evidenceUrl},${fingerprint},${userId}::uuid
    WHERE (SELECT COUNT(*) FROM community_feedback WHERE source_fingerprint=${fingerprint} AND created_at>now()-interval '24 hours') < 3
    AND (${input.modelSlug}::text IS NULL OR EXISTS(SELECT 1 FROM models WHERE slug=${input.modelSlug} AND active=true))
    RETURNING id
  `
  return rows.length === 1
}
export async function listFeedback() {
  return sql()`SELECT id::text,kind,model_slug,description,evidence_url,status,review_note,created_at::text,reviewed_at::text FROM community_feedback ORDER BY (status='pending') DESC,created_at DESC LIMIT 200`
}
export async function reviewFeedback(id: string, status: 'reviewed'|'dismissed', reviewer: string, note: string) {
  const rows = await sql()`UPDATE community_feedback SET status=${status},review_note=${note},reviewed_by=${reviewer}::uuid,reviewed_at=now()
    WHERE id=${id}::uuid AND status='pending' RETURNING id`
  return rows.length === 1
}
