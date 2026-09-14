'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { classifyTask, type ClarificationAnswer } from '@/lib/classification'
import { getCurrentUser } from '@/lib/auth'
import { getTask } from '@/lib/db'
import { updateTaskClassification } from '@/db/tasks'
import { getEffectiveBearingPreferenceFactors } from './preferences'
import { prepareSingleStageEmbedding } from './embedding'
import type { Factor } from '@/lib/registry'

async function preferencesForOwnedTask(
  task: Awaited<ReturnType<typeof getTask>>,
  userId: string | null | undefined,
): Promise<Factor[]> {
  if (!task || !userId || task.user_id !== userId) return []
  return getEffectiveBearingPreferenceFactors(userId).catch((error) => {
    console.warn('[clarification] bearing preferences unavailable', error)
    return []
  })
}

/**
 * Reclassify a task after one clarification round, persist the structured
 * result through the task repository, and route onward. Raw task text remains
 * client-held for the short clarification session and is not stored here.
 */
export async function submitBearingClarification(
  taskId: string,
  description: string,
  clarifications: ClarificationAnswer[],
) {
  try {
    const [classification, user, task] = await Promise.all([
      classifyTask(description, clarifications),
      getCurrentUser(),
      getTask(taskId),
    ])

    if (!task) return { error: 'Task not found.' }

    await updateTaskClassification(taskId, classification)

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        needsClarification: true,
        questions: classification.suggested_questions,
      }
    }

    const preferredFactors = await preferencesForOwnedTask(task, user?.id)
    const handledEmbedding = await prepareSingleStageEmbedding(
      taskId,
      classification,
      preferredFactors,
    )
    if (handledEmbedding) redirect(`/embedding/${taskId}/results`)

    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return {
      error: error instanceof Error ? error.message : 'Failed to submit clarification.',
    }
  }
}
