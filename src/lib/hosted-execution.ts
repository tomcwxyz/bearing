import {
  callDirectProvider,
  callModel,
  DIRECT_PROVIDERS,
} from './openrouter'
import {
  callOllamaCloud,
  getOllamaCloudRoute,
  isOllamaCloudConfigured,
  type OllamaCloudRunResult,
} from './ollama-cloud'

export type HostedExecutionRouteId = 'openrouter' | 'direct' | 'ollama_cloud'

export interface HostedExecutionRoute {
  id: HostedExecutionRouteId
  label: string
  provider: string
  modelId: string
}

export interface HostedExecutionResult {
  text: string
  error?: string
  route: HostedExecutionRoute
  promptTokens: number | null
  outputTokens: number | null
  tokensPerSecond: number | null
  totalDurationMs: number | null
  loadDurationMs: number | null
  promptEvalDurationMs: number | null
}

type ChatMessages = Array<{
  role: string
  content: string | Array<{ type: string; [key: string]: unknown }>
}>

export function listHostedExecutionRoutes(
  slug: string,
  openRouterId: string | null | undefined,
): HostedExecutionRoute[] {
  const routes: HostedExecutionRoute[] = []

  if (openRouterId) {
    routes.push({
      id: 'openrouter',
      label: 'OpenRouter',
      provider: 'OpenRouter',
      modelId: openRouterId,
    })
  }

  const direct = DIRECT_PROVIDERS[slug]
  if (direct) {
    routes.push({
      id: 'direct',
      label: direct.name,
      provider: direct.name,
      modelId: direct.modelId,
    })
  }

  const ollama = getOllamaCloudRoute(slug)
  if (ollama && isOllamaCloudConfigured()) {
    routes.push({
      id: 'ollama_cloud',
      label: 'Ollama Cloud',
      provider: 'Ollama Cloud',
      modelId: ollama.modelId,
    })
  }

  return routes
}

export function canExecuteHostedModel(
  slug: string,
  openRouterId: string | null | undefined,
): boolean {
  return listHostedExecutionRoutes(slug, openRouterId).length > 0
}

export function resolveHostedExecutionRoute(
  slug: string,
  openRouterId: string | null | undefined,
  requestedRoute?: string | null,
): HostedExecutionRoute | null {
  const routes = listHostedExecutionRoutes(slug, openRouterId)
  if (requestedRoute && requestedRoute !== 'default') {
    return routes.find((route) => route.id === requestedRoute) ?? null
  }

  // Preserve Bearing's existing behaviour: OpenRouter first, then direct
  // provider. Ollama Cloud becomes the fallback for reviewed cloud-only routes,
  // and an explicit user choice when several routes exist.
  return routes.find((route) => route.id === 'openrouter')
    ?? routes.find((route) => route.id === 'direct')
    ?? routes.find((route) => route.id === 'ollama_cloud')
    ?? null
}

function fromOllamaCloud(
  route: HostedExecutionRoute,
  result: OllamaCloudRunResult,
): HostedExecutionResult {
  return {
    text: result.text,
    error: result.error,
    route,
    promptTokens: result.promptTokens,
    outputTokens: result.outputTokens,
    tokensPerSecond: result.tokensPerSecond,
    totalDurationMs: result.totalDurationMs,
    loadDurationMs: result.loadDurationMs,
    promptEvalDurationMs: result.promptEvalDurationMs,
  }
}

export async function runHostedExecution(
  slug: string,
  openRouterId: string | null | undefined,
  messages: ChatMessages,
  requestedRoute?: string | null,
): Promise<HostedExecutionResult> {
  const route = resolveHostedExecutionRoute(slug, openRouterId, requestedRoute)

  if (!route) {
    return {
      text: '',
      error: requestedRoute && requestedRoute !== 'default'
        ? `The requested hosted route (${requestedRoute}) is not available for this model.`
        : 'No hosted execution route is available for this model.',
      route: {
        id: 'openrouter',
        label: 'Unavailable',
        provider: 'Unavailable',
        modelId: '',
      },
      promptTokens: null,
      outputTokens: null,
      tokensPerSecond: null,
      totalDurationMs: null,
      loadDurationMs: null,
      promptEvalDurationMs: null,
    }
  }

  if (route.id === 'ollama_cloud') {
    return fromOllamaCloud(route, await callOllamaCloud(slug, messages))
  }

  const result = route.id === 'openrouter'
    ? await callModel(route.modelId, messages)
    : await callDirectProvider(slug, messages)

  return {
    text: result.text,
    error: result.error,
    route,
    promptTokens: null,
    outputTokens: null,
    tokensPerSecond: null,
    totalDurationMs: null,
    loadDurationMs: null,
    promptEvalDurationMs: null,
  }
}
