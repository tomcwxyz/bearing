import { auth } from '@/auth'
import { NavClient } from './nav-client'

const links = [
  { href: '/models', label: 'Models' },
  { href: '/compare', label: 'Compare' },
  { href: '/data', label: 'Data' },
  { href: '/about', label: 'About' },
  { href: 'https://docs.findbearing.org', label: 'Docs', external: true },
] as const

export async function Nav() {
  const session = await auth()
  const userEmail = session?.user?.email ?? null
  const navLinks = userEmail
    ? [{ href: '/bearings', label: 'My bearings' }, ...links]
    : [...links]

  return <NavClient links={navLinks} userEmail={userEmail} />
}
