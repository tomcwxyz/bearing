'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'

import { updateTaskPriorities } from '@/db/tasks'
import type { Factor } from '@/lib/registry'

export async function submitPriorities(
  taskId: string,
  priorityOrder: Factor[],
  excludedFactors?: string[],
) {
  try {
    await updateTaskPriorities(taskId, priorityOrder, excludedFactors ?? [])
    redirect(`/recommend/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit priorities.' }
  }
}
