'use client'

import { useState, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setPassword } from '@/features/auth/actions'

function SetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPasswordValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('This link is missing its token — please use the link from your email.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    startTransition(async () => {
      const result = await setPassword(token, password)
      if (result.error) {
        setError(result.error)
        return
      }
      router.push('/')
    })
  }

  return (
    <>
      <h1 className="font-display text-3xl font-bold text-navy">
        Set your password
      </h1>
      <p className="mt-2 text-navy/60">
        Bearing now uses email + password sign-in. Choose a password to finish setting up your account.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          placeholder="New password"
          disabled={isPending}
          className="w-full rounded-md border border-cream-dark bg-cream px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-teal focus:ring-2 focus:ring-teal/30 focus:outline-none"
        />
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          disabled={isPending}
          className="w-full rounded-md border border-cream-dark bg-cream px-3 py-2 text-sm text-navy placeholder:text-navy/40 focus:border-teal focus:ring-2 focus:ring-teal/30 focus:outline-none"
        />

        {error && <p role="alert" className="text-sm text-coral">{error}</p>}

        <button type="submit" disabled={isPending} className="btn-primary w-full text-sm disabled:opacity-50">
          {isPending ? 'Setting password...' : 'Set password'}
        </button>
      </form>
    </>
  )
}

export default function SetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <Suspense fallback={
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Set your password</h1>
          <p className="mt-2 text-navy/60">Loading...</p>
        </div>
      }>
        <SetPasswordForm />
      </Suspense>
    </div>
  )
}
