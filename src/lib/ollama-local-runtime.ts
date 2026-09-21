import {
  fetchLocalOllamaModels,
  findOllamaCatalogueMatch,
  normaliseOllamaModelName,
  type OllamaCatalogueModel,
} from './ollama-catalogue'

export type OllamaProbeKind = 'chat' | 'embedding'
export type OllamaLoopbackPermissionState = PermissionState | 'unsupported'

export type OllamaProbeErrorCode =
  | 'unreachable'
  | 'permission_denied'
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
  message?: {
    content?: string
  }
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

interface OllamaEmbedResponse {
  model?: string
  embeddings?: number[][]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
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

export interface OllamaLocalRunResult extends OllamaLocalProbeResult {
  response: string
}

const PROBE_PROMPT =
  'This is a local runtime verification probe. Reply with exactly: BEARING_LOCAL_OK'
const EMBEDDING_PROBE_INPUT = 'BEARING_LOCAL_EMBEDDING_OK'

type LoopbackRequestInit = RequestInit & {
  targetAddressSpace?: 'loopback'
}

function nsToMs(value: number | undefined): number | null {
  if (!Number.isFinite(value) || !value || value < 0) return null
  return Math.round(value / 1_000_000)
}

function bytesToGb(value: number | undefined): number | null {
  if (!Number.isFinite(value) || !value || value <= 0) return null
  return Math.round((value / (1024 ** 3)) * 100) / 100
}

export async function getLoopbackPermissionState(): Promise<OllamaLoopbackPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported'
  try {
    const result = await navigator.permissions.query(
      { name: 'loopback-network' } as unknown as PermissionDescriptor,
    )
    return result.state
  } catch {
    try {
      const result = await navigator.permissions.query(
        { name: 'local-network-access' } as unknown as PermissionDescriptor,
      )
      return result.state
    } catch {
      return 'unsupported'
    }
  }
}

async function assertLoopbackPermission() {
  const state = await getLoopbackPermissionState()
  if (state === 'denied') {
    throw new OllamaProbeError(
      'permission_denied',
      'This browser has blocked Bearing from connecting to services on this device.',
    )
  }
}

async function readJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response
  const loopbackInit: LoopbackRequestInit = {
    ...init,
    targetAddressSpace: 'loopback',
  }
  try {
    response = await fetchImpl(url, loopbackInit)
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

async function resolveInstalledModel(
  ollamaModelId: string,
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<OllamaCatalogueModel> {
  await assertLoopbackPermission()

  let catalogue: OllamaCatalogueModel[]
  try {
    catalogue = await fetchLocalOllamaModels(baseUrl, { fetchImpl })
  } catch (caught) {
    if (caught instanceof OllamaProbeError) throw caught
    throw new OllamaProbeError(
      'unreachable',
      'Bearing could not reach the local Ollama API from this browser.',
    )
  }

  const installed = findOllamaCatalogueMatch(catalogue, [ollamaModelId])
  if (!installed) {
    throw new OllamaProbeError(
      'model_not_installed',
      `${ollamaModelId} (or a compatible variant) is not installed in this Ollama runtime.`,
    )
  }
  return installed
}

async function runtimeContext(
  installed: OllamaCatalogueModel,
  baseUrl: string,
  fetchImpl: typeof fetch,
) {
  const version = await readJson<OllamaVersionResponse>(
    fetchImpl,
    `${baseUrl}/api/version`,
  ).catch(() => ({ version: undefined }))

  const processes = await readJson<OllamaProcessResponse>(
    fetchImpl,
    `${baseUrl}/api/ps`,
  ).catch(() => ({ models: [] }))

  const process = (processes.models ?? []).find((candidate) =>
    normaliseOllamaModelName(candidate.model || candidate.name) ===
    normaliseOllamaModelName(installed.model || installed.name),
  )

  return { version, process }
}

function metricsFromResponse(
  installed: OllamaCatalogueModel,
  response: OllamaChatResponse | OllamaEmbedResponse,
  wallClockMs: number,
  version: OllamaVersionResponse,
  process?: OllamaProcessModel,
): OllamaLocalProbeResult {
  const chat = response as OllamaChatResponse
  const evalCount = Number(chat.eval_count ?? 0)
  const evalDuration = Number(chat.eval_duration ?? 0)
  const promptCount = Number(response.prompt_eval_count ?? 0)
  const promptDuration = Number(response.prompt_eval_duration ?? 0)

  const tokensPerSecond = evalCount > 0 && evalDuration > 0
    ? Math.round((evalCount / (evalDuration / 1_000_000_000)) * 10) / 10
    : promptCount > 0 && promptDuration > 0
      ? Math.round((promptCount / (promptDuration / 1_000_000_000)) * 10) / 10
      : null

  return {
    runtimeModelId: String(response.model || installed.model || installed.name),
    runtimeVersion: version.version ?? null,
    quant: process?.details?.quantization_level
      ?? installed.details?.quantization_level
      ?? null,
    contextLength: Number.isFinite(process?.context_length)
      ? Number(process?.context_length)
      : null,
    measuredVramGb: bytesToGb(process?.size_vram),
    tokensPerSecond,
    latencyMs: nsToMs(response.total_duration) ?? wallClockMs,
    promptTokens: Number.isFinite(response.prompt_eval_count)
      ? Number(response.prompt_eval_count)
      : null,
    outputTokens: Number.isFinite(chat.eval_count)
      ? Number(chat.eval_count)
      : null,
    totalDurationMs: nsToMs(response.total_duration),
    loadDurationMs: nsToMs(response.load_duration),
    promptEvalDurationMs: nsToMs(response.prompt_eval_duration),
  }
}

export async function probeLocalOllama(
  ollamaModelId: string,
  options: {
    baseUrl?: string
    fetchImpl?: typeof fetch
    kind?: OllamaProbeKind
  } = {},
): Promise<OllamaLocalProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
  const kind = options.kind ?? 'chat'
  const installed = await resolveInstalledModel(ollamaModelId, baseUrl, fetchImpl)

  const startedAt = performance.now()
  const response = kind === 'embedding'
    ? await readJson<OllamaEmbedResponse>(
        fetchImpl,
        `${baseUrl}/api/embed`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: installed.model || installed.name,
            input: EMBEDDING_PROBE_INPUT,
          }),
        },
      )
    : await readJson<OllamaChatResponse>(
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

  if (kind === 'embedding' && !(response as OllamaEmbedResponse).embeddings?.length) {
    throw new OllamaProbeError('probe_failed', 'Ollama returned no embedding for the verification probe.')
  }

  const { version, process } = await runtimeContext(installed, baseUrl, fetchImpl)
  return metricsFromResponse(installed, response, wallClockMs, version, process)
}

export async function runLocalOllama(
  ollamaModelId: string,
  prompt: string,
  options: {
    baseUrl?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<OllamaLocalRunResult> {
  if (!prompt.trim()) {
    throw new OllamaProbeError('probe_failed', 'A prompt is required for a local Ollama run.')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
  const installed = await resolveInstalledModel(ollamaModelId, baseUrl, fetchImpl)

  const startedAt = performance.now()
  const response = await readJson<OllamaChatResponse>(
    fetchImpl,
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: installed.model || installed.name,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    },
  )
  const wallClockMs = Math.round(performance.now() - startedAt)
  const { version, process } = await runtimeContext(installed, baseUrl, fetchImpl)

  return {
    ...metricsFromResponse(installed, response, wallClockMs, version, process),
    response: response.message?.content?.trim() ?? '',
  }
}
