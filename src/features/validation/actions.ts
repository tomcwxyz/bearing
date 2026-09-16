'use server'

import { createHash } from 'crypto'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { classifyTask } from '@/lib/classification'
import { createTask, updateTaskPriorities } from '@/db/tasks'
import type { Factor } from '@/lib/registry'

const VALIDATION_PRIORITY_ORDER: Factor[] = [
  'quality',
  'capability',
  'cost',
  'transparency',
  'privacy',
  'sustainability',
  'speed',
]

/** Create the task used by the validation flow, then route to its results. */
export async function submitValidation(formData: FormData) {
  try {
    const modelSlug = formData.get('modelSlug') as string
    const description = formData.get('description') as string

    if (!modelSlug?.trim() || !description?.trim()) {
      return { error: 'Please provide both a model and task description.' }
    }

    const trimmedDescription = description.trim()
    const classification = await classifyTask(trimmedDescription)
    const descriptionHash = createHash('sha256')
      .update(trimmedDescription.toLowerCase())
      .digest('hex')

    const taskId = await createTask({
      descriptionHash,
      taskType: classification.task_type,
      taskSubtype: classification.task_subtype ?? undefined,
      complexity: classification.complexity,
      inputLength: classification.input_length,
      needsVision: classification.needs_vision,
      needsTools: classification.needs_tools,
      needsCode: classification.needs_code,
      needsReasoning: classification.needs_reasoning,
      isRecurring: classification.is_recurring,
      dataSensitivity: classification.data_sensitivity,
      latencyTarget: classification.latency_target,
      volume: classification.volume,
      needsLongContext: classification.needs_long_context,
      needsMultilingual: classification.needs_multilingual,
      isAgentic: classification.is_agentic,
      outputLength: classification.output_length,
      mode: 'validate',
      classificationConfidence: classification.confidence,
    })

    await updateTaskPriorities(taskId, VALIDATION_PRIORITY_ORDER)
    redirect(`/validate/${taskId}/results?model=${encodeURIComponent(modelSlug)}`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit validation.' }
  }
}
