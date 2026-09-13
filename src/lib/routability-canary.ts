import { DIRECT_PROVIDERS } from './openrouter'
import {
  listRoutabilityCandidates,
  saveRoutabilityObservations,
  type RoutabilityObservation,
  type RoutabilityStatus,
} from '@/db/model-routability'

export interface ProbeResult {
  status: RoutabilityStatus
  source: string
  note: string | null
}

const CANARY_MESSAGES = [{ role: 'user', content: 'Reply with OK.' }]

/**
 * A canary must distinguish a missing model from a temporarily unhealthy route.
 * Only an explicit provider statement that the model does not exist/is not
 * available is strong enough to block auto-routing. Everything else is
 * degraded evidence and will be retried at the next scheduled run.
 */
export function classifyProbeFailure(
  source: string,
  httpStatus: number | null,
  body: string,
): ProbeResult {
  const lower = body.toLowerCase()
  const explicitlyUnavailable =
    lower.includes('model') && (
      lower.includes('not found') ||
      lower.includes('does not exist') ||
      lower.includes('not available') ||
      lower.includes('no endpoints found')
    )

  if (explicitlyUnavailable || httpStatus === 404) {
    return {
      status: 'unavailable',
      source,
      note: `Execution endpoint explicitly reported this model unavailable${httpStatus ? ` (HTTP ${httpStatus})` : ''}.`,
    }
  }

  if (httpStatus === 429) {
    return {
      status: 'degraded',
      source,
      note: 'Execution probe was rate limited; model availability remains unproven.',
    }
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: 'degraded',
      source,
      note: `Execution probe could not authenticate (HTTP ${httpStatus}); this is not evidence that the model is unavailable.`,
    }
  }

  if (httpStatus != null && httpStatus >= 500) {
    return {
      status: 'degraded',
      source,
      note: `Execution provider returned HTTP ${httpStatus}; treating this as transient rather than model unavailability.`,
    }
  }

  return {
    status: 'degraded',
    source,
    note: httpStatus
      ? `Execution probe failed with HTTP ${httpStatus}; model availability remains unproven.`
      : 'Execution probe failed before a provider response; model availability remains unproven.',
  }
}

async function postCanary(
  url: string,
  apiKey: string,
  modelId: string,
  source: string,
  extraHeaders: Record<string, string> = {},
): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1,
        messages: CANARY_MESSAGES,
      }),
    })

    if (response.ok) {
      return { status: 'healthy', source, note: null }
    }

    const body = await response.text().catch(() => '')
    return classifyProbeFailure(source, response.status, body)
  } catch (error) {
    return {
      status: 'degraded',
      source,
      note: error instanceof Error
        ? `Execution probe failed before a provider response: ${error.message}`
        : 'Execution probe failed before a provider response.',
    }
  }
}

export async function probeOpenRouterModel(openrouterId: string): Promise<ProbeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return {
      status: 'degraded',
      source: 'openrouter-runtime',
      note: 'OPENROUTER_API_KEY is not configured; runtime availability was not tested.',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  return postCanary(
    'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    openrouterId,
    'openrouter-runtime',
    {
      'HTTP-Referer': baseUrl,
      'X-Title': 'Bearing routability canary',
    },
  )
}

export async function probeDirectProvider(slug: string): Promise<ProbeResult> {
  const provider = DIRECT_PROVIDERS[slug]
  if (!provider) {
    return {
      status: 'degraded',
      source: 'direct-runtime',
      note: 'No direct provider execution path is configured.',
    }
  }

  const apiKey = process.env[provider.apiKeyEnv]
  if (!apiKey) {
    return {
      status: 'degraded',
      source: `${provider.name.toLowerCase()}-runtime`,
      note: `${provider.apiKeyEnv} is not configured; runtime availability was not tested.`,
    }
  }

  return postCanary(
    `${provider.baseUrl}/chat/completions`,
    apiKey,
    provider.modelId,
    `${provider.name.toLowerCase()}-runtime`,
  )
}

export interface RoutabilityRunSummary {
  checked: number
  healthy: number
  degraded: number
  unavailable: number
  skipped: number
  observations: RoutabilityObservation[]
}

/**
 * Probe every active chat model that Bearing can actually execute. OpenRouter
 * is preferred because normal runtime execution also prefers an OpenRouter id
 * when one exists; direct-provider probing is the fallback for direct-only
 * slugs. Probes run sequentially to avoid turning a health check into a burst
 * of provider traffic or rate-limit noise.
 */
export async function runRoutabilityCanary(): Promise<RoutabilityRunSummary> {
  const candidates = await listRoutabilityCandidates()
  const checkedAt = new Date().toISOString()
  const observations: RoutabilityObservation[] = []
  let skipped = 0

  for (const candidate of candidates) {
    let probe: ProbeResult | null = null

    if (candidate.openrouterId) {
      probe = await probeOpenRouterModel(candidate.openrouterId)
    } else if (DIRECT_PROVIDERS[candidate.slug]) {
      probe = await probeDirectProvider(candidate.slug)
    }

    if (!probe) {
      skipped += 1
      continue
    }

    observations.push({
      slug: candidate.slug,
      status: probe.status,
      source: probe.source,
      note: probe.note,
      checkedAt,
    })
  }

  await saveRoutabilityObservations(observations)

  return {
    checked: observations.length,
    healthy: observations.filter((item) => item.status === 'healthy').length,
    degraded: observations.filter((item) => item.status === 'degraded').length,
    unavailable: observations.filter((item) => item.status === 'unavailable').length,
    skipped,
    observations,
  }
}
