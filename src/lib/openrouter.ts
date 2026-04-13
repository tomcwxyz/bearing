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

/** Infer model capabilities from OpenRouter modality and parameter metadata */
export function inferCapabilities(
  inputModalities: string[],
  outputModalities: string[],
  supportedParams: string[],
): string[] {
  const caps: string[] = []
  if (inputModalities.includes('image')) caps.push('vision')
  if (inputModalities.includes('audio')) caps.push('audio')
  if (outputModalities.includes('image')) caps.push('video')
  if (supportedParams.includes('tools') || supportedParams.includes('tool_choice')) caps.push('tools')
  if (supportedParams.includes('structured_outputs') || supportedParams.includes('response_format')) caps.push('structured_output')
  if (supportedParams.includes('include_reasoning') || supportedParams.includes('reasoning')) caps.push('extended_thinking')
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

export async function callModel(
  openrouterId: string,
  messages: Array<{ role: string; content: string | Array<{ type: string; [key: string]: unknown }> }>,
): Promise<{ text: string; error?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { text: '', error: 'OpenRouter API key is not configured' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

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
      return { text: '', error: `Model request failed (${response.status})` }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return { text }
  } catch (err) {
    console.error('OpenRouter call failed:', err)
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling model',
    }
  }
}
