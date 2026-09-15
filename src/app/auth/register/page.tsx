'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { registerUser } from '@/features/auth/actions'
import { CredentialsForm } from '@/components/credentials-form'
import { sanitizeRedirect } from '@/lib/safe-redirect'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirect(searchParams.get('redirect'))

  return (
    <>
      <h1 className="font-display text-3xl font-bold text-navy">
        Create an account
      </h1>
      <p className="mt-2 text-navy/60">
        At least 8 characters. That&apos;s it.
      </p>

      <div className="mt-8">
        <CredentialsForm
          onSubmit={registerUser}
          onSuccess={() => router.push(redirect)}
          confirmPassword
          submitLabel="Create account"
          pendingLabel="Creating account..."
        />
      </div>

      <p className="mt-6 text-center text-sm text-navy/60">
        Already have an account?{' '}
        <Link href={`/auth/signin?redirect=${encodeURIComponent(redirect)}`} className="text-teal underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <Suspense fallback={
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Create an account</h1>
          <p className="mt-2 text-navy/60">Loading...</p>
        </div>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
