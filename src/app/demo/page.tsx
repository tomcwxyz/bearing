import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { contributorDemoEnabled } from '@/lib/contributor-demo-mode'
import { DEMO_FOCUS, DEMO_SCENARIOS, runContributorDemo } from '@/lib/contributor-fixtures'
import { DemoWorkbench } from './workbench'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Local contributor workbench',
  description: 'Inspect Bearing recommendations and scoring using synthetic examples.',
  robots: { index: false, follow: false },
}

export default function ContributorDemoPage() {
  if (!contributorDemoEnabled()) notFound()

  return (
    <DemoWorkbench
      scenarios={DEMO_SCENARIOS}
      focuses={DEMO_FOCUS}
      initial={runContributorDemo({
        scenarioId: 'summary',
        focus: 'balanced',
        onPremOnly: false,
      })}
    />
  )
}
