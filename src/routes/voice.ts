import { Hono, type Context } from 'hono'
import { makeOutboundCall, sendAirtime, type OutboundCallResponse } from '../lib/africastalking'
import { audioKey, lessonScript, playbackUrl, workerAudioUrl } from '../lib/audio'
import { normalizeNigerianPhone } from '../lib/phone'
import { createSupabaseClient } from '../lib/supabase'
import type { Bindings, CallLog, Mother } from '../types/env'

const XML_TYPE = 'application/xml; charset=utf-8'
const EMPTY_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<Response/>`

type AppContext = Context<{ Bindings: Bindings }>
type Supabase = ReturnType<typeof createSupabaseClient>

export const voiceRoutes = new Hono<{ Bindings: Bindings }>()
export const callRoutes = new Hono<{ Bindings: Bindings }>()

voiceRoutes.post('/', (c) => handleVoice(c))
voiceRoutes.post('/*', (c) => handleVoice(c))

callRoutes.post('/trigger-weekly', async (c) => {
  try {
    return await triggerWeekly(c)
  } catch (error) {
    console.error('Weekly call trigger failed', error)
    const message = error instanceof Error ? error.message : 'Weekly call trigger failed'
    return c.json({ error: message }, 500)
  }
})

async function handleVoice(c: AppContext): Promise<Response> {
  try {
    const payload = await readPayload(c)
    const active = payload.isActive === '1'
    const ended = payload.isActive === '0'
    if (!active && !ended) return xml(c, EMPTY_RESPONSE)

    const supabase = createSupabaseClient(c.env)
    const mother = await findMother(supabase, c.env, payload)

    if (active) return await answerCall(c, supabase, payload, mother)
    return await finishCall(c, supabase, payload, mother)
  } catch (error) {
    console.error('Voice webhook failed', error)
    return xml(c, EMPTY_RESPONSE)
  }
}

async function answerCall(
  c: AppContext,
  supabase: Supabase,
  payload: Record<string, string>,
  mother: Mother | null,
): Promise<Response> {
  if (!mother) {
    return xml(
      c,
      voiceXml(null, 'Hello from CradleDial. We could not find your registration.'),
    )
  }

  const key = audioKey(mother.language, mother.gestation_week)
  const existing = await latestOpenCall(supabase, mother.phone_number)
  const audioUrl = playbackUrl(c.req.url, existing?.audio_url || key)
  const script = lessonScript(keyFromUrl(audioUrl))

  if (existing) {
    const { error } = await supabase
      .from('call_logs')
      .update({
        at_session_id: payload.sessionId || existing.at_session_id,
        status: 'ringing',
        audio_url: audioUrl,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('call_logs').insert({
      phone_number: mother.phone_number,
      mother_id: mother.id,
      call_type: 'weekly_ivr',
      language: mother.language,
      gestation_week: mother.gestation_week,
      audio_url: audioUrl,
      status: 'ringing',
      at_session_id: payload.sessionId || null,
      duration_seconds: 0,
      counted_toward_commission: false,
    })
    if (error) throw new Error(error.message)
  }

  return xml(c, voiceXml(audioUrl, script))
}

async function finishCall(
  c: AppContext,
  supabase: Supabase,
  payload: Record<string, string>,
  mother: Mother | null,
): Promise<Response> {
  const durationSeconds = parseDuration(payload.durationInSeconds)
  const sessionId = payload.sessionId || ''
  let log = sessionId ? await callBySession(supabase, sessionId) : null

  if (!log && mother) {
    log = await latestOpenCall(supabase, mother.phone_number)
  }

  if (!log && mother) {
    log = await insertCompletedCall(supabase, c.env, mother, sessionId, durationSeconds)
  } else if (log) {
    const { error } = await supabase
      .from('call_logs')
      .update({
        status: 'completed',
        duration_seconds: durationSeconds,
        at_session_id: sessionId || log.at_session_id,
      })
      .eq('id', log.id)
    if (error) throw new Error(error.message)
  }

  if (log && mother && log.call_type === 'weekly_ivr' && durationSeconds >= 15) {
    await countWeeklyCall(c.env, supabase, log, mother)
  }

  return xml(c, EMPTY_RESPONSE)
}

async function countWeeklyCall(
  env: Bindings,
  supabase: Supabase,
  log: CallLog,
  mother: Mother,
): Promise<void> {
  let completedWeeks = Number(mother.completed_ivr_weeks)
  if (!log.counted_toward_commission) {
    const { data: marked, error: markError } = await supabase
      .from('call_logs')
      .update({ counted_toward_commission: true })
      .eq('id', log.id)
      .eq('counted_toward_commission', false)
      .select('id')
    if (markError) throw new Error(markError.message)
    if (marked && marked.length > 0) {
      completedWeeks += 1
      const { error: weekError } = await supabase
        .from('mothers')
        .update({ completed_ivr_weeks: completedWeeks })
        .eq('id', mother.id)
      if (weekError) throw new Error(weekError.message)
    }
  }

  if (completedWeeks < 3 || !mother.tba_id || mother.tba_commission_paid) return

  const { data: tba, error: tbaError } = await supabase
    .from('tbas')
    .select('*')
    .eq('id', mother.tba_id)
    .maybeSingle()
  if (tbaError) throw new Error(tbaError.message)
  if (!tba) return

  const airtime = await sendAirtime(env, tba.phone_number, 50)
  const recipient = airtime.responses?.[0]
  const sent = (airtime.numSent ?? 0) >= 1 || recipient?.status === 'Sent'
  if (!sent) {
    console.error('Airtime payout was not sent', airtime.errorMessage || 'unknown airtime error')
    return
  }

  const { error: payoutError } = await supabase.from('airtime_payouts').insert({
    tba_id: tba.id,
    mother_id: mother.id,
    amount_naira: 50,
    status: 'sent',
    at_transaction_id: recipient?.requestId || null,
  })
  if (payoutError) throw new Error(payoutError.message)

  const { error: paidError } = await supabase
    .from('mothers')
    .update({ tba_commission_paid: true })
    .eq('id', mother.id)
  if (paidError) throw new Error(paidError.message)

  const { error: commissionError } = await supabase
    .from('tbas')
    .update({ total_commission_earned: Number(tba.total_commission_earned) + 50 })
    .eq('id', tba.id)
  if (commissionError) throw new Error(commissionError.message)
}

export async function simulateCompletedWeeklyCall(env: Bindings, phoneNumber: string) {
  const phone = normalizeNigerianPhone(phoneNumber)
  const supabase = createSupabaseClient(env)
  const { data: mother, error } = await supabase.from('mothers').select('*').eq('phone_number', phone).maybeSingle()
  if (error) throw new Error(error.message)
  if (!mother) throw new Error('Mother not found')

  const audioUrl = `/audio/${audioKey(mother.language, mother.gestation_week)}`
  const { data: callLog, error: insertError } = await supabase
    .from('call_logs')
    .insert({
      phone_number: mother.phone_number,
      mother_id: mother.id,
      call_type: 'weekly_ivr',
      language: mother.language,
      gestation_week: mother.gestation_week,
      audio_url: audioUrl,
      status: 'completed',
      at_session_id: `sim-${crypto.randomUUID()}`,
      duration_seconds: 25,
      counted_toward_commission: false,
    })
    .select('*')
    .single()
  if (insertError || !callLog) throw new Error(insertError?.message ?? 'Could not record the lesson')

  await countWeeklyCall(env, supabase, callLog, mother)
  const { data: updatedLog, error: logRefreshError } = await supabase
    .from('call_logs')
    .select('*')
    .eq('id', callLog.id)
    .maybeSingle()
  if (logRefreshError) throw new Error(logRefreshError.message)
  const { data: updated, error: refreshError } = await supabase
    .from('mothers')
    .select('phone_number,completed_ivr_weeks,tba_commission_paid')
    .eq('id', mother.id)
    .maybeSingle()
  if (refreshError) throw new Error(refreshError.message)
  return { callLog: updatedLog ?? callLog, mother: updated }
}

async function triggerWeekly(c: AppContext): Promise<Response> {
  const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
  const requested = typeof body.phoneNumber === 'string' ? body.phoneNumber : ''
  const phone = requested ? normalizeNigerianPhone(requested) : null
  const supabase = createSupabaseClient(c.env)

  let query = supabase.from('mothers').select('*').eq('is_active', true)
  if (phone) query = query.eq('phone_number', phone)
  const { data: mothers, error } = await query
  if (error) throw new Error(error.message)

  const calls = []
  for (const mother of mothers ?? []) {
    const key = audioKey(mother.language, mother.gestation_week)
    const audioUrl = workerAudioUrl(new URL(c.req.url).origin, key)
    const { data: callLog, error: insertError } = await supabase
      .from('call_logs')
      .insert({
        phone_number: mother.phone_number,
        mother_id: mother.id,
        call_type: 'weekly_ivr',
        language: mother.language,
        gestation_week: mother.gestation_week,
        audio_url: audioUrl,
        status: 'queued',
        duration_seconds: 0,
        counted_toward_commission: false,
      })
      .select('*')
      .single()
    if (insertError) throw new Error(insertError.message)

    let africastalking: OutboundCallResponse | null = null
    let callError: string | null = null
    let savedLog = callLog
    try {
      africastalking = await makeOutboundCall(c.env, mother.phone_number)
      if (africastalking.simulatedInSandbox && callLog) {
        const { data: ringing, error: ringError } = await supabase
          .from('call_logs')
          .update({ status: 'ringing' })
          .eq('id', callLog.id)
          .select('*')
          .single()
        if (ringError) throw new Error(ringError.message)
        savedLog = ringing
      }
    } catch (error) {
      callError = error instanceof Error ? error.message : 'Africa\'s Talking call failed'
      console.error('Outbound call failed', callError)
    }
    calls.push({ callLog: savedLog, africastalking, error: callError })
  }

  return c.json({ calls })
}

async function findMother(
  supabase: Supabase,
  env: Bindings,
  payload: Record<string, string>,
): Promise<Mother | null> {
  const seen = new Set<string>()
  for (const raw of [payload.destinationNumber, payload.callerNumber]) {
    if (!raw) continue
    let phone: string
    try {
      phone = normalizeNigerianPhone(raw)
    } catch {
      continue
    }
    if (phone === env.AT_CALLER_ID || seen.has(phone)) continue
    seen.add(phone)
    const { data, error } = await supabase.from('mothers').select('*').eq('phone_number', phone).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) return data
  }
  return null
}

async function latestOpenCall(supabase: Supabase, phone: string): Promise<CallLog | null> {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('phone_number', phone)
    .in('status', ['queued', 'ringing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function callBySession(supabase: Supabase, sessionId: string): Promise<CallLog | null> {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('at_session_id', sessionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function insertCompletedCall(
  supabase: Supabase,
  env: Bindings,
  mother: Mother,
  sessionId: string,
  durationSeconds: number,
): Promise<CallLog> {
  const key = audioKey(mother.language, mother.gestation_week)
  const { data, error } = await supabase
    .from('call_logs')
    .insert({
      phone_number: mother.phone_number,
      mother_id: mother.id,
      call_type: 'weekly_ivr',
      language: mother.language,
      gestation_week: mother.gestation_week,
      audio_url: `/audio/${key}`,
      status: 'completed',
      at_session_id: sessionId || null,
      duration_seconds: durationSeconds,
      counted_toward_commission: false,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function readPayload(c: AppContext): Promise<Record<string, string>> {
  const body = await c.req.parseBody()
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') payload[key] = value
  }
  return payload
}

function parseDuration(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '0', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function keyFromUrl(url: string): string {
  const parts = url.split('/')
  return parts.slice(-2).join('/')
}

function voiceXml(audioUrl: string | null, script: string): string {
  const play = audioUrl ? `  <Play url="${escapeXml(audioUrl)}"/>\n` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${play}  <Say voice="woman">${escapeXml(script)}</Say>
</Response>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xml(c: AppContext, body: string): Response {
  return c.body(body, 200, { 'Content-Type': XML_TYPE })
}
