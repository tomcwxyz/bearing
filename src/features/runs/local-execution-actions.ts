'use server'

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

import { saveExecutionObservation } from '@/db/execution-observations'
import { hasLocalRecommendation } from '@/db/recommendations'
import { getReviewedOpenLocalEvidence } from '@/lib/open-local-evidence'
import { ollamaModelNamesCompatible } from '@/lib/ollama-catalogue'
import { sanitiseCoarseHardwareProfile } from '@/lib/selection-context'
import type { ExecutionPurpose } from '@/lib/execution-evidence'

interface LocalObservationTicketPayload {
  taskId: string
  modelSlug: string
  purpose: ExecutionPurpose
  exp: number
  nonce: string
}

function finiteNonNegative(value: unknown, max: number): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.min(parsed, max)
}

function ticketSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Local observation signing is not configured.')
  return secret
}

function signTicketBody(body: string): string {
  return createHmac('sha256', ticketSecret()).update(body).digest('base64url')
}

function parseTicket(ticket: string): LocalObservationTicketPayload | null {
  const [body, signature] = ticket.split('.')
  if (!body || !signature) return null

  const expected = signTicketBody(body)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalObservationTicketPayload
    if (
      !payload.taskId ||
      !payload.modelSlug ||
      !['verification_probe', 'task_execution'].includes(payload.purpose) ||
      !Number.isFinite(payload.exp) ||
      payload.exp < Date.now()
    ) return null
    return payload
  } catch {
    return null
  }
}

async function validateLocalTarget(taskId: string, modelSlug: string) {
  const reviewed = getReviewedOpenLocalEvidence(modelSlug)
  if (!reviewed?.ollamaModelId || reviewed.status !== 'confirmed_local') {
    return { error: 'This model does not have reviewed local Ollama evidence.' as const }
  }

  if (!await hasLocalRecommendation(taskId, modelSlug)) {
    return { error: 'This model is not a local recommendation for this bearing.' as const }
  }

  return { reviewed }
}

export async function createLocalOllamaObservationTicket(input: unknown) {
  try {
    if (!input || typeof input !== 'object') return { error: 'Invalid local execution request.' }
    const raw = input as Record<string, unknown>
    const taskId = typeof raw.taskId === 'string' ? raw.taskId : ''
    const modelSlug = typeof raw.modelSlug === 'string' ? raw.modelSlug : ''
    const purpose = raw.purpose === 'task_execution'
      ? 'task_execution'
      : raw.purpose === 'verification_probe'
        ? 'verification_probe'
        : null

    if (!taskId || !modelSlug || !purpose) {
      return { error: 'Missing local execution identifiers.' }
    }

    const target = await validateLocalTarget(taskId, modelSlug)
    if ('error' in target) return target

    const payload: LocalObservationTicketPayload = {
      taskId,
      modelSlug,
      purpose,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: randomBytes(16).toString('base64url'),
    }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return { ticket: `${body}.${signTicketBody(body)}` }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to authorise local execution.',
    }
  }
}

export async function recordLocalOllamaObservation(input: unknown) {
  try {
    if (!input || typeof input !== 'object') {
      return { error: 'Invalid local execution observation.' }
    }
    const raw = input as Record<string, unknown>
    const taskId = typeof raw.taskId === 'string' ? raw.taskId : ''
    const modelSlug = typeof raw.modelSlug === 'string' ? raw.modelSlug : ''
    const runtimeModelId = typeof raw.runtimeModelId === 'string'
      ? raw.runtimeModelId.slice(0, 200)
      : ''
    const ticket = typeof raw.ticket === 'string' ? raw.ticket : ''

    if (!taskId || !modelSlug || !runtimeModelId || !ticket) {
      return { error: 'Missing local execution identifiers.' }
    }

    const payload = parseTicket(ticket)
    if (!payload || payload.taskId !== taskId || payload.modelSlug !== modelSlug) {
      return { error: 'This local execution observation is not authorised or has expired.' }
    }

    const target = await validateLocalTarget(taskId, modelSlug)
    if ('error' in target) return target
    const { reviewed } = target

    if (!ollamaModelNamesCompatible(reviewed.ollamaModelId!, runtimeModelId)) {
      return { error: 'The observed Ollama model does not match Bearing’s reviewed mapping.' }
    }

    const observationId = await saveExecutionObservation({
      taskId,
      modelSlug,
      executionLocation: 'user_local',
      executionPurpose: payload.purpose,
      runtime: 'ollama',
      runtimeVersion: typeof raw.runtimeVersion === 'string'
        ? raw.runtimeVersion.slice(0, 80)
        : null,
      runtimeModelId,
      quant: typeof raw.quant === 'string' ? raw.quant.slice(0, 80) : null,
      contextLength: finiteNonNegative(raw.contextLength, 10_000_000),
      hardwareProfile: sanitiseCoarseHardwareProfile(raw.hardwareProfile),
      measuredVramGb: finiteNonNegative(raw.measuredVramGb, 4096),
      tokensPerSecond: finiteNonNegative(raw.tokensPerSecond, 1_000_000),
      latencyMs: finiteNonNegative(raw.latencyMs, 86_400_000),
      promptTokens: finiteNonNegative(raw.promptTokens, 10_000_000),
      outputTokens: finiteNonNegative(raw.outputTokens, 10_000_000),
      totalDurationMs: finiteNonNegative(raw.totalDurationMs, 86_400_000),
      loadDurationMs: finiteNonNegative(raw.loadDurationMs, 86_400_000),
      promptEvalDurationMs: finiteNonNegative(raw.promptEvalDurationMs, 86_400_000),
      evidenceSource: 'runtime_api',
    })

    return { observationId }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'Failed to record local Ollama execution.',
    }
  }
}
