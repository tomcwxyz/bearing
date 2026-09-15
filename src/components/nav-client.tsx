'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '@/features/auth/actions'

interface NavLink {
  href: string
  label: string
  external?: boolean
}

interface NavClientProps {
  links: NavLink[]
  userEmail: string | null
}

function AuthLinks({ userEmail, onNavigate }: { userEmail: string | null; onNavigate?: () => void }) {
  if (userEmail) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-cream/70">{userEmail}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            onClick={onNavigate}
            className="transition-colors hover:text-grey-blue-light"
          >
            Sign out
          </button>
        </form>
      </div>
    )
  }
  return (
    <Link href="/auth/signin" onClick={onNavigate} className="transition-colors hover:text-grey-blue-light">
      Sign in
    </Link>
  )
}

export function NavClient({ links, userEmail }: NavClientProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <header className="bg-navy text-cream border-b border-navy-light">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Bearing
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
          {links.map(({ href, label, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-grey-blue-light"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                className={`transition-colors ${
                  pathname === href ? 'text-teal' : 'hover:text-grey-blue-light'
                }`}
              >
                {label}
              </Link>
            ),
          )}
          <AuthLinks userEmail={userEmail} />
        </div>

        {/* Mobile hamburger button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="sm:hidden flex flex-col gap-1.5 p-1"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          <span
            className={`block h-0.5 w-5 bg-cream transition-transform ${
              open ? 'translate-y-2 rotate-45' : ''
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-cream transition-opacity ${
              open ? 'opacity-0' : ''
            }`}
          />
          <span
            className={`block h-0.5 w-5 bg-cream transition-transform ${
              open ? '-translate-y-2 -rotate-45' : ''
            }`}
          />
        </button>
      </nav>

      {/* Mobile menu — a sibling of <nav>, not nested in its flex row, so it
          spans full width below the header instead of squeezing in beside
          the logo/hamburger. */}
      {open && (
        <div className="sm:hidden border-t border-navy-light px-6 pb-4 pt-2">
          <div className="flex flex-col gap-3 text-sm font-medium">
            {links.map(({ href, label, external }) =>
              external ? (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="py-1 transition-colors hover:text-grey-blue-light"
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`py-1 transition-colors ${
                    pathname === href ? 'text-teal' : 'hover:text-grey-blue-light'
                  }`}
                >
                  {label}
                </Link>
              ),
            )}
            <div className="py-1">
              <AuthLinks userEmail={userEmail} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
