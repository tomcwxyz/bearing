'use server'

import { AuthError } from 'next-auth'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { Resend } from 'resend'

import { signIn, signOut } from '@/auth'
import { getCurrentUser } from '@/lib/auth'
import {
  createUserWithPassword,
  getUserByEmail,
  getUserEmailById,
  setUserPasswordHash,
} from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { consumeResetToken, generateResetToken } from '@/lib/tokens'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  if (!email?.trim() || !password) return { error: 'Email and password are required.' }

  try {
    await signIn('credentials', { email: email.trim(), password, redirect: false })
    return {}
  } catch (error) {
    if (isRedirectError(error)) throw error
    if (error instanceof AuthError) return { error: 'Invalid email or password.' }
    return { error: 'Sign-in failed. Please try again.' }
  }
}

export async function registerUser(email: string, password: string): Promise<{ error?: string }> {
  const trimmedEmail = email?.trim() ?? ''
  if (!EMAIL_RE.test(trimmedEmail)) return { error: 'Enter a valid email address.' }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const existing = await getUserByEmail(trimmedEmail)
  if (existing) return { error: 'An account with this email already exists — sign in instead.' }

  const passwordHash = await hashPassword(password)
  await createUserWithPassword(trimmedEmail, passwordHash)

  try {
    await signIn('credentials', { email: trimmedEmail, password, redirect: false })
    return {}
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: 'Account created — please sign in.' }
  }
}

/**
 * Email a one-time password setup/reset link. Unknown emails deliberately
 * return the same success response so this cannot enumerate accounts.
 */
export async function requestPasswordSetup(email: string): Promise<{ error?: string }> {
  const trimmedEmail = email?.trim() ?? ''
  if (!EMAIL_RE.test(trimmedEmail)) return { error: 'Enter a valid email address.' }

  const user = await getUserByEmail(trimmedEmail)
  if (!user) return {}

  const token = await generateResetToken(user.id)
  const url = new URL('/auth/set-password', getBaseUrl())
  url.searchParams.set('token', token)

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Bearing <onboarding@resend.dev>',
    to: trimmedEmail,
    subject: 'Set your password for Bearing',
    text: [
      'Bearing now uses email + password sign-in instead of magic links.',
      '',
      'Set your password here:',
      '',
      url.toString(),
      '',
      'This link expires in 24 hours.',
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
  })

  return {}
}

export async function setPassword(token: string, newPassword: string): Promise<{ error?: string }> {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const userId = await consumeResetToken(token)
  if (!userId) return { error: 'This link is invalid or has expired.' }

  const passwordHash = await hashPassword(newPassword)
  await setUserPasswordHash(userId, passwordHash)

  const email = await getUserEmailById(userId)
  if (email) {
    try {
      await signIn('credentials', { email, password: newPassword, redirect: false })
    } catch (error) {
      if (isRedirectError(error)) throw error
    }
  }

  return {}
}

export async function checkAuth() {
  const user = await getCurrentUser()
  return { authenticated: Boolean(user) }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' })
}
