import { auth } from '@/auth'
import { contributorDemoEnabled } from '@/lib/contributor-demo-mode'
import { NavClient } from './nav-client'

const links = [
  { href: '/models', label: 'Models' },
  { href: '/compare', label: 'Compare' },
  { href: '/data', label: 'Data' },
  { href: '/about', label: 'About' },
  { href: 'https://docs.findbearing.org', label: 'Docs', external: true },
] as const

export async function Nav() {
  const demoMode = contributorDemoEnabled()
  // A contributor should never need an Auth.js secret or user database merely
  // to explore the offline workbench.
  const session = demoMode ? null : await auth()
  const userEmail = session?.user?.email ?? null
  const navLinks = demoMode
    ? [
        { href: '/demo', label: 'Workbench' },
        { href: '/models', label: 'Models' },
        { href: '/about', label: 'About' },
        { href: 'https://docs.findbearing.org', label: 'Docs', external: true },
      ]
    : userEmail
      ? [{ href: '/bearings', label: 'My bearings' }, ...links]
      : [...links]

  return (
    <NavClient
      links={navLinks}
      userEmail={userEmail}
      hideAuth={demoMode}
      homeHref={demoMode ? '/demo' : '/'}
    />
  )
}
