import type { HardwareProfile } from './open-local-models'

export interface BrowserHardwareDetection {
  platform: HardwareProfile['platform']
  architecture: HardwareProfile['architecture']
  memoryGb: number | null
  memorySource: 'device-memory' | 'unknown'
  logicalProcessors: number | null
  webgpu: boolean
  gpuVendor: HardwareProfile['gpu'] extends infer G
    ? G extends { vendor: infer V } ? V | null : never
    : never
  gpuVendorRaw: string | null
  gpuArchitecture: string | null
  gpuDescription: string | null
  maxBufferSizeGb: number | null
  maxStorageBufferBindingSizeGb: number | null
  fallbackAdapter: boolean | null
}

interface BrowserGpuAdapterInfo {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
  isFallbackAdapter?: boolean
}

interface BrowserGpuAdapter {
  info?: BrowserGpuAdapterInfo
  limits?: {
    maxBufferSize?: number
    maxStorageBufferBindingSize?: number
  }
}

interface BrowserGpu {
  requestAdapter(): Promise<BrowserGpuAdapter | null>
}

interface BrowserUserAgentData {
  getHighEntropyValues?(hints: string[]): Promise<Record<string, string>>
}

type HardwareNavigator = Navigator & {
  deviceMemory?: number
  gpu?: BrowserGpu
  userAgentData?: BrowserUserAgentData
}

export function detectPlatform(
  userAgent: string,
  platform = '',
): HardwareProfile['platform'] {
  const source = `${userAgent} ${platform}`.toLowerCase()
  if (source.includes('mac') || source.includes('iphone') || source.includes('ipad')) return 'macos'
  if (source.includes('win')) return 'windows'
  if (source.includes('linux') || source.includes('android')) return 'linux'
  return 'unknown'
}

export function normaliseGpuVendor(
  vendor: string | null | undefined,
): NonNullable<HardwareProfile['gpu']>['vendor'] | null {
  const value = vendor?.toLowerCase() ?? ''
  if (value.includes('apple')) return 'apple'
  if (value.includes('nvidia')) return 'nvidia'
  if (value.includes('amd') || value.includes('advanced micro devices')) return 'amd'
  if (value.includes('intel')) return 'intel'
  return null
}

export function normaliseArchitecture(
  architecture: string | null | undefined,
): HardwareProfile['architecture'] {
  const value = architecture?.toLowerCase() ?? ''
  if (value.includes('arm') || value.includes('aarch64')) return 'arm64'
  if (value.includes('x86') || value.includes('amd64') || value.includes('x64')) return 'x64'
  return 'unknown'
}

function bytesToGb(value: number | undefined): number | null {
  if (!value || !Number.isFinite(value)) return null
  return Math.round((value / 2 ** 30) * 10) / 10
}

/**
 * Lightweight browser-side hardware probe.
 *
 * This intentionally does not allocate large buffers or send hardware details
 * to the server. WebGPU limits are capability ceilings, not a measurement of
 * total GPU memory, and deviceMemory is a deliberately coarse browser hint.
 */
export async function detectBrowserHardware(
  sourceNavigator: Navigator = navigator,
): Promise<BrowserHardwareDetection> {
  const nav = sourceNavigator as HardwareNavigator
  const platform = detectPlatform(nav.userAgent ?? '', nav.platform ?? '')
  const memoryGb = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0
    ? nav.deviceMemory
    : null

  let architecture: HardwareProfile['architecture'] = 'unknown'
  try {
    const highEntropy = await nav.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness'])
    architecture = normaliseArchitecture(highEntropy?.architecture)
  } catch {
    // High-entropy UA data is optional and may be withheld by the browser.
  }

  let adapter: BrowserGpuAdapter | null = null
  try {
    adapter = await nav.gpu?.requestAdapter() ?? null
  } catch {
    adapter = null
  }

  const info = adapter?.info
  const gpuVendorRaw = info?.vendor || null
  const gpuVendor = normaliseGpuVendor(gpuVendorRaw)

  // Apple GPUs imply Apple Silicon; Intel Macs report an Intel/AMD adapter.
  if (architecture === 'unknown' && platform === 'macos' && gpuVendor === 'apple') {
    architecture = 'arm64'
  }

  return {
    platform,
    architecture,
    memoryGb,
    memorySource: memoryGb ? 'device-memory' : 'unknown',
    logicalProcessors:
      typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
        ? nav.hardwareConcurrency
        : null,
    webgpu: Boolean(adapter),
    gpuVendor,
    gpuVendorRaw,
    gpuArchitecture: info?.architecture || info?.device || null,
    gpuDescription: info?.description || null,
    maxBufferSizeGb: bytesToGb(adapter?.limits?.maxBufferSize),
    maxStorageBufferBindingSizeGb: bytesToGb(adapter?.limits?.maxStorageBufferBindingSize),
    fallbackAdapter: typeof info?.isFallbackAdapter === 'boolean'
      ? info.isFallbackAdapter
      : null,
  }
}

export function profileFromDetection(
  detection: BrowserHardwareDetection,
  memoryGb: number | null = detection.memoryGb,
): HardwareProfile | null {
  if (!memoryGb || memoryGb <= 0) return null

  return {
    platform: detection.platform,
    architecture: detection.architecture,
    memoryGb,
    gpu: detection.gpuVendor
      ? {
          vendor: detection.gpuVendor,
          model: detection.gpuDescription || detection.gpuArchitecture || detection.gpuVendorRaw || undefined,
        }
      : undefined,
  }
}

export function describeDetectedHardware(
  detection: BrowserHardwareDetection,
): string {
  const bits: string[] = []
  const platformLabel = detection.platform === 'macos'
    ? 'Mac'
    : detection.platform === 'windows'
      ? 'Windows'
      : detection.platform === 'linux'
        ? 'Linux'
        : 'Device'
  bits.push(platformLabel)

  if (detection.gpuVendorRaw || detection.gpuArchitecture) {
    bits.push(
      [detection.gpuVendorRaw, detection.gpuArchitecture]
        .filter(Boolean)
        .join(' '),
    )
  } else if (detection.webgpu) {
    bits.push('WebGPU')
  }

  if (detection.memoryGb) bits.push(`~${detection.memoryGb} GB memory reported`)
  if (detection.logicalProcessors) bits.push(`${detection.logicalProcessors} logical CPUs`)

  return bits.join(' · ')
}
