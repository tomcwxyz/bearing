import routesData from '@/data/ollama-cloud-routes.json'
import type { ModelPricing } from './registry'
import { fetchOllamaCloudModels, findOllamaCatalogueMatch, type OllamaCatalogueModel } from './ollama-catalogue'
import { parseOpenRouterError } from './openrouter'

export interface OllamaCloudRoute {
  slug: string
  modelId: string
  pricing: ModelPricing
  peakPricing?: ModelPricing
  peakWindow?: {
    startUtcHour: number
    endUtcHour: number
    weekdays: number[]
  }
  checkedAt: string
  sourceUrl: string
}

export interface OllamaCloudRunResult {
  text: string
  error?: string
  runtimeModelId: string
  promptTokens: number | null
  outputTokens: number | null
  tokensPerSecond: number | null
  totalDurationMs: number | null
  loadDurationMs: number | null
  promptEvalDurationMs: number | null
}

type ChatMessage = {
  role: string
  content: string | Array<{ type: string; [key: string]: unknown }>
}

const routes = routesData as OllamaCloudRoute[]
const routeBySlug = new Map(routes.map((route) => [route.slug, route]))

function nsToMs(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed / 1_000_000)
}

function finiteCount(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function messagesAreTextOnly(messages: ChatMessage[]): boolean {
  return messages.every((message) => typeof message.content === 'string')
}

export function getOllamaCloudRoute(slug: string): OllamaCloudRoute | null {
  return routeBySlug.get(slug) ?? null
}

export function getOllamaCloudRoutes(): OllamaCloudRoute[] {
  return [...routes]
}

export function isOllamaCloudConfigured(): boolean {
  return Boolean(process.env.OLLAMA_API_KEY)
}

export function ollamaCloudPricing(
  route: OllamaCloudRoute,
  now: Date = new Date(),
): ModelPricing {
  if (!route.peakPricing || !route.peakWindow) return route.pricing

  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const inPeakDay = route.peakWindow.weekdays.includes(day)
  const inPeakHour =
    hour >= route.peakWindow.startUtcHour &&
    hour < route.peakWindow.endUtcHour

  return inPeakDay && inPeakHour ? route.peakPricing : route.pricing
}

export function matchOllamaCloudRoute(
  route: OllamaCloudRoute,
  catalogue: OllamaCatalogueModel[],
): OllamaCatalogueModel | null {
  return findOllamaCatalogueMatch(catalogue, [route.modelId])
}

export async function fetchReviewedOllamaCloudAvailability(
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{
  route: OllamaCloudRoute
  available: boolean
  matchedModelId: string | null
}>> {
  const catalogue = await fetchOllamaCloudModels({ fetchImpl })
  return routes.map((route) => {
    const match = matchOllamaCloudRoute(route, catalogue)
    return {
      route,
      available: Boolean(match),
      matchedModelId: match?.model ?? match?.name ?? null,
    }
  })
}

export async function callOllamaCloud(
  slug: string,
  messages: ChatMessage[],
  options: { fetchImpl?: typeof fetch } = {},
): Promise<OllamaCloudRunResult> {
  const route = getOllamaCloudRoute(slug)
  if (!route) {
    return {
      text: '',
      error: `No reviewed Ollama Cloud route is configured for ${slug}.`,
      runtimeModelId: '',
      promptTokens: null,
      outputTokens: null,
      tokensPerSecond: null,
      totalDurationMs: null,
      loadDurationMs: null,
      promptEvalDurationMs: null,
    }
  }

  const apiKey = process.env.OLLAMA_API_KEY
  if (!apiKey) {
    return {
      text: '',
      error: 'Ollama Cloud is not configured on Bearing (OLLAMA_API_KEY is missing).',
      runtimeModelId: route.modelId,
      promptTokens: null,
      outputTokens: null,
      tokensPerSecond: null,
      totalDurationMs: null,
      loadDurationMs: null,
      promptEvalDurationMs: null,
    }
  }

  if (!messagesAreTextOnly(messages)) {
    return {
      text: '',
      error: 'Bearing does not yet send file or multimodal attachments through its Ollama Cloud route.',
      runtimeModelId: route.modelId,
      promptTokens: null,
      outputTokens: null,
      tokensPerSecond: null,
      totalDurationMs: null,
      loadDurationMs: null,
      promptEvalDurationMs: null,
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: route.modelId,
        messages,
        stream: false,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      return {
        text: '',
        error: parseOpenRouterError(response.status, body),
        runtimeModelId: route.modelId,
        promptTokens: null,
        outputTokens: null,
        tokensPerSecond: null,
        totalDurationMs: null,
        loadDurationMs: null,
        promptEvalDurationMs: null,
      }
    }

    const payload = await response.json() as {
      model?: string
      message?: { content?: string }
      prompt_eval_count?: number
      eval_count?: number
      eval_duration?: number
      total_duration?: number
      load_duration?: number
      prompt_eval_duration?: number
    }

    const outputTokens = finiteCount(payload.eval_count)
    const evalDuration = Number(payload.eval_duration ?? 0)
    const tokensPerSecond =
      outputTokens != null && outputTokens > 0 && evalDuration > 0
        ? Math.round((outputTokens / (evalDuration / 1_000_000_000)) * 10) / 10
        : null

    const text = payload.message?.content?.trim() ?? ''
    return {
      text,
      ...(text ? {} : { error: 'Ollama Cloud returned no content.' }),
      runtimeModelId: payload.model ?? route.modelId,
      promptTokens: finiteCount(payload.prompt_eval_count),
      outputTokens,
      tokensPerSecond,
      totalDurationMs: nsToMs(payload.total_duration),
      loadDurationMs: nsToMs(payload.load_duration),
      promptEvalDurationMs: nsToMs(payload.prompt_eval_duration),
    }
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error calling Ollama Cloud.',
      runtimeModelId: route.modelId,
      promptTokens: null,
      outputTokens: null,
      tokensPerSecond: null,
      totalDurationMs: null,
      loadDurationMs: null,
      promptEvalDurationMs: null,
    }
  }
}
