'use client'

import { useState } from 'react'
import { recordLocalOllamaVerification } from '@/features/runs/local-execution-actions'
import {
  OllamaProbeError,
  probeLocalOllama,
  type OllamaLocalProbeResult,
} from '@/lib/ollama-local-runtime'
import {
  coarseHardwareProfileFromProfile,
  type CoarseHardwareProfile,
} from '@/lib/selection-context'
import type { HardwareProfile } from '@/lib/open-local-models'

interface LocalOllamaVerifierProps {
  taskId: string
  modelSlug: string
  modelName: string
  ollamaModelId: string
  hardwareProfile: HardwareProfile | null
}

function displayMetrics(result: OllamaLocalProbeResult): string {
  return [
    result.quant,
    result.measuredVramGb != null ? `${result.measuredVramGb} GB VRAM` : null,
    result.contextLength ? `${result.contextLength.toLocaleString()} ctx` : null,
    result.tokensPerSecond != null ? `${result.tokensPerSecond} tok/s` : null,
    result.latencyMs != null ? `${result.latencyMs} ms` : null,
  ].filter(Boolean).join(' · ')
}

function ollamaHardwareProfile(
  profile: HardwareProfile | null,
): CoarseHardwareProfile | null {
  const coarse = coarseHardwareProfileFromProfile(profile)
  return coarse ? { ...coarse, runtime: 'ollama' } : null
}

export function LocalOllamaVerifier({
  taskId,
  modelSlug,
  modelName,
  ollamaModelId,
  hardwareProfile,
}: LocalOllamaVerifierProps) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<OllamaLocalProbeResult | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  async function verify() {
    setChecking(true)
    setError(null)
    setResult(null)
    setSaved(false)

    try {
      const probe = await probeLocalOllama(ollamaModelId)
      setResult(probe)

      const observation = await recordLocalOllamaVerification({
        taskId,
        modelSlug,
        ...probe,
        hardwareProfile: ollamaHardwareProfile(hardwareProfile),
      })

      if (observation.error) {
        setError({
          code: 'save_failed',
          message: `The local run succeeded, but Bearing could not save the metrics: ${observation.error}`,
        })
      } else {
        setSaved(true)
      }
    } catch (caught) {
      if (caught instanceof OllamaProbeError) {
        setError({ code: caught.code, message: caught.message })
      } else {
        setError({
          code: 'probe_failed',
          message: caught instanceof Error ? caught.message : 'Local Ollama verification failed.',
        })
      }
    } finally {
      setChecking(false)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://findbearing.org'

  return (
    <div className="mt-2 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-navy">Verify on this machine with Ollama</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-navy/45">
            Runs a tiny fixed local probe — not your task — and records only runtime metrics and coarse hardware.
          </p>
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={checking}
          className="rounded-md border border-amber px-2.5 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-amber hover:text-white disabled:opacity-50"
        >
          {checking ? 'Verifying…' : result ? 'Run again' : 'Verify in Ollama'}
        </button>
      </div>

      {result && (
        <div className="mt-2 rounded-md border border-teal/20 bg-white px-2.5 py-2 text-xs">
          <p className="font-semibold text-teal">
            {saved ? 'Verified and recorded' : 'Verified locally'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-navy/60">
            {displayMetrics(result) || modelName}
          </p>
          {result.runtimeVersion && (
            <p className="mt-1 text-[11px] text-navy/40">Ollama {result.runtimeVersion}</p>
          )}
        </div>
      )}

      {error?.code === 'model_not_installed' && (
        <div className="mt-2 rounded-md border border-cream-dark bg-white px-2.5 py-2 text-xs text-navy/65">
          <p>{error.message}</p>
          <p className="mt-1">Install it explicitly, then retry:</p>
          <code className="mt-1 block select-all rounded bg-cream px-2 py-1 text-[11px] text-navy">
            ollama pull {ollamaModelId}
          </code>
        </div>
      )}

      {error?.code === 'unreachable' && (
        <div className="mt-2 rounded-md border border-cream-dark bg-white px-2.5 py-2 text-xs text-navy/65">
          <p>{error.message}</p>
          <p className="mt-1 leading-relaxed">
            Ollama only allows local web origins by default. Add <code className="font-mono">{origin}</code> to
            <code className="ml-1 font-mono">OLLAMA_ORIGINS</code>, restart Ollama, then retry.
          </p>
        </div>
      )}

      {error && !['model_not_installed', 'unreachable'].includes(error.code) && (
        <p role="alert" className="mt-2 text-xs text-coral">{error.message}</p>
      )}
    </div>
  )
}
