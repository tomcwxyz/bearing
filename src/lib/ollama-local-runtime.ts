import {
  fetchLocalOllamaModels,
  findOllamaCatalogueMatch,
  normaliseOllamaModelName,
  type OllamaCatalogueModel,
} from './ollama-catalogue'

export type OllamaProbeErrorCode =
  | 'unreachable'
  | 'model_not_installed'
  | 'probe_failed'

export class OllamaProbeError extends Error {
  constructor(
    public readonly code: OllamaProbeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OllamaProbeError'
  }
}

interface OllamaVersionResponse {
  version?: string
}

interface OllamaChatResponse {
  model?: string
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

interface OllamaProcessModel extends OllamaCatalogueModel {
  size_vram?: number
  context_length?: number
}

interface OllamaProcessResponse {
  models?: OllamaProcessModel[]
}

export interface OllamaLocalProbeResult {
  runtimeModelId: string
  runtimeVersion: string | null
  quant: string | null
  contextLength: number | null
  measuredVramGb: number | null
  tokensPerSecond: number | null
  latencyMs: number | null
  promptTokens: number | null
  outputTokens: number | null
  totalDurationMs: number | null
  loadDurationMs: number | null
  promptEvalDurationMs: number | null
}

const PROBE_PROMPT =
  'This is a local runtime verification probe. Reply with exactly: BEARING_LOCAL_OK'

function nsToMs(value: number | undefined): number | null {
  if (!Number.isFinite(value) || !value || value < 0) return null
  return Math.round(value / 1_000_000)
}

function bytesToGb(value: number | undefined): number | null {
  if (!Number.isFinite(value) || !value || value <= 0) return null
  return Math.round((value / (1024 ** 3)) * 100) / 100
}

async function readJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch {
    throw new OllamaProbeError(
      'unreachable',
      'Bearing could not reach the local Ollama API from this browser.',
    )
  }

  if (!response.ok) {
    throw new OllamaProbeError(
      'probe_failed',
      `Local Ollama returned HTTP ${response.status}.`,
    )
  }
  return response.json() as Promise<T>
}

export async function probeLocalOllama(
  ollamaModelId: string,
  options: {
    baseUrl?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<OllamaLocalProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')

  let catalogue: OllamaCatalogueModel[]
  try {
    catalogue = await fetchLocalOllamaModels(baseUrl, { fetchImpl })
  } catch {
    throw new OllamaProbeError(
      'unreachable',
      'Bearing could not reach the local Ollama API from this browser.',
    )
  }

  const installed = findOllamaCatalogueMatch(catalogue, [ollamaModelId])
  if (!installed) {
    throw new OllamaProbeError(
      'model_not_installed',
      `${ollamaModelId} is not installed in this Ollama runtime.`,
    )
  }

  const version = await readJson<OllamaVersionResponse>(
    fetchImpl,
    `${baseUrl}/api/version`,
  ).catch(() => ({ version: undefined }))

  const startedAt = performance.now()
  const chat = await readJson<OllamaChatResponse>(
    fetchImpl,
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: installed.model || installed.name,
        messages: [{ role: 'user', content: PROBE_PROMPT }],
        stream: false,
        options: {
          temperature: 0,
          num_predict: 16,
          num_ctx: 2048,
        },
      }),
    },
  )
  const wallClockMs = Math.round(performance.now() - startedAt)

  const processes = await readJson<OllamaProcessResponse>(
    fetchImpl,
    `${baseUrl}/api/ps`,
  ).catch(() => ({ models: [] }))

  const process = (processes.models ?? []).find((candidate) =>
    normaliseOllamaModelName(candidate.model || candidate.name) ===
    normaliseOllamaModelName(installed.model || installed.name),
  )

  const evalCount = Number(chat.eval_count ?? 0)
  const evalDuration = Number(chat.eval_duration ?? 0)
  const tokensPerSecond = evalCount > 0 && evalDuration > 0
    ? Math.round((evalCount / (evalDuration / 1_000_000_000)) * 10) / 10
    : null

  return {
    runtimeModelId: String(chat.model || installed.model || installed.name),
    runtimeVersion: version.version ?? null,
    quant: process?.details?.quantization_level
      ?? installed.details?.quantization_level
      ?? null,
    contextLength: Number.isFinite(process?.context_length)
      ? Number(process?.context_length)
      : 2048,
    measuredVramGb: bytesToGb(process?.size_vram),
    tokensPerSecond,
    latencyMs: nsToMs(chat.total_duration) ?? wallClockMs,
    promptTokens: Number.isFinite(chat.prompt_eval_count)
      ? Number(chat.prompt_eval_count)
      : null,
    outputTokens: Number.isFinite(chat.eval_count)
      ? Number(chat.eval_count)
      : null,
    totalDurationMs: nsToMs(chat.total_duration),
    loadDurationMs: nsToMs(chat.load_duration),
    promptEvalDurationMs: nsToMs(chat.prompt_eval_duration),
  }
}
