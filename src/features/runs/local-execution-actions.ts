'use server'

import { saveExecutionObservation } from '@/db/execution-observations'
import { getReviewedOpenLocalEvidence } from '@/lib/open-local-evidence'
import { normaliseOllamaModelName } from '@/lib/ollama-catalogue'
import { sanitiseCoarseHardwareProfile } from '@/lib/selection-context'

function finiteNonNegative(value: unknown, max: number): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.min(parsed, max)
}

export async function recordLocalOllamaVerification(input: unknown) {
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

    if (!taskId || !modelSlug || !runtimeModelId) {
      return { error: 'Missing local execution identifiers.' }
    }

    const reviewed = getReviewedOpenLocalEvidence(modelSlug)
    if (!reviewed?.ollamaModelId || reviewed.status !== 'confirmed_local') {
      return { error: 'This model does not have reviewed local Ollama evidence.' }
    }

    if (
      normaliseOllamaModelName(reviewed.ollamaModelId) !==
      normaliseOllamaModelName(runtimeModelId)
    ) {
      return { error: 'The observed Ollama model does not match Bearing’s reviewed mapping.' }
    }

    const observationId = await saveExecutionObservation({
      taskId,
      modelSlug,
      executionLocation: 'user_local',
      executionPurpose: 'verification_probe',
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
        : 'Failed to record local Ollama verification.',
    }
  }
}
