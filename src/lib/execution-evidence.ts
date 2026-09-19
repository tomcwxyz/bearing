import type { CoarseHardwareProfile } from './selection-context'

export type ExecutionLocation =
  | 'bearing_hosted'
  | 'user_local'
  | 'external_hosted'
  | 'unknown'

export type ExecutionPurpose =
  | 'task_execution'
  | 'verification_probe'

export type ExecutionEvidenceSource =
  | 'bearing_run'
  | 'runtime_api'
  | 'user_report'
  | 'imported'

export interface ExecutionObservationInput {
  taskId: string
  selectionId?: string | null
  routedRunId?: string | null
  modelSlug: string
  executionLocation: ExecutionLocation
  executionPurpose?: ExecutionPurpose
  runtime?: string | null
  runtimeVersion?: string | null
  runtimeModelId?: string | null
  quant?: string | null
  contextLength?: number | null
  hardwareProfile?: CoarseHardwareProfile | null
  measuredVramGb?: number | null
  tokensPerSecond?: number | null
  latencyMs?: number | null
  promptTokens?: number | null
  outputTokens?: number | null
  totalDurationMs?: number | null
  loadDurationMs?: number | null
  promptEvalDurationMs?: number | null
  evidenceSource: ExecutionEvidenceSource
}
