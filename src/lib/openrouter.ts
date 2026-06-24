// --- OpenRouter API types and utilities ---

export interface OpenRouterModel {
  id: string
  name: string
  description: string | null
  context_length: number
  architecture: {
    modality: string
    input_modalities: string[]
    output_modalities: string[]
  }
  pricing: { prompt: string; completion: string }
  top_provider: { context_length: number; max_completion_tokens: number | null }
  supported_parameters: string[]
  created: number
}

/** Convert OpenRouter per-token pricing strings to per-1M token numbers */
export function convertPricing(
  prompt: string,
  completion: string,
): { input_per_1m: number; output_per_1m: number } {
  return {
    input_per_1m: parseFloat(prompt) * 1_000_000,
    output_per_1m: parseFloat(completion) * 1_000_000,
  }
}

/** Threshold for the `long_context` capability flag. Anything ≥ this is "long". */
export const LONG_CONTEXT_THRESHOLD = 128_000

/** Infer model capabilities from OpenRouter modality, parameter, and context-window metadata. */
export function inferCapabilities(
  inputModalities: string[],
  outputModalities: string[],
  supportedParams: string[],
  contextLength: number = 0,
): string[] {
  const caps: string[] = []
  if (inputModalities.includes('image')) caps.push('vision')
  if (inputModalities.includes('audio')) caps.push('audio')
  if (outputModalities.includes('image')) caps.push('video')
  if (supportedParams.includes('tools') || supportedParams.includes('tool_choice')) caps.push('tools')
  if (supportedParams.includes('structured_outputs') || supportedParams.includes('response_format')) caps.push('structured_output')
  if (supportedParams.includes('include_reasoning') || supportedParams.includes('reasoning')) caps.push('extended_thinking')
  if (contextLength >= LONG_CONTEXT_THRESHOLD) caps.push('long_context')
  return caps
}

const PROVIDER_MAP: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  qwen: 'Alibaba',
  'x-ai': 'xAI',
  minimax: 'MiniMax',
  moonshotai: 'Moonshot',
  // Open-weight providers — map the OpenRouter prefix to the canonical name
  // used as a PROVIDER_PROFILE key in import-grounding.ts.
  liquid: 'Liquid',
  'z-ai': 'Z.ai',
  cohere: 'Cohere',
  microsoft: 'Microsoft',
  nvidia: 'NVIDIA',
  ai21: 'AI21',
  allenai: 'AllenAI',
  nousresearch: 'Nous Research',
}

/** Extract human-readable provider name from OpenRouter model ID */
export function extractProvider(openrouterId: string): string {
  const prefix = openrouterId.split('/')[0]
  return PROVIDER_MAP[prefix] ?? prefix
}

/** Fetch the full model list from the OpenRouter API */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models')
  const data = await response.json()
  return data.data as OpenRouterModel[]
}

/** Parse an OpenRouter error body into a user-friendly message. */
function parseOpenRouterError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body)
    const msg = parsed?.error?.message ?? ''

    if (msg.includes('maximum context length')) {
      const ctxMatch = msg.match(/maximum context length is (\d[\d,]*) tokens/)
      const reqMatch = msg.match(/you requested about (\d[\d,]*) tokens/)
      const ctxLimit = ctxMatch?.[1] ?? 'unknown'
      const requested = reqMatch?.[1] ?? 'unknown'
      return `Prompt too long for this model (limit: ${ctxLimit} tokens, sent: ${requested}). Try a shorter prompt or a model with a larger context window.`
    }

    if (msg.includes('not available') || msg.includes('does not exist')) {
      return 'This model is currently unavailable on OpenRouter.'
    }

    if (msg.includes('rate limit') || status === 429) {
      return 'Rate limited — please wait a moment and try again.'
    }

    if (msg) return msg
  } catch {
    // body wasn't JSON — fall through
  }

  if (status === 429) return 'Rate limited — please wait a moment and try again.'
  if (status === 502 || status === 503) return 'Model is temporarily unavailable. Try again shortly.'
  return `Model request failed (HTTP ${status})`
}

// ---------------------------------------------------------------------------
// Direct provider config — OpenAI-compatible endpoints for models not on
// OpenRouter. Keyed by model slug.
// ---------------------------------------------------------------------------

interface DirectProvider {
  baseUrl: string
  modelId: string
  apiKeyEnv: string
  name: string
}

export const DIRECT_PROVIDERS: Record<string, DirectProvider> = {
  'greenpt-greenl': {
    baseUrl: 'https://api.greenpt.ai/v1',
    modelId: 'green-l',
    apiKeyEnv: 'GREENPT_API_KEY',
    name: 'GreenPT',
  },
  'greenpt-greenr': {
    baseUrl: 'https://api.greenpt.ai/v1',
    modelId: 'green-r',
    apiKeyEnv: 'GREENPT_API_KEY',
    name: 'GreenPT',
  },
  'mistral-ocr': {
    baseUrl: 'https://api.mistral.ai/v1',
    modelId: 'pixtral-large-latest',
    apiKeyEnv: 'MISTRAL_API_KEY',
    name: 'Mistral',
  },
}

// ---------------------------------------------------------------------------
// Shared response parser for OpenAI-compatible chat completions
// ---------------------------------------------------------------------------

type ChatMessages = Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }>

function parseCompletionResponse(
  raw: string,
  providerName: string,
): { text: string; error?: string } {
  if (!raw || !raw.trim()) {
    return { text: '', error: 'Model returned an empty response. It may not support this request format.' }
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw)
  } catch {
    console.error(`${providerName} response was not valid JSON:`, raw.slice(0, 500))
    return { text: '', error: 'Model returned an invalid response. It may not be compatible with this request.' }
  }

  // Check for error object inside a 200 response (some providers do this)
  if (data.error) {
    const errMsg = typeof data.error === 'object' && data.error !== null
      ? (data.error as Record<string, unknown>).message ?? 'Unknown model error'
      : String(data.error)
    console.error(`${providerName} 200 with error payload:`, errMsg)
    return { text: '', error: String(errMsg) }
  }

  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
  const text = choices?.[0]?.message?.content ?? ''

  if (!text) {
    return { text: '', error: 'Model returned no content. It may not support this request type.' }
  }

  return { text }
}

// ---------------------------------------------------------------------------
// OpenRouter caller
// ---------------------------------------------------------------------------

export async function callModel(
  openrouterId: string,
  messages: ChatMessages,
): Promise<{ text: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { text: '', error: 'OpenRouter API key is not configured' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': baseUrl,
        'X-Title': 'Bearing',
      },
      body: JSON.stringify({
        model: openrouterId,
        max_tokens: 2048,
        messages,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`OpenRouter error (${response.status}):`, body)
      return { text: '', error: parseOpenRouterError(response.status, body) }
    }

    return parseCompletionResponse(await response.text(), 'OpenRouter')
  } catch (err) {
    console.error('OpenRouter call failed:', err)
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling model',
    }
  }
}

// ---------------------------------------------------------------------------
// Direct provider caller — for models not on OpenRouter
// ---------------------------------------------------------------------------

export async function callDirectProvider(
  slug: string,
  messages: ChatMessages,
): Promise<{ text: string; error?: string }> {
  const provider = DIRECT_PROVIDERS[slug]
  if (!provider) {
    return { text: '', error: `No direct provider configured for ${slug}` }
  }

  const apiKey = process.env[provider.apiKeyEnv]
  if (!apiKey) {
    return { text: '', error: `${provider.name} API key is not configured (${provider.apiKeyEnv})` }
  }

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.modelId,
        max_tokens: 2048,
        messages,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`${provider.name} error (${response.status}):`, body)
      return { text: '', error: parseOpenRouterError(response.status, body) }
    }

    return parseCompletionResponse(await response.text(), provider.name)
  } catch (err) {
    console.error(`${provider.name} call failed:`, err)
    return {
      text: '',
      error: err instanceof Error ? err.message : `Unknown error calling ${provider.name}`,
    }
  }
}
