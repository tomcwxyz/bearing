'use server'

import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { createHash } from 'crypto'
import { neon } from '@neondatabase/serverless'

import { classifyTask, type ClarificationAnswer } from '@/lib/classification'
import { scoreModels } from '@/lib/scoring'
import { generateReasoning } from '@/lib/reasoning'
import {
  createTask,
  updateTaskPriorities,
  getTask,
  saveRecommendations,
  saveSelection,
  saveOutcome,
} from '@/lib/db'
import type { Factor } from '@/lib/registry'

// ---------------------------------------------------------------------------
// 1. submitTask
// ---------------------------------------------------------------------------

export async function submitTask(formData: FormData) {
  try {
    const description = formData.get('description')
    if (!description || typeof description !== 'string' || !description.trim()) {
      return { error: 'Description is required.' }
    }

    const trimmed = description.trim()
    const classification = await classifyTask(trimmed)

    const descriptionHash = createHash('sha256')
      .update(trimmed.toLowerCase())
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
      isRecurring: classification.is_recurring,
      classificationConfidence: classification.confidence,
    })

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        taskId,
        needsClarification: true,
        questions: classification.suggested_questions,
        description: trimmed,
      }
    }

    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    // redirect() throws a special Next.js error — re-throw it
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit task.' }
  }
}

// ---------------------------------------------------------------------------
// 2. submitClarification
// ---------------------------------------------------------------------------

export async function submitClarification(
  taskId: string,
  description: string,
  clarifications: ClarificationAnswer[],
) {
  try {
    const classification = await classifyTask(description, clarifications)

    const sql = neon(process.env.NEON_DATABASE_URL!)
    await sql`
      UPDATE tasks
      SET
        task_type = ${classification.task_type},
        task_subtype = ${classification.task_subtype ?? null},
        complexity = ${classification.complexity},
        input_length = ${classification.input_length},
        needs_vision = ${classification.needs_vision},
        needs_tools = ${classification.needs_tools},
        needs_code = ${classification.needs_code},
        is_recurring = ${classification.is_recurring},
        classification_confidence = ${classification.confidence}
      WHERE id = ${taskId}
    `

    if (classification.confidence < 0.6 || classification.clarification_needed) {
      return {
        needsClarification: true,
        questions: classification.suggested_questions,
      }
    }

    redirect(`/recommend/${taskId}/priorities`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit clarification.' }
  }
}

// ---------------------------------------------------------------------------
// 3. submitPriorities
// ---------------------------------------------------------------------------

export async function submitPriorities(taskId: string, priorityOrder: Factor[]) {
  try {
    await updateTaskPriorities(taskId, priorityOrder)
    redirect(`/recommend/${taskId}/results`)
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { error: error instanceof Error ? error.message : 'Failed to submit priorities.' }
  }
}

// ---------------------------------------------------------------------------
// 4. getResults
// ---------------------------------------------------------------------------

export async function getResults(taskId: string) {
  try {
    const task = await getTask(taskId)
    if (!task) {
      return { error: 'Task not found.' }
    }

    const priorityOrder: Factor[] = task.priority_order
      ? (typeof task.priority_order === 'string'
          ? JSON.parse(task.priority_order)
          : task.priority_order)
      : ['quality', 'cost', 'speed', 'capability', 'privacy', 'sustainability', 'transparency']

    const models = scoreModels({
      taskType: task.task_type,
      complexity: task.complexity,
      inputLength: task.input_length,
      needsVision: task.needs_vision,
      needsTools: task.needs_tools,
      needsCode: task.needs_code,
      priorityOrder,
    })

    const recommendationsForDb = models.map((m, i) => ({
      modelSlug: m.slug,
      rank: i + 1,
      weightedScore: m.weightedScore,
      factorScores: m.factorScores as Record<string, number>,
    }))
    await saveRecommendations(taskId, recommendationsForDb)

    const reasoning = await generateReasoning(
      task.description_hash ?? '',
      task.task_type,
      models,
    )

    return { task, models, reasoning }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to get results.' }
  }
}

// ---------------------------------------------------------------------------
// 5. selectModel
// ---------------------------------------------------------------------------

export async function selectModel(taskId: string, modelSlug: string, rank: number) {
  try {
    const selectionId = await saveSelection(taskId, modelSlug, rank)
    return { selectionId }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to select model.' }
  }
}

// ---------------------------------------------------------------------------
// 6. submitOutcome
// ---------------------------------------------------------------------------

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
