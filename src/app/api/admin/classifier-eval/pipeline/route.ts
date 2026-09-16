import { NextRequest, NextResponse } from 'next/server'

import { CLASSIFIER_EVAL_CASES } from '@/evaluation/classifier-cases'
import {
  classifierErrorResult,
  evaluateClassifierResult,
  summariseClassifierEvaluation,
  type ClassifierEvalResult,
} from '@/evaluation/classifier-evaluation'
import { classifyTask } from '@/lib/classification'

export const maxDuration = 120

const PIPELINE_CASES = CLASSIFIER_EVAL_CASES.filter((testCase) => testCase.id.startsWith('pipeline-'))

/**
 * Focused production diagnostic for pipeline-classifier failures.
 * Logs one compact line per fixture so validation errors remain inspectable
 * without exposing raw task text or model output.
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

  const results: ClassifierEvalResult[] = []

  for (const testCase of PIPELINE_CASES) {
    try {
      const actual = await classifyTask(testCase.description)
      const result = evaluateClassifierResult(testCase, actual)
      results.push(result)
      const failedFields = result.checks.filter((check) => !check.passed).map((check) => ({
        field: check.field,
        expected: check.expected,
        actual: check.actual,
      }))
      console.log(`[classifier-pipeline-diagnostic] ${JSON.stringify({
        id: testCase.id,
        ok: true,
        confidence: actual.confidence,
        pipelineRecommended: actual.pipeline_recommended,
        stageCount: actual.pipeline_stages?.length ?? 0,
        failedFields,
      })}`)
    } catch (error) {
      const result = classifierErrorResult(testCase, error)
      results.push(result)
      console.error(`[classifier-pipeline-diagnostic] ${JSON.stringify({
        id: testCase.id,
        ok: false,
        error: result.error,
      })}`)
    }
  }

  return NextResponse.json({
    ok: true,
    summary: summariseClassifierEvaluation(results),
    results: results.map((result) => ({
      id: result.id,
      error: result.error,
      checks: result.checks,
      confidence: result.actual?.confidence ?? null,
      pipelineRecommended: result.actual?.pipeline_recommended ?? null,
      stageCount: result.actual?.pipeline_stages?.length ?? null,
    })),
    timestamp: new Date().toISOString(),
  })
}
