import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit environment values win over .env.local when Next starts.
// Do not use or expose maintained credentials during local exploration.
const environment = {
  ...process.env,
  NODE_ENV: 'development',
  BEARING_CONTRIBUTOR_DEMO: '1',
  NEON_DATABASE_URL: '',
  ANTHROPIC_API_KEY: '',
  OPENROUTER_API_KEY: '',
  OPENAI_API_KEY: '',
  MISTRAL_API_KEY: '',
  GEMINI_API_KEY: '',
  RESEND_API_KEY: '',
  OLLAMA_API_KEY: '',
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: '',
  AUTH_SECRET: 'bearing-contributor-demo-development-only-secret',
}
const nextCli = resolve(dirname(fileURLToPath(import.meta.url)), '../node_modules/next/dist/bin/next')
const child = spawn(process.execPath, [nextCli, 'dev', ...process.argv.slice(2)], {
  env: environment,
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('error', error => {
  console.error('Could not start the workbench:', error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0)
})
