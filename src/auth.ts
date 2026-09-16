import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getUserByEmail } from '@/db/users'
import { verifyPassword } from '@/lib/password'

// Credentials provider + JWT session strategy, no database adapter. The DB
// here is Neon over the @neondatabase/serverless HTTP driver (a tagged-
// template client, not a pg Pool), which Auth.js's official DB adapters
// don't support — authorize() does a manual lookup instead, exactly like
// the rest of this codebase's data access. JWT sessions mean is_admin gets
// embedded in the token at sign-in time; a change to that flag in the DB
// won't take effect until the user's next sign-in (accepted trade-off for
// not hitting the DB on every request).

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/auth/signin' },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null

        const user = await getUserByEmail(email)
        if (!user || !user.passwordHash) return null

        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, isAdmin: user.isAdmin }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.isAdmin = token.isAdmin as boolean
      }
      return session
    },
  },
})