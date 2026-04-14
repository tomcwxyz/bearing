import { neon } from '@neondatabase/serverless'
import { randomUUID, createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { Resend } from 'resend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET environment variable is not set')
  return secret
}

function hmacSign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('hex')
}

function sql() {
  return neon(process.env.NEON_DATABASE_URL!)
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// ---------------------------------------------------------------------------
// 1. sendMagicLink
// ---------------------------------------------------------------------------

export async function sendMagicLink(
  email: string,
  redirect?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = sql()
    const resend = new Resend(process.env.RESEND_API_KEY)

    // Generate token: uuid.hmac
    const uuid = randomUUID()
    const signature = hmacSign(uuid)
    const token = `${uuid}.${signature}`

    // Store token_id (the uuid part) in DB
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await db`
      INSERT INTO magic_tokens (email, token_id, expires_at)
      VALUES (${email}, ${uuid}, ${expiresAt.toISOString()})
    `

    // Ensure user exists
    await db`
      INSERT INTO users (email)
      VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `

    // Build magic link URL
    const baseUrl = getBaseUrl()
    const url = new URL('/auth/verify', baseUrl)
    url.searchParams.set('token', token)
    if (redirect) url.searchParams.set('redirect', redirect)

    // Send email
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Bearing <onboarding@resend.dev>',
      to: email,
      subject: 'Your sign-in link for Bearing',
      text: [
        'Click this link to sign in to Bearing:',
        '',
        url.toString(),
        '',
        'This link expires in 15 minutes.',
        '',
        'If you did not request this link, you can safely ignore this email.',
      ].join('\n'),
    })

    return { success: true }
  } catch (error) {
    console.error('sendMagicLink error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send magic link.',
    }
  }
}

// ---------------------------------------------------------------------------
// 2. verifyMagicLink
// ---------------------------------------------------------------------------

export async function verifyMagicLink(
  token: string,
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return { success: false, error: 'Invalid token format.' }

    const [uuid, signature] = parts

    // Verify HMAC
    const expectedSignature = hmacSign(uuid)
    if (signature !== expectedSignature) {
      return { success: false, error: 'Invalid token signature.' }
    }

    const db = sql()

    // Look up token
    const rows = await db`
      SELECT id, email, expires_at, used
      FROM magic_tokens
      WHERE token_id = ${uuid}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false, error: 'Token not found.' }
    }

    const row = rows[0]

    if (row.used) {
      return { success: false, error: 'Token has already been used.' }
    }

    if (new Date(row.expires_at) < new Date()) {
      return { success: false, error: 'Token has expired.' }
    }

    // Mark token as used
    await db`UPDATE magic_tokens SET used = true WHERE token_id = ${uuid}`

    // Find or create user
    const userRows = await db`
      SELECT id, email FROM users WHERE email = ${row.email} LIMIT 1
    `

    let userId: string
    if (userRows.length > 0) {
      userId = userRows[0].id
    } else {
      const inserted = await db`
        INSERT INTO users (email) VALUES (${row.email}) RETURNING id
      `
      userId = inserted[0].id
    }

    // Set session cookie
    const sessionPayload = JSON.stringify({
      userId,
      email: row.email,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    })
    const sessionSignature = hmacSign(sessionPayload)
    const sessionToken = `${Buffer.from(sessionPayload).toString('base64')}.${sessionSignature}`

    const cookieStore = await cookies()
    cookieStore.set('bearing_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
      path: '/',
    })

    return { success: true, userId }
  } catch (error) {
    console.error('verifyMagicLink error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed.',
    }
  }
}

// ---------------------------------------------------------------------------
// 3. getCurrentUser
// ---------------------------------------------------------------------------

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('bearing_session')
    if (!sessionCookie?.value) return null

    const parts = sessionCookie.value.split('.')
    if (parts.length !== 2) return null

    const [payloadB64, signature] = parts

    // Verify signature
    const payload = Buffer.from(payloadB64, 'base64').toString('utf-8')
    const expectedSignature = hmacSign(payload)
    if (signature !== expectedSignature) return null

    const data = JSON.parse(payload)

    // Check expiry
    if (data.exp < Date.now()) return null

    return { id: data.userId, email: data.email }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 4. signOut
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('bearing_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
