import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAllModelsLive, getModel, getModelLive } from '@/lib/registry'
import { getAllModelsFromDb, getModelForAdmin } from '@/db/models'

vi.mock('@/db/models', () => ({
  getAllModelsFromDb: vi.fn(),
  getModelForAdmin: vi.fn(),
}))

const publicModel = getModel('claude-sonnet-4.6')!

describe('public catalogue respects retired models', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('does not expose an inactive model from a stale static registry entry', async () => {
    vi.mocked(getModelForAdmin).mockResolvedValue({
      ...publicModel, active: false, lifecycleStatus: 'retired',
      retiredAt: '2026-10-11T00:00:00Z', retirementReason: 'Provider retired model',
      retiredBy: 'admin',
    })
    expect(await getModelLive(publicModel.slug)).toBeUndefined()
  })

  it('does not expose an unpublished draft from static registry fallback', async () => {
    vi.mocked(getModelForAdmin).mockResolvedValue({
      ...publicModel, active: false, lifecycleStatus: 'draft',
      retiredAt: null, retirementReason: null, retiredBy: null,
    })
    expect(await getModelLive(publicModel.slug)).toBeUndefined()
  })

  it('strips admin-only lifecycle data from a live public model', async () => {
    vi.mocked(getModelForAdmin).mockResolvedValue({
      ...publicModel, active: true, lifecycleStatus: 'live',
      retiredAt: null, retirementReason: null, retiredBy: null,
    })
    const model = await getModelLive(publicModel.slug)
    expect(model?.slug).toBe(publicModel.slug)
    expect(model).not.toHaveProperty('lifecycleStatus')
    expect(model).not.toHaveProperty('retirementReason')
    expect(model).not.toHaveProperty('active')
  })

  it('fails closed in production rather than serving stale data when Neon is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.mocked(getModelForAdmin).mockRejectedValue(new Error('Neon unavailable'))
    vi.mocked(getAllModelsFromDb).mockRejectedValue(new Error('Neon unavailable'))
    await expect(getModelLive(publicModel.slug)).rejects.toThrow('Neon unavailable')
    await expect(getAllModelsLive()).rejects.toThrow('Neon unavailable')
  })

  it('fails closed in ordinary development instead of using a stale static catalogue', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.mocked(getModelForAdmin).mockRejectedValue(new Error('Local DB not configured'))
    vi.mocked(getAllModelsFromDb).mockRejectedValue(new Error('Local DB not configured'))
    await expect(getModelLive(publicModel.slug)).rejects.toThrow('Local DB not configured')
    await expect(getAllModelsLive()).rejects.toThrow('Local DB not configured')
  })
})
