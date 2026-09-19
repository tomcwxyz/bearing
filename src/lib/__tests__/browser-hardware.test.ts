import { describe, expect, it } from 'vitest'
import {
  describeDetectedHardware,
  detectPlatform,
  normaliseArchitecture,
  normaliseGpuVendor,
  profileFromDetection,
  type BrowserHardwareDetection,
} from '../browser-hardware'

const baseDetection: BrowserHardwareDetection = {
  platform: 'macos',
  architecture: 'arm64',
  memoryGb: 16,
  memorySource: 'device-memory',
  logicalProcessors: 10,
  webgpu: true,
  gpuVendor: 'apple',
  gpuVendorRaw: 'Apple',
  gpuArchitecture: 'apple m-series',
  gpuDescription: null,
  maxBufferSizeGb: 2,
  maxStorageBufferBindingSizeGb: 1,
  fallbackAdapter: false,
}

describe('browser hardware helpers', () => {
  it('detects common platforms conservatively', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('macos')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
    expect(detectPlatform('Something unusual')).toBe('unknown')
  })

  it('normalises GPU vendors without guessing unknown hardware', () => {
    expect(normaliseGpuVendor('Apple')).toBe('apple')
    expect(normaliseGpuVendor('NVIDIA Corporation')).toBe('nvidia')
    expect(normaliseGpuVendor('Advanced Micro Devices')).toBe('amd')
    expect(normaliseGpuVendor('Intel')).toBe('intel')
    expect(normaliseGpuVendor('Mystery GPU')).toBeNull()
  })

  it('normalises architecture hints', () => {
    expect(normaliseArchitecture('arm')).toBe('arm64')
    expect(normaliseArchitecture('aarch64')).toBe('arm64')
    expect(normaliseArchitecture('x86_64')).toBe('x64')
    expect(normaliseArchitecture('')).toBe('unknown')
  })

  it('only creates a fit profile when memory is known or confirmed', () => {
    expect(profileFromDetection(baseDetection)?.memoryGb).toBe(16)
    expect(profileFromDetection({ ...baseDetection, memoryGb: null })).toBeNull()
    expect(profileFromDetection({ ...baseDetection, memoryGb: null }, 32)?.memoryGb).toBe(32)
  })

  it('keeps the browser description qualitative', () => {
    expect(describeDetectedHardware(baseDetection)).toContain('Mac')
    expect(describeDetectedHardware(baseDetection)).toContain('~16 GB memory reported')
  })
})
