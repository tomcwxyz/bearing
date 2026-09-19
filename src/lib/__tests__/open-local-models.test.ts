import { describe, expect, it } from 'vitest'
import {
  assessLocalMemoryFit,
  describeLocalTaskFit,
  isLocalCapableModel,
  isOpenWeightModel,
} from '../open-local-models'
import type { LocalInfo } from '../registry'

const localInfo: LocalInfo = {
  total_params_b: 9,
  active_params_b: null,
  is_moe: false,
  quant_options: [
    { quant: 'Q4_K_M', vram_gb: 6, quality_penalty: 0.06 },
    { quant: 'Q6_K', vram_gb: 8, quality_penalty: 0.02 },
    { quant: 'Q8_0', vram_gb: 11, quality_penalty: 0 },
  ],
}

describe('open/local model primitives', () => {
  it('treats strongly open weights as open without conflating other transparency dimensions', () => {
    expect(isOpenWeightModel({
      transparency: {
        open_weights: 1,
        open_training_data: 0,
        open_methodology: 0,
        licence_openness: 0.5,
        provider_disclosure: 0,
        fmti_company_score: null,
        transparency_score: 0.3,
        notes: '',
      },
    })).toBe(true)
  })

  it('does not treat weakly open weights as open', () => {
    expect(isOpenWeightModel({
      transparency: {
        open_weights: 0.5,
        open_training_data: 1,
        open_methodology: 1,
        licence_openness: 1,
        provider_disclosure: 1,
        fmti_company_score: null,
        transparency_score: 0.9,
        notes: '',
      },
    })).toBe(false)
  })

  it('requires concrete quantisation metadata for local-capable', () => {
    expect(isLocalCapableModel({ local_info: localInfo })).toBe(true)
    expect(isLocalCapableModel({ local_info: undefined })).toBe(false)
  })

  it('selects the highest-quality quant that fits an explicit memory budget', () => {
    const fit = assessLocalMemoryFit(localInfo, 8)
    expect(fit.fits).toBe(true)
    expect(fit.bestQuant?.quant).toBe('Q6_K')
    expect(fit.headroomGb).toBe(0)
  })

  it('returns no fit when the smallest acceptable quant exceeds the budget', () => {
    const fit = assessLocalMemoryFit(localInfo, 5)
    expect(fit.fits).toBe(false)
    expect(fit.bestQuant).toBeNull()
  })

  it('uses qualitative local fit language rather than fake match percentages', () => {
    expect(describeLocalTaskFit(0.9)).toBe('Excellent task fit')
    expect(describeLocalTaskFit(0.76)).toBe('Strong task fit')
    expect(describeLocalTaskFit(0.64)).toBe('Good task fit')
    expect(describeLocalTaskFit(0.52)).toBe('Possible task fit')
  })
})
