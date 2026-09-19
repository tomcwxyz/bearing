import { describe, expect, it } from 'vitest'
import {
  buildSelectionChoiceContext,
  sanitiseSelectionChoiceContext,
} from '../selection-context'

describe('selection choice context', () => {
  it('keeps only coarse hardware fields', () => {
    const raw = {
      schema_version: '1',
      filters: {
        open_only: true,
        local_only: false,
        hardware_fit_only: true,
      },
      hardware_profile: {
        platform: 'macos',
        architecture: 'arm64',
        memory_gb: 32,
        gpu_vendor: 'apple',
        gpu_model: 'Apple M4 Pro 20-core',
        browser_user_agent: 'very identifying',
      },
      predicted_hardware_fit: {
        fits: true,
        best_quant: 'Q4_K_M',
        memory_budget_gb: 25.6,
        estimated_runtime_gb: 18.2,
        headroom_gb: 7.4,
        confidence: 'medium',
      },
      arbitrary: 'discard me',
    }

    expect(sanitiseSelectionChoiceContext(raw)).toEqual({
      schema_version: '1',
      filters: {
        open_only: true,
        local_only: false,
        hardware_fit_only: true,
      },
      hardware_profile: {
        platform: 'macos',
        architecture: 'arm64',
        memory_gb: 32,
        gpu_vendor: 'apple',
      },
      predicted_hardware_fit: {
        fits: true,
        best_quant: 'Q4_K_M',
        memory_budget_gb: 25.6,
        estimated_runtime_gb: 18.2,
        headroom_gb: 7.4,
        confidence: 'medium',
      },
    })
  })

  it('builds a serialisable context without the GPU model string', () => {
    const context = buildSelectionChoiceContext({
      openOnly: false,
      localOnly: true,
      hardwareFitOnly: true,
      hardwareProfile: {
        platform: 'windows',
        architecture: 'x64',
        memoryGb: 64,
        gpu: {
          vendor: 'nvidia',
          model: 'Specific identifying adapter name',
          vramGb: 24,
        },
        runtime: 'ollama',
      },
      hardwareFit: {
        fits: true,
        bestQuant: { quant: 'Q6_K', vram_gb: 18, quality_penalty: 0.02 },
        memoryBudgetGb: 21.6,
        estimatedRuntimeGb: 20.6,
        headroomGb: 1,
        minimumQuant: { quant: 'Q4_K_M', vram_gb: 14, quality_penalty: 0.05 },
        minimumRuntimeGb: 16.2,
        confidence: 'high',
      },
    })

    expect(context.hardware_profile).toEqual({
      platform: 'windows',
      architecture: 'x64',
      memory_gb: 64,
      gpu_vendor: 'nvidia',
      vram_gb: 24,
      runtime: 'ollama',
    })
    expect(JSON.stringify(context)).not.toContain('Specific identifying adapter name')
  })

  it('rejects a hardware profile with no usable memory value', () => {
    const context = sanitiseSelectionChoiceContext({
      filters: {},
      hardware_profile: { platform: 'macos', architecture: 'arm64', memory_gb: 0 },
    })
    expect(context?.hardware_profile).toBeNull()
  })
})
