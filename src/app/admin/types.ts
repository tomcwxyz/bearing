// Shared types for the admin UI. Kept separate from `actions.ts` because
// Next.js 'use server' files must only export async functions — type exports
// there get transformed into runtime references and throw on SSR.

export type {
  UsageSummary,
  ActivityPoint,
  ModeCount,
  SignupPoint,
  InsightsSummary,
  TaskTypeCount,
  LeaderboardEntry,
  OutcomeBreakdown,
  CapabilityDemand,
} from '@/lib/dashboard'

export interface DiscoverModel {
  id: string
  name: string
  provider: string
  modality: string
  contextWindow: number
  pricing: { input_per_1m: number; output_per_1m: number }
  capabilities: string[]
  description: string | null
  supportedParameters: string[]
  created: number
}
