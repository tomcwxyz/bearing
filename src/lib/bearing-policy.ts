import type { Factor } from './registry'

export interface BearingSignals {
  complexity?: string | null
  needs_reasoning?: boolean | null
  needs_vision?: boolean | null
  needs_tools?: boolean | null
  needs_code?: boolean | null
  data_sensitivity?: string | null
  latency_target?: string | null
  volume?: string | null
  needs_long_context?: boolean | null
  needs_multilingual?: boolean | null
  is_agentic?: boolean | null
  task_type?: string | null
}

const BASE_PRIORITY: Record<Factor, number> = {
  quality: 100,
  capability: 90,
  cost: 60,
  privacy: 50,
  speed: 40,
  transparency: 30,
  sustainability: 20,
}

const TIE_BREAK_ORDER: Factor[] = [
  'quality',
  'capability',
  'privacy',
  'cost',
  'speed',
  'transparency',
  'sustainability',
]

/**
 * Infer a sensible default priority order from the structured task signals
 * Bearing has already classified. This is deliberately a small, transparent
 * policy rather than another model call: the user can inspect and override it
 * via “Adjust bearing”, and changes remain deterministic/testable.
 *
 * Hard requirements (vision, tools, code, long context, on-prem) continue to
 * live in scoring hard filters. This policy only decides how to rank the
 * models that are actually eligible for the task.
 */
export function deriveBearingPriorities(signals: BearingSignals): Factor[] {
  const score: Record<Factor, number> = { ...BASE_PRIORITY }

  if (signals.complexity === 'complex') {
    score.quality += 35
    score.capability += 25
  } else if (signals.complexity === 'moderate') {
    score.quality += 15
    score.capability += 10
  }

  if (signals.needs_reasoning) {
    score.quality += 20
    score.capability += 15
  }

  if (
    signals.needs_vision ||
    signals.needs_tools ||
    signals.needs_code ||
    signals.needs_long_context ||
    signals.needs_multilingual ||
    signals.is_agentic
  ) {
    score.capability += 20
  }

  switch (signals.data_sensitivity) {
    case 'regulated_health':
    case 'regulated_finance':
      score.privacy += 75
      score.transparency += 15
      break
    case 'on_prem_required':
      // On-prem remains a hard filter; privacy/transparency rise here to make
      // the ordering within the surviving local set reflect the same intent.
      score.privacy += 85
      score.transparency += 25
      break
    case 'pii':
      score.privacy += 40
      break
  }

  if (signals.latency_target === 'realtime') {
    score.speed += 80
    score.capability += 10
  } else if (signals.latency_target === 'batch') {
    score.cost += 20
  }

  switch (signals.volume) {
    case 'millions_per_day':
      score.cost += 85
      score.speed += 15
      break
    case 'thousands_per_day':
      score.cost += 55
      break
    case 'hundreds_per_day':
      score.cost += 25
      break
  }

  if (signals.task_type === 'embedding') {
    // Embedding workloads can be extremely high-volume and are already class-
    // routed, so cost/capability deserve a little more default influence.
    score.cost += 20
    score.capability += 10
  }

  return (Object.keys(score) as Factor[]).sort((a, b) => {
    const difference = score[b] - score[a]
    if (difference !== 0) return difference
    return TIE_BREAK_ORDER.indexOf(a) - TIE_BREAK_ORDER.indexOf(b)
  })
}

const FACTOR_LABELS: Record<Factor, string> = {
  quality: 'quality',
  capability: 'capability',
  privacy: 'privacy',
  cost: 'cost',
  speed: 'speed',
  transparency: 'transparency',
  sustainability: 'sustainability',
}

/** Short user-facing explanation of the automatic bearing. */
export function describeBearing(priorityOrder: Factor[]): string {
  const [first, second, third] = priorityOrder
  const labels = [first, second, third].filter(Boolean).map((factor) => FACTOR_LABELS[factor])
  if (labels.length === 0) return 'Bearing used its standard model priorities.'
  if (labels.length === 1) return `Bearing prioritised ${labels[0]} for this task.`
  if (labels.length === 2) return `Bearing prioritised ${labels[0]} and ${labels[1]} for this task.`
  return `Bearing prioritised ${labels[0]}, ${labels[1]} and ${labels[2]} for this task.`
}
