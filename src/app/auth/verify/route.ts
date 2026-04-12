import { NextRequest, NextResponse } from 'next/server'
import { verifyMagicLink } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/'

  if (!token) {
    return NextResponse.redirect(
      new URL('/?auth_error=missing_token', request.nextUrl.origin),
    )
  }

  const result = await verifyMagicLink(token)

  if (!result.success) {
    const errorUrl = new URL('/?auth_error=invalid_token', request.nextUrl.origin)
    return NextResponse.redirect(errorUrl)
  }

  // verifyMagicLink already set the session cookie, just redirect
  return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin))
}
