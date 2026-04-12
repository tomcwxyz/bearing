const SLUG_TO_OPENROUTER: Record<string, string> = {
  'claude-opus-4.6': 'anthropic/claude-opus-4',
  'claude-sonnet-4.6': 'anthropic/claude-sonnet-4',
  'claude-haiku-4.5': 'anthropic/claude-haiku-4',
  'gpt-5.4': 'openai/gpt-5.4',
  'gpt-5.4-mini': 'openai/gpt-5.4-mini',
  'gpt-5.4-nano': 'openai/gpt-5.4-nano',
  'gemini-3.1-pro': 'google/gemini-3.1-pro',
  'gemini-3-flash': 'google/gemini-3-flash',
  'deepseek-v3.1': 'deepseek/deepseek-v3.1',
  'deepseek-v3.2': 'deepseek/deepseek-v3.2',
  'deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek-r1-0528': 'deepseek/deepseek-r1-0528',
  'mistral-medium-3': 'mistralai/mistral-medium-3',
  'codestral-25.01': 'mistralai/codestral',
  'qwen3-235b-a22b': 'qwen/qwen3-235b-a22b',
  'qwen3.5-397b': 'qwen/qwen3.5-397b',
  'kimi-k2': 'moonshotai/kimi-k2',
  'kimi-k2.5': 'moonshotai/kimi-k2.5',
  'minimax-m2.5': 'minimax/minimax-m2.5',
  'minimax-m2.7': 'minimax/minimax-m2.7',
  'grok-4': 'x-ai/grok-4',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',
}

export async function callModel(
  modelSlug: string,
  prompt: string,
): Promise<{ text: string; error?: string }> {
  const openRouterId = SLUG_TO_OPENROUTER[modelSlug]
  if (!openRouterId) {
    return { text: '', error: 'Model not available for comparison' }
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { text: '', error: 'OpenRouter API key is not configured' }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': baseUrl,
        'X-Title': 'Bearing',
      },
      body: JSON.stringify({
        model: openRouterId,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`OpenRouter error (${response.status}):`, body)
      return { text: '', error: `Model request failed (${response.status})` }
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''
    return { text }
  } catch (err) {
    console.error('OpenRouter call failed:', err)
    return {
      text: '',
      error: err instanceof Error ? err.message : 'Unknown error calling model',
    }
  }
}
