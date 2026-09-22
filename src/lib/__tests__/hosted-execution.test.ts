import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canExecuteHostedModel,
  listHostedExecutionRoutes,
  resolveHostedExecutionRoute,
} from '../hosted-execution'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hosted execution routes', () => {
  it('preserves OpenRouter as the default when Ollama Cloud is also available', () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const routes = listHostedExecutionRoutes(
      'qwen3.5-397b',
      'qwen/qwen3.5-397b-a17b',
    )

    expect(routes.map((route) => route.id)).toEqual([
      'openrouter',
      'ollama_cloud',
    ])
    expect(resolveHostedExecutionRoute(
      'qwen3.5-397b',
      'qwen/qwen3.5-397b-a17b',
    )?.id).toBe('openrouter')
  })

  it('uses Ollama Cloud when it is explicitly requested', () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    expect(resolveHostedExecutionRoute(
      'qwen3.5-397b',
      'qwen/qwen3.5-397b-a17b',
      'ollama_cloud',
    )).toMatchObject({
      id: 'ollama_cloud',
      provider: 'Ollama Cloud',
      modelId: 'qwen3.5:397b',
    })
  })

  it('does not mark an Ollama-only route runnable when the cloud key is absent', () => {
    vi.stubEnv('OLLAMA_API_KEY', '')
    expect(canExecuteHostedModel('glm-5.2', null)).toBe(false)
  })
})
