import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static') as string | null
if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary')

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const keys = [
  'hausa/week_16.wav',
  'yoruba/week_20.wav',
  'pidgin/week_16.wav',
  'english/week_16.wav',
  'igbo/week_16.wav',
  'emergency/ward4_cholera.wav',
]

for (const key of keys) {
  const source = join(root, 'custom_audio', key)
  const dest = join(root, 'audio', key)
  if (!existsSync(source)) {
    if (!existsSync(dest)) throw new Error(`Missing both custom and placeholder audio for ${key}`)
    console.log(`KEEP_PLACEHOLDER ${key}`)
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })
  const converted = spawnSync(
    ffmpegPath,
    ['-y', '-i', source, '-ac', '1', '-ar', '8000', '-sample_fmt', 's16', '-c:a', 'pcm_s16le', dest],
    { stdio: 'inherit' },
  )
  if (converted.status !== 0) throw new Error(`ffmpeg failed for ${key}`)
  assertTelephonyWav(dest)
  console.log(`CONVERTED ${key}`)
}

function assertTelephonyWav(path: string): void {
  const buf = readFileSync(path)
  const channels = buf.readUInt16LE(22)
  const rate = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || channels !== 1 || rate !== 8000 || bits !== 16) {
    throw new Error(`Expected 8kHz 16-bit mono WAV for ${path}`)
  }
}
