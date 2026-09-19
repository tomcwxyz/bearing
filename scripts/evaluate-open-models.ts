/**
 * Opt-in live smoke test for open models.
 *
 * Examples:
 *   OPEN_MODEL_PROVIDER=ollama OPEN_MODEL_MODELS=qwen3.5:397b OLLAMA_API_KEY=... npm run eval:open-models
 *   OPEN_MODEL_PROVIDER=huggingface OPEN_MODEL_MODELS=Qwen/Qwen3.5-27B HF_TOKEN=... npm run eval:open-models
 *
 * This intentionally does not write to the Bearing database. It is a probe for
 * execution/routability and basic latency evidence, not a quality benchmark.
 */

const CASES = [
  {
    id: 'summarise',
    prompt: 'Summarise this in three bullet points: A small charity has rising demand, flat income, two vacant posts and a six-month unrestricted cash runway.',
  },
  {
    id: 'extract',
    prompt: 'Return JSON only with fields name, amount, due_date from: "Invoice from North Star Ltd for £1,240.50, due 30 September 2026."',
  },
  {
    id: 'code',
    prompt: 'Write a TypeScript function that groups an array of objects by a string key. Keep it dependency-free and include one example.',
  },
  {
    id: 'reasoning',
    prompt: 'A team can either automate a 10-minute task done 12 times per week or a 2-hour task done once per month. Explain which is the better automation candidate and what information could change the answer.',
  },
]

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function runOllama(model: string, prompt: string) {
  const token = required('OLLAMA_API_KEY')
  const started = performance.now()
  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  })
  const elapsedMs = Math.round(performance.now() - started)
  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`)
  }
  const payload = await response.json() as {
    message?: { content?: string }
    eval_count?: number
    eval_duration?: number
  }
  return {
    elapsedMs,
    output: payload.message?.content ?? '',
    outputTokens: payload.eval_count,
    tokensPerSecond:
      payload.eval_count && payload.eval_duration
        ? payload.eval_count / (payload.eval_duration / 1_000_000_000)
        : undefined,
  }
}

async function runHuggingFace(model: string, prompt: string) {
  const token = required('HF_TOKEN')
  const started = performance.now()
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
    }),
  })
  const elapsedMs = Math.round(performance.now() - started)
  if (!response.ok) {
    throw new Error(`Hugging Face HTTP ${response.status}: ${await response.text()}`)
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { completion_tokens?: number }
  }
  return {
    elapsedMs,
    output: payload.choices?.[0]?.message?.content ?? '',
    outputTokens: payload.usage?.completion_tokens,
    tokensPerSecond: undefined,
  }
}

async function main() {
  const provider = process.env.OPEN_MODEL_PROVIDER ?? 'ollama'
  const models = required('OPEN_MODEL_MODELS')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  if (provider !== 'ollama' && provider !== 'huggingface') {
    throw new Error('OPEN_MODEL_PROVIDER must be "ollama" or "huggingface"')
  }

  console.log(`Open-model execution probe via ${provider}`)
  console.log(`Models: ${models.join(', ')}`)
  console.log('Results are observational and are not written into production ranking.\n')

  for (const model of models) {
    console.log(`## ${model}`)
    for (const testCase of CASES) {
      try {
        const result = provider === 'ollama'
          ? await runOllama(model, testCase.prompt)
          : await runHuggingFace(model, testCase.prompt)
        console.log(JSON.stringify({
          case: testCase.id,
          ok: true,
          elapsed_ms: result.elapsedMs,
          output_tokens: result.outputTokens ?? null,
          tokens_per_second: result.tokensPerSecond
            ? Math.round(result.tokensPerSecond * 10) / 10
            : null,
          output_preview: result.output.slice(0, 160).replace(/\s+/g, ' '),
        }))
      } catch (error) {
        console.log(JSON.stringify({
          case: testCase.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    }
    console.log('')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
