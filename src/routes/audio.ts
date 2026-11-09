import { Hono } from 'hono'
import type { Bindings } from '../types/env'

export const audioRoutes = new Hono<{ Bindings: Bindings }>()

audioRoutes.post('/seed', async (c) => {
  if (!isAllowed(c)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.parseBody({ all: true })
  const uploaded: string[] = []

  for (const [field, value] of Object.entries(body)) {
    const files = Array.isArray(value) ? value : [value]
    for (const file of files) {
      if (!(file instanceof File)) continue
      const key = objectKey(field, file.name)
      if (!key) continue
      await c.env.AUDIO_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: 'audio/wav' },
      })
      uploaded.push(key)
    }
  }

  return c.json({ uploaded })
})

function isAllowed(c: { req: { header: (name: string) => string | undefined }; env: Bindings }): boolean {
  const host = c.req.header('host') ?? ''
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true
  return c.req.header('x-admin-key') === c.env.ADMIN_DEMO_KEY
}

function objectKey(field: string, fileName: string): string | null {
  const raw = (field.endsWith('.wav') ? field : fileName).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!raw.endsWith('.wav') || raw.includes('..')) return null
  return raw
}
