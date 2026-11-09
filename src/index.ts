import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { runWeeklyLessons } from './lib/scheduler'
import type { Bindings } from './types/env'
import { audioRoutes } from './routes/audio'
import { cronRoutes } from './routes/cron'
import { dashboardRoutes } from './routes/dashboard'
import { dashboardPage } from './routes/dashboard-page'
import { ussdRoutes } from './routes/ussd'
import { callRoutes, voiceRoutes } from './routes/voice'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    service: 'CradleDial',
    status: 'ok',
    runtime: 'cloudflare-workers',
  })
})

app.route('/webhooks/ussd', ussdRoutes)

app.route('/webhooks/voice', voiceRoutes)
app.route('/api/audio', audioRoutes)
app.route('/api/calls', callRoutes)
app.route('/api/cron', cronRoutes)
app.route('/api/dashboard', dashboardRoutes)

app.get('/audio/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/audio\//, ''))
  if (!key || key.includes('..') || key.includes('\\')) return c.text('Not found', 404)
  const object = await c.env.AUDIO_BUCKET.get(key)
  if (!object) return c.text('Not found', 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'audio/wav',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

app.get('/dashboard', (c) => {
  return c.html(dashboardPage('/audio/emergency/ward4_cholera.wav'))
})

const handler: ExportedHandler<Bindings> = {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      runWeeklyLessons(env).catch((error: unknown) => {
        console.error('Scheduled weekly lessons failed', error)
      }),
    )
  },
}

export default handler
