'use client'

import { useEffect, useState } from 'react'
import {
  describeDetectedHardware,
  detectBrowserHardware,
  profileFromDetection,
  type BrowserHardwareDetection,
} from '@/lib/browser-hardware'
import {
  estimateSafeModelBudgetGb,
  type HardwareProfile,
} from '@/lib/open-local-models'

const STORAGE_KEY = 'bearing.hardware-profile.v1'
const MEMORY_OPTIONS = [8, 16, 24, 32, 36, 48, 64, 96, 128, 192]

interface HardwareProfilePanelProps {
  profile: HardwareProfile | null
  onProfileChange(profile: HardwareProfile | null): void
}

function readStoredProfile(): HardwareProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as HardwareProfile
    if (!value || typeof value.memoryGb !== 'number' || value.memoryGb <= 0) return null
    return value
  } catch {
    return null
  }
}

function persistProfile(profile: HardwareProfile | null) {
  try {
    if (profile) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Hardware preferences are a convenience only; storage may be unavailable.
  }
}

function unknownDetection(): BrowserHardwareDetection {
  return {
    platform: 'unknown',
    architecture: 'unknown',
    memoryGb: null,
    memorySource: 'unknown',
    logicalProcessors: null,
    webgpu: false,
    gpuVendor: null,
    gpuVendorRaw: null,
    gpuArchitecture: null,
    gpuDescription: null,
    maxBufferSizeGb: null,
    maxStorageBufferBindingSizeGb: null,
    fallbackAdapter: null,
  }
}

export function HardwareProfilePanel({
  profile,
  onProfileChange,
}: HardwareProfilePanelProps) {
  const [detection, setDetection] = useState<BrowserHardwareDetection | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  useEffect(() => {
    const stored = readStoredProfile()
    if (stored) onProfileChange(stored)
  }, [onProfileChange])

  async function checkDevice() {
    setChecking(true)
    setCheckError(null)
    try {
      const nextDetection = await detectBrowserHardware()
      setDetection(nextDetection)
      if (nextDetection.memoryGb) {
        const nextProfile = profileFromDetection(nextDetection)
        if (nextProfile) {
          persistProfile(nextProfile)
          onProfileChange(nextProfile)
        }
      }
    } catch {
      setCheckError('Bearing could not read browser hardware hints on this device.')
    } finally {
      setChecking(false)
    }
  }

  function chooseMemory(memoryGb: number) {
    const source = detection ?? unknownDetection()
    const nextProfile = profileFromDetection(source, memoryGb)
    if (!nextProfile) return
    persistProfile(nextProfile)
    onProfileChange(nextProfile)
  }

  function clearProfile() {
    persistProfile(null)
    onProfileChange(null)
    setDetection(null)
    setCheckError(null)
  }

  const budget = profile ? estimateSafeModelBudgetGb(profile) : null

  return (
    <section className="rounded-xl border border-cream-dark bg-cream/30 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-navy">This device</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-navy/55">
            Bearing can use lightweight browser hints to estimate which local models are realistic here.
            The check stays in your browser and does not allocate large GPU buffers.
          </p>
        </div>
        {!detection && !profile && (
          <button
            type="button"
            onClick={checkDevice}
            disabled={checking}
            className="rounded-lg border border-navy px-3 py-2 text-xs font-semibold text-navy transition-colors hover:bg-navy hover:text-cream disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check this device'}
          </button>
        )}
      </div>

      {detection && (
        <div className="mt-3 rounded-lg border border-teal/20 bg-white px-3 py-2">
          <p className="text-sm font-medium text-navy">
            {describeDetectedHardware(detection)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-navy/45">
            {detection.webgpu
              ? 'WebGPU is available. GPU identity and limits are browser-reported and may be deliberately coarsened.'
              : 'WebGPU was not available in this browser. Native local runtimes may still work.'}
          </p>
          {(detection.maxBufferSizeGb || detection.maxStorageBufferBindingSizeGb) && (
            <p className="mt-1 text-[11px] text-navy/40">
              Browser limits: max buffer {detection.maxBufferSizeGb ?? '—'} GB · max storage binding {detection.maxStorageBufferBindingSizeGb ?? '—'} GB.
              These are API limits, not detected VRAM.
            </p>
          )}
        </div>
      )}

      {(detection || profile) && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-navy/60">Memory</span>
            {MEMORY_OPTIONS.map((memoryGb) => (
              <button
                key={memoryGb}
                type="button"
                aria-pressed={profile?.memoryGb === memoryGb}
                onClick={() => chooseMemory(memoryGb)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  profile?.memoryGb === memoryGb
                    ? 'border-teal bg-teal text-cream'
                    : 'border-cream-dark bg-white text-navy/65 hover:border-teal'
                }`}
              >
                {memoryGb} GB
              </button>
            ))}
          </div>

          {profile && budget != null && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy/55">
              <span>
                Conservative model budget: <strong className="text-navy">~{budget} GB</strong>
              </span>
              <span>
                {profile.platform === 'macos' && profile.gpu?.vendor === 'apple'
                  ? 'Apple unified-memory estimate'
                  : profile.gpu?.vramGb
                    ? 'Based on known GPU VRAM'
                    : 'Memory fit only; GPU acceleration is not guaranteed'}
              </span>
              <button
                type="button"
                onClick={clearProfile}
                className="ml-auto underline underline-offset-2 hover:text-navy"
              >
                Forget device
              </button>
            </div>
          )}
        </div>
      )}

      {!detection && profile && (
        <p className="mt-2 text-xs text-navy/45">
          Using the hardware profile saved in this browser.
        </p>
      )}

      {checkError && (
        <p role="alert" className="mt-2 text-xs text-coral">{checkError}</p>
      )}
    </section>
  )
}
