import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LESSONS } from '../src/lib/audio.ts'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const speakScript = join(tmpdir(), 'cradledial-speak-wav.ps1')

const SPEAK_PS1 = `
param(
  [Parameter(Mandatory=$true)][string]$OutPath,
  [Parameter(Mandatory=$true)][string]$TextPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Zira Desktop')
$synth.SetOutputToWaveFile($OutPath)
$text = [System.IO.File]::ReadAllText($TextPath, [System.Text.UTF8Encoding]::new($false))
$synth.Speak($text)
$synth.Dispose()
`

writeFileSync(speakScript, SPEAK_PS1, 'utf8')

let uploadFailures = 0
let skipRemoteUpload = false

for (const lesson of LESSONS) {
  const wavPath = join(root, 'audio', lesson.key)
  const textPath = `${wavPath}.txt`
  mkdirSync(dirname(wavPath), { recursive: true })
  writeFileSync(textPath, lesson.script, 'utf8')

  const spokenPath = `${wavPath}.spoken.wav`
  const spoken = spawnSync(
    'powershell',
    ['-NoProfile', '-File', speakScript, '-OutPath', spokenPath, '-TextPath', textPath],
    { stdio: 'inherit' },
  )
  rmSync(textPath, { force: true })
  if (spoken.status !== 0) {
    throw new Error(`Speech synthesis failed for ${lesson.key}`)
  }

  writeTelephonyWav(wavPath, readSpokenSamples(spokenPath))
  rmSync(spokenPath, { force: true })
  assertTelephonyWav(wavPath)
  console.log(`WAV_OK ${lesson.key}`)

  if (skipRemoteUpload) continue

  const uploaded = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `cradledial-audio/${lesson.key}`,
      `--file=${wavPath}`,
      '--content-type=audio/wav',
      '--remote',
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, CI: '1' },
    },
  )
  if (uploaded.status !== 0) {
    uploadFailures += 1
    skipRemoteUpload = true
    console.error(`UPLOAD_FAILED ${lesson.key}`)
  } else {
    console.log(`UPLOAD_OK ${lesson.key}`)
  }
}

if (uploadFailures > 0) {
  console.error(`UPLOAD_FAILED_COUNT ${uploadFailures}`)
  process.exitCode = 2
}

function readSpokenSamples(path: string): Int16Array {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Speech output was not a WAV: ${path}`)
  }

  let offset = 12
  let channels = 1
  let rate = 22050
  let bits = 16
  let audioFormat = 1
  let data: Buffer | null = null

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ') {
      audioFormat = buf.readUInt16LE(start)
      channels = buf.readUInt16LE(start + 2)
      rate = buf.readUInt32LE(start + 4)
      bits = buf.readUInt16LE(start + 14)
    } else if (id === 'data') {
      data = buf.subarray(start, start + size)
    }
    offset = start + size + (size % 2)
  }

  if (!data || audioFormat !== 1 || bits !== 16) {
    throw new Error(`Unsupported speech WAV ${audioFormat}/${bits}-bit for ${path}`)
  }

  const frames = Math.floor(data.length / (2 * channels))
  const mono = new Array<number>(frames)
  for (let i = 0; i < frames; i += 1) {
    let sum = 0
    for (let channel = 0; channel < channels; channel += 1) {
      sum += data.readInt16LE((i * channels + channel) * 2)
    }
    mono[i] = sum / channels
  }

  return resampleTo8k(mono, rate)
}

function resampleTo8k(samples: number[], sourceRate: number): Int16Array {
  const targetRate = 8000
  if (samples.length === 0) return new Int16Array()
  const outLength = Math.max(1, Math.round((samples.length * targetRate) / sourceRate))
  const out = new Int16Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const position = (i * sourceRate) / targetRate
    const left = Math.floor(position)
    const right = Math.min(left + 1, samples.length - 1)
    const fraction = position - left
    const leftSample = samples[left] ?? 0
    const rightSample = samples[right] ?? leftSample
    const value = leftSample * (1 - fraction) + rightSample * fraction
    out[i] = Math.max(-32768, Math.min(32767, Math.round(value)))
  }
  return out
}

function writeTelephonyWav(path: string, samples: Int16Array): void {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(8000, 24)
  buf.writeUInt32LE(16000, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i += 1) {
    buf.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  }
  writeFileSync(path, buf)
}

function assertTelephonyWav(path: string): void {
  const buf = readFileSync(path)
  const riff = buf.toString('ascii', 0, 4)
  const wave = buf.toString('ascii', 8, 12)
  const channels = buf.readUInt16LE(22)
  const rate = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  if (riff !== 'RIFF' || wave !== 'WAVE' || channels !== 1 || rate !== 8000 || bits !== 16) {
    throw new Error(
      `Expected 8kHz 16-bit mono WAV for ${path}, got ${riff}/${wave} ${rate}Hz ${bits}-bit ${channels}ch`,
    )
  }
}
