'use client'

import { useState, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signInWithPassword, requestPasswordSetup } from '@/features/auth/actions'
import { CredentialsForm } from '@/components/credentials-form'
import { sanitizeRedirect } from '@/lib/safe-redirect'

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      await requestPasswordSetup(email.trim())
      // Always show the same confirmation regardless of whether the email
      // exists — requestPasswordSetup already avoids leaking that.
      setSent(true)
    })
  }

  if (sent) {
    return (
      <p className="mt-3 text-sm text-teal">
        If that email has an account, we&apos;ve sent a link to set or reset its password.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={isPending}
        className="flex-1 rounded-md border border-cream-dark bg-cream px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-teal focus:ring-2 focus:ring-teal/30 focus:outline-none"
      />
      <button type="submit" disabled={isPending} className="btn-primary text-sm disabled:opacity-50">
        {isPending ? 'Sending...' : 'Send link'}
      </button>
    </form>
  )
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirect(searchParams.get('redirect'))
  const [showForgot, setShowForgot] = useState(false)

  return (
    <>
      <h1 className="font-display text-3xl font-bold text-navy">
        Sign in to Bearing
      </h1>
      <p className="mt-2 text-navy/60">
        Enter your email and password to continue.
      </p>

      <div className="mt-8">
        <CredentialsForm
          onSubmit={signInWithPassword}
          onSuccess={() => router.push(redirect)}
          submitLabel="Sign in"
          pendingLabel="Signing in..."
        />
      </div>

      <div className="mt-4 text-center text-sm">
        {showForgot ? (
          <ForgotPasswordForm />
        ) : (
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="text-navy/60 underline-offset-2 hover:underline"
          >
            Forgot your password, or never set one?
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-navy/60">
        New here?{' '}
        <Link href={`/auth/register?redirect=${encodeURIComponent(redirect)}`} className="text-teal underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  )
}

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <Suspense fallback={
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Sign in to Bearing</h1>
          <p className="mt-2 text-navy/60">Loading...</p>
        </div>
      }>
        <SignInForm />
      </Suspense>
    </div>
  )
}
