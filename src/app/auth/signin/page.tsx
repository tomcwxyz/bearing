'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { requestMagicLink } from '@/app/actions'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? undefined

  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await requestMagicLink(email.trim(), redirect)
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSentTo(result.email ?? email)
      }
    })
  }

  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <h1 className="font-display text-3xl font-bold text-navy">
        Sign in to compare models
      </h1>
      <p className="mt-2 text-navy/60">
        We&apos;ll send you a magic link &mdash; no password needed.
      </p>

      {sentTo ? (
        <div className="mt-8 rounded-md border border-teal/30 bg-teal/5 px-5 py-4">
          <p className="text-teal font-medium">Check your email</p>
          <p className="mt-1 text-sm text-navy/70">
            We sent a sign-in link to{' '}
            <span className="font-medium text-navy">{sentTo}</span>.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-navy">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-md border border-cream-dark bg-cream px-3 py-2 text-navy placeholder:text-navy/40 focus:border-teal focus:ring-2 focus:ring-teal/30 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-coral">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary w-full disabled:opacity-50"
          >
            {isPending ? 'Sending...' : 'Send magic link'}
          </button>
        </form>
      )}
    </div>
  )
}
