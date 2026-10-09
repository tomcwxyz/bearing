// Local-only: no provider keys or maintained Neon credentials required.
export function isContributorDemoMode(env: { nodeEnv?: string; flag?: string }): boolean {
  return env.nodeEnv === 'development' && env.flag === '1'
}

export function contributorDemoEnabled(): boolean {
  return isContributorDemoMode({
    nodeEnv: process.env.NODE_ENV,
    flag: process.env.BEARING_CONTRIBUTOR_DEMO,
  })
}
