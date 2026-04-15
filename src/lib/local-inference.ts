import type { Model, LocalInfo, QuantOption } from './registry'
import type { ScoredModel } from './scoring'

// ---------------------------------------------------------------------------
// Hardware tiers
// ---------------------------------------------------------------------------

export interface HardwareTier {
  id: string
  name: string
  description: string
  vram_gb: number
  examples: string[]
}

export const HARDWARE_TIERS: HardwareTier[] = [
  {
    id: 'consumer_laptop',
    name: 'Consumer laptop',
    description: '8–16 GB unified memory',
    vram_gb: 10,
    examples: ['MacBook Air M3 16GB', 'Most laptops with 16GB RAM'],
  },
  {
    id: 'prosumer',
    name: 'Prosumer desktop',
    description: '32–64 GB unified memory or dedicated GPU',
    vram_gb: 24,
    examples: ['Mac Mini M4 Pro 36GB', 'MacBook Pro M4 Pro 36GB', 'RTX 4090 (24GB VRAM)'],
  },
  {
    id: 'workstation',
    name: 'Workstation',
    description: '64–128 GB unified memory or multi-GPU',
    vram_gb: 56,
    examples: ['Mac Studio M4 64GB', 'Mac Studio M4 Ultra 128GB', '2× RTX 4090'],
  },
  {
    id: 'server',
    name: 'Serious hardware',
    description: '128 GB+ unified memory or enterprise GPUs',
    vram_gb: 128,
    examples: ['Mac Studio M4 Ultra 192GB', 'A100 80GB', 'H100'],
  },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalModelRecommendation {
  model: ScoredModel
  localInfo: LocalInfo
  bestQuant: QuantOption
  hardwareTier: HardwareTier
  effectiveQuality: number
}

export interface LocalInferenceResult {
  recommendations: LocalModelRecommendation[]
  tiersUsed: HardwareTier[]
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const MAX_QUALITY_PENALTY = 0.20
const MIN_TASK_FITNESS = 0.5
const MAX_PER_TIER = 2
const MAX_TOTAL = 5

/** Find the lowest hardware tier that can run a given VRAM requirement. */
export function findHardwareTier(vramGb: number): HardwareTier | null {
  for (const tier of HARDWARE_TIERS) {
    if (tier.vram_gb >= vramGb) return tier
  }
  return null
}

/**
 * Pick the smallest quantization option that keeps quality penalty
 * within the acceptable threshold.
 */
export function pickBestQuant(quantOptions: QuantOption[]): QuantOption | null {
  const viable = quantOptions.filter(q => q.quality_penalty <= MAX_QUALITY_PENALTY)
  if (viable.length === 0) return null
  return viable.reduce((smallest, q) =>
    q.vram_gb < smallest.vram_gb ? q : smallest
  , viable[0])
}

/**
 * Score and rank open-weight models for local inference.
 *
 * Filters to models with local_info, scores by task fitness adjusted for
 * quantization quality penalty, and groups by hardware tier.
 */
export function scoreLocalModels(
  scoredModels: ScoredModel[],
  allModels: Model[],
  taskType: string,
): LocalInferenceResult {
  const modelMap = new Map(allModels.map(m => [m.slug, m]))
  const candidates: LocalModelRecommendation[] = []

  for (const scored of scoredModels) {
    const full = modelMap.get(scored.slug)
    if (!full?.local_info) continue

    const taskFitness = full.task_fitness[taskType] ?? 0
    if (taskFitness < MIN_TASK_FITNESS) continue

    const bestQuant = pickBestQuant(full.local_info.quant_options)
    if (!bestQuant) continue

    const tier = findHardwareTier(bestQuant.vram_gb)
    if (!tier) continue // Exceeds all hardware tiers

    const effectiveQuality = taskFitness * (1 - bestQuant.quality_penalty)

    candidates.push({
      model: scored,
      localInfo: full.local_info,
      bestQuant,
      hardwareTier: tier,
      effectiveQuality,
    })
  }

  // Sort by effective quality descending
  candidates.sort((a, b) => b.effectiveQuality - a.effectiveQuality)

  // Limit to MAX_PER_TIER per tier, MAX_TOTAL overall
  const tierCounts = new Map<string, number>()
  const filtered: LocalModelRecommendation[] = []

  for (const c of candidates) {
    if (filtered.length >= MAX_TOTAL) break
    const count = tierCounts.get(c.hardwareTier.id) ?? 0
    if (count >= MAX_PER_TIER) continue
    tierCounts.set(c.hardwareTier.id, count + 1)
    filtered.push(c)
  }

  // Collect unique tiers used, in tier order
  const tiersUsed = HARDWARE_TIERS.filter(t => tierCounts.has(t.id))

  return { recommendations: filtered, tiersUsed }
}
