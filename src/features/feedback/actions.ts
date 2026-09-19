'use server'

import { saveOutcome, saveSelection } from '@/db/feedback'
import { sanitiseSelectionChoiceContext } from '@/lib/selection-context'

export async function selectModel(
  taskId: string,
  modelSlug: string,
  rank: number,
  choiceContext?: unknown,
) {
  try {
    const selectionId = await saveSelection(
      taskId,
      modelSlug,
      rank,
      'recommend',
      sanitiseSelectionChoiceContext(choiceContext),
    )
    return { selectionId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to select model.' }
  }
}

export async function submitOutcome(
  taskId: string,
  selectionId: string,
  success: boolean,
  failureReason: string | null,
  feedback: string | null,
) {
  try {
    await saveOutcome(taskId, selectionId, success, failureReason, feedback)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to submit outcome.' }
  }
}
