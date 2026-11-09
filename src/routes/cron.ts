import { Hono } from 'hono'
import { runWeeklyLessons } from '../lib/scheduler'
import type { Bindings } from '../types/env'

export const cronRoutes = new Hono<{ Bindings: Bindings }>()

cronRoutes.post('/run-weekly', async (c) => {
  try {
    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined
    const result = await runWeeklyLessons(c.env, phoneNumber, new URL(c.req.url).origin)
    return c.json(result)
  } catch (error) {
    console.error('Weekly cron failed', error)
    const message = error instanceof Error ? error.message : 'Weekly cron failed'
    return c.json({ error: message }, 500)
  }
})
