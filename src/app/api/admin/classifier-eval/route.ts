import { NextRequest, NextResponse } from 'next/server'

import { CLASSIFIER_EVAL_CASES } from '@/evaluation/classifier-cases'
import {
  classifierErrorResult,
  evaluateClassifierResult,
  summariseClassifierEvaluation,
  type ClassifierEvalResult,
} from '@/evaluation/classifier-evaluation'
import { classifyTask } from '@/lib/classification'

export const maxDuration = 300

const CONCURRENCY = 3

async function evaluateCase(testCase: (typeof CLASSIFIER_EVAL_CASES)[number]): Promise<ClassifierEvalResult> {
  try {
    const actual = await classifyTask(testCase.description)
    return evaluateClassifierResult(testCase, actual)
  } catch (error) {
    return classifierErrorResult(testCase, error)
  }
}

async function runClassifierEvaluation(): Promise<ClassifierEvalResult[]> {
  const results: ClassifierEvalResult[] = []

  for (let index = 0; index < CLASSIFIER_EVAL_CASES.length; index += CONCURRENCY) {
    const batch = CLASSIFIER_EVAL_CASES.slice(index, index + CONCURRENCY)
    results.push(...await Promise.all(batch.map(evaluateCase)))
  }

  return results
}

/**
 * Production-only semantic classifier evaluation.
 *
 * Vercel cron authenticates with CRON_SECRET. The response and logs deliberately
 * omit fixture descriptions and raw model output: only aggregate metrics,
 * fixture IDs and mismatched fields are emitted.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const results = await runClassifierEvaluation()
    const summary = summariseClassifierEvaluation(results)
    const drift = results.flatMap((result) => result.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: result.id,
        field: check.field,
        expected: check.expected,
        actual: check.actual,
        confidence: result.actual?.confidence ?? null,
      })))
    const errors = results
      .filter((result) => result.error)
      .map((result) => ({ id: result.id, error: result.error }))

    const report = {
      summary,
      drift,
      errors,
      timestamp: new Date().toISOString(),
    }

    console.log(`[classifier-eval-baseline] ${JSON.stringify(report)}`)

    return NextResponse.json({ ok: true, ...report })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Classifier evaluation failed'
    console.error('[classifier-eval-baseline] failed', message)
    return NextResponse.json(
      { ok: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}
