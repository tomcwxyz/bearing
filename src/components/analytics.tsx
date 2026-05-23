'use client'

import { useEffect } from 'react'

/**
 * Initializes Plausible Analytics on the client.
 *
 * No-ops unless NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set, so local/dev builds and
 * forks without an account stay clean. Pageviews are captured automatically;
 * outbound link and file-download tracking are enabled for richer engagement
 * data without any custom event wiring.
 *
 * The tracker is imported dynamically inside the effect because it touches
 * `location` at module-evaluation time, which is undefined during SSR/prerender.
 */
export function Analytics() {
  useEffect(() => {
    const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
    if (!domain) return

    void import('@plausible-analytics/tracker').then(({ init }) => {
      init({
        domain,
        autoCapturePageviews: true,
        outboundLinks: true,
        fileDownloads: true,
      })
    })
  }, [])

  return null
}
