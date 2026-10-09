import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit empty values win over any .env.local file when Next starts.
// The contributor experience never needs maintained DB or provider keys.
const environment = {
  ...process.env,
  BEARING_CONTRIBUTOR_DEMO: '1',
  NEON_DATABASE_URL: '',
  ANTHROPIC_API_KEY: '',
  OPENROUTER_API_KEY: '',
  OPENAI_API_KEY: '',
  MISTRAL_API_KEY: '',
  GEMINI_API_KEY: '',
  RESEND_API_KEY: '',
  OLLAMA_API_KEY: '',
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
