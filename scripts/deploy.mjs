import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = resolve(process.cwd(), '.env.cloudflare')
const text = readFileSync(envFile, 'utf8')

for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  if (key) process.env[key] = value
}

if (!process.env.NODE_OPTIONS?.includes('--use-system-ca')) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ')
}

const authFailure = /authentication|api key|api token|unauthorized|invalid request headers|10000|9106|9109/i

function runDeploy(env) {
  return new Promise((resolvePromise) => {
    const child = spawn('npx', ['wrangler', 'deploy'], {
      env,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      const textChunk = chunk.toString()
      output += textChunk
      process.stdout.write(textChunk)
    })
    child.stderr.on('data', (chunk) => {
      const textChunk = chunk.toString()
      output += textChunk
      process.stderr.write(textChunk)
    })
    child.on('exit', (code) => {
      resolvePromise({ code: code ?? 1, output })
    })
  })
}

const first = await runDeploy(process.env)
if (first.code === 0) process.exit(0)

const apiKey = process.env.CLOUDFLARE_API_KEY
if (!apiKey || !authFailure.test(first.output)) process.exit(first.code)

const tokenEnv = { ...process.env, CLOUDFLARE_API_TOKEN: apiKey }
delete tokenEnv.CLOUDFLARE_API_KEY
console.error('Global API key was rejected. Retrying once with CLOUDFLARE_API_TOKEN.')
const second = await runDeploy(tokenEnv)
process.exit(second.code)
