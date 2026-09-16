import { randomUUID, createHmac } from 'crypto'
import { createPasswordResetToken, consumePasswordResetToken } from '@/db/users'

// Password-setup/reset tokens: same two-part "uuid.signature" shape as the
// old magic-link tokens, but the token STORED in the DB is the HMAC of the
// uuid (token_hash), never the raw token — the raw token only ever exists
// in the emailed URL. A 24h expiry (vs. the old 15-minute magic-link window)
// since this is a passive migration nudge a user might not open right away,
// not an active sign-in attempt.

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET environment variable is not set')
  return secret
}

/** Pure HMAC signing — exported separately so the signing/verification math
 *  is unit-testable without touching the database. */
export function signResetToken(uuid: string): string {
  return createHmac('sha256', getSecret()).update(uuid).digest('hex')
}

/** Verify a "uuid.signature" token's signature without hitting the DB. */
export function verifyResetTokenSignature(rawToken: string): { valid: boolean; uuid?: string } {
  const parts = rawToken.split('.')
  if (parts.length !== 2) return { valid: false }
  const [uuid, signature] = parts
  const expected = signResetToken(uuid)
  return signature === expected ? { valid: true, uuid } : { valid: false }
}

/** Generate and persist a new password-setup token for a user, returning the
 *  raw "uuid.signature" token to embed in the emailed URL. */
export async function generateResetToken(userId: string): Promise<string> {
  const uuid = randomUUID()
  const signature = signResetToken(uuid)
  const tokenHash = createHmac('sha256', getSecret()).update(`hash:${uuid}`).digest('hex')
  await createPasswordResetToken(userId, tokenHash, new Date(Date.now() + RESET_TOKEN_TTL_MS))
  return `${uuid}.${signature}`
}

/** Verify a raw token's signature, then atomically consume it in the DB.
 *  Returns the associated user id, or null if the token is invalid, already
 *  used, or expired. */
export async function consumeResetToken(rawToken: string): Promise<string | null> {
  const { valid, uuid } = verifyResetTokenSignature(rawToken)
  if (!valid || !uuid) return null
  const tokenHash = createHmac('sha256', getSecret()).update(`hash:${uuid}`).digest('hex')
  return consumePasswordResetToken(tokenHash)
}