import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL is not set')
  return neon(url)
}

export interface UserAuthRow {
  id: string
  email: string
  passwordHash: string | null
  isAdmin: boolean
}

/** Look up a user by email, including password/auth state. */
export async function getUserByEmail(email: string): Promise<UserAuthRow | null> {
  const rows = await getDb()`
    SELECT id, email, password_hash, is_admin FROM users WHERE email = ${email}
  `
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string | null,
    isAdmin: row.is_admin === true,
  }
}

/** Check whether a user has admin privileges. */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const rows = await getDb()`SELECT is_admin FROM users WHERE id = ${userId}`
  return rows.length > 0 && rows[0].is_admin === true
}

/** Create a self-serve user with a password already set. */
export async function createUserWithPassword(email: string, passwordHash: string): Promise<string> {
  const rows = await getDb()`
    INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})
    RETURNING id
  `
  return rows[0].id as string
}

/** Set or replace a user's password hash. */
export async function setUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await getDb()`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`
}

/** Look up a user's email by id. */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const rows = await getDb()`SELECT email FROM users WHERE id = ${userId}`
  return rows.length > 0 ? (rows[0].email as string) : null
}

/** Persist a password reset/setup token hash. Raw reset tokens are never stored. */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await getDb()`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `
}

/** Atomically consume a valid unused password-reset token hash. */
export async function consumePasswordResetToken(tokenHash: string): Promise<string | null> {
  const rows = await getDb()`
    UPDATE password_reset_tokens
    SET used_at = now()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `
  return rows.length > 0 ? (rows[0].user_id as string) : null
}
