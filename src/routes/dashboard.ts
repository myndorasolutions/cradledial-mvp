import { Hono, type Context } from 'hono'
import { makeOutboundCall, type OutboundCallResponse } from '../lib/africastalking'
import { audioKey, workerAudioUrl } from '../lib/audio'
import { normalizeNigerianPhone } from '../lib/phone'
import { createSupabaseClient } from '../lib/supabase'
import type { Bindings, Mother } from '../types/env'
import { simulateCompletedWeeklyCall } from './voice'

const CHOLERA_KEY = 'emergency/ward4_cholera.wav'

type AppContext = Context<{ Bindings: Bindings }>
type Supabase = ReturnType<typeof createSupabaseClient>

export const dashboardRoutes = new Hono<{ Bindings: Bindings }>()

dashboardRoutes.get('/stats', async (c) => {
  try {
    return c.json(await loadStats(createSupabaseClient(c.env)))
  } catch (error) {
    console.error('Dashboard stats failed', error)
    const message = error instanceof Error ? error.message : 'Dashboard stats failed'
    return c.json({ error: message }, 500)
  }
})

dashboardRoutes.post('/broadcast', async (c) => {
  try {
    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
    if (!isAllowed(c, body.adminKey)) return c.json({ error: 'Unauthorized' }, 401)
    return c.json(await sendBroadcast(c.env, body, new URL(c.req.url).origin))
  } catch (error) {
    console.error('Emergency broadcast failed', error)
    const message = error instanceof Error ? error.message : 'Emergency broadcast failed'
    return c.json({ error: message }, 500)
  }
})

dashboardRoutes.post('/register-phone', async (c) => {
  try {
    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
    if (!isAllowed(c, body.adminKey)) return c.json({ error: 'Unauthorized' }, 401)
    return c.json(await registerStagePhone(c.env, body, new URL(c.req.url).origin))
  } catch (error) {
    console.error('Stage phone registration failed', error)
    if (error instanceof StageInputError) return c.json({ error: error.message }, 400)
    const message = error instanceof Error ? error.message : 'Stage phone registration failed'
    return c.json({ error: message }, 500)
  }
})

dashboardRoutes.post('/simulate-call-complete', async (c) => {
  try {
    const body = (await c.req.json<Record<string, unknown>>().catch(() => ({}))) as Record<string, unknown>
    if (!isAllowed(c, body.adminKey)) return c.json({ error: 'Unauthorized' }, 401)
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : ''
    if (!phoneNumber) return c.json({ error: 'phoneNumber is required' }, 400)
    return c.json(await simulateCompletedWeeklyCall(c.env, phoneNumber))
  } catch (error) {
    console.error('Call simulation failed', error)
    const message = error instanceof Error ? error.message : 'Call simulation failed'
    return c.json({ error: message }, 500)
  }
})

async function loadStats(supabase: Supabase) {
  const [
    mothersCount,
    tbasCount,
    completedCalls,
    payoutAmounts,
    broadcastCount,
    mothers,
    tbas,
    callLogs,
    airtimePayouts,
    emergencyBroadcasts,
  ] = await Promise.all([
    supabase.from('mothers').select('id', { count: 'exact', head: true }),
    supabase.from('tbas').select('id', { count: 'exact', head: true }),
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('call_type', 'weekly_ivr')
      .eq('status', 'completed'),
    supabase.from('airtime_payouts').select('amount_naira').eq('status', 'sent'),
    supabase.from('emergency_broadcasts').select('id', { count: 'exact', head: true }),
    supabase.from('mothers').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('tbas').select('*').order('total_onboarded', { ascending: false }),
    supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(15),
    supabase.from('airtime_payouts').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('emergency_broadcasts').select('*').order('created_at', { ascending: false }).limit(10),
  ])

  const firstError = [
    mothersCount.error,
    tbasCount.error,
    completedCalls.error,
    payoutAmounts.error,
    broadcastCount.error,
    mothers.error,
    tbas.error,
    callLogs.error,
    airtimePayouts.error,
    emergencyBroadcasts.error,
  ].find(Boolean)
  if (firstError) throw new Error(firstError.message)

  const tbaById = new Map((tbas.data ?? []).map((tba) => [tba.id, tba]))
  const motherById = new Map((mothers.data ?? []).map((mother) => [mother.id, mother]))

  return {
    totalMothers: mothersCount.count ?? 0,
    activeTbas: tbasCount.count ?? 0,
    completedIvrCalls: completedCalls.count ?? 0,
    totalAirtimeDisbursedNaira: (payoutAmounts.data ?? []).reduce(
      (sum, row) => sum + Number(row.amount_naira),
      0,
    ),
    totalEmergencyBroadcasts: broadcastCount.count ?? 0,
    mothers: (mothers.data ?? []).map((mother) => {
      const tba = mother.tba_id ? tbaById.get(mother.tba_id) : undefined
      return {
        ...mother,
        tba_full_name: tba?.full_name ?? null,
        tba_agent_code: tba?.agent_code ?? null,
      }
    }),
    tbas: tbas.data ?? [],
    callLogs: callLogs.data ?? [],
    airtimePayouts: (airtimePayouts.data ?? []).map((payout) => {
      const tba = payout.tba_id ? tbaById.get(payout.tba_id) : undefined
      const mother = payout.mother_id ? motherById.get(payout.mother_id) : undefined
      return {
        ...payout,
        tba_full_name: tba?.full_name ?? null,
        tba_agent_code: tba?.agent_code ?? null,
        mother_phone_number: mother?.phone_number ?? null,
      }
    }),
    emergencyBroadcasts: emergencyBroadcasts.data ?? [],
  }
}

async function sendBroadcast(env: Bindings, body: Record<string, unknown>, origin: string) {
  const supabase = createSupabaseClient(env)
  const requestedWard = typeof body.ward === 'string' && body.ward.trim() ? body.ward.trim() : 'Ward 4'
  const allWards = /^all wards$/i.test(requestedWard)
  const ward = allWards ? 'All Wards' : requestedWard.replace(/\s*\(.*\)$/, '').trim()
  const alertTitle =
    typeof body.alertTitle === 'string' && body.alertTitle.trim()
      ? body.alertTitle.trim()
      : 'Cholera Outbreak Alert - Boil Drinking Water'
  const audioUrl = workerAudioUrl(origin, CHOLERA_KEY)

  let query = supabase.from('mothers').select('*').eq('is_active', true)
  if (!allWards) query = query.eq('ward', ward)
  const { data: wardMothers, error } = await query
  if (error) throw new Error(error.message)

  const recipients = new Map<string, Mother | null>()
  for (const mother of wardMothers ?? []) recipients.set(mother.phone_number, mother)

  if (typeof body.targetPhone === 'string' && body.targetPhone.trim()) {
    const phone = normalizeNigerianPhone(body.targetPhone)
    if (!recipients.has(phone)) {
      const { data: extra, error: extraError } = await supabase
        .from('mothers')
        .select('*')
        .eq('phone_number', phone)
        .maybeSingle()
      if (extraError) throw new Error(extraError.message)
      recipients.set(phone, extra)
    }
  }

  const { data: broadcast, error: broadcastError } = await supabase
    .from('emergency_broadcasts')
    .insert({
      ward,
      alert_title: alertTitle,
      audio_url: audioUrl,
      recipients_count: recipients.size,
      triggered_by: 'Project 774 LGA Admin',
    })
    .select('*')
    .single()
  if (broadcastError || !broadcast) throw new Error(broadcastError?.message ?? 'Could not record the broadcast')

  const calls = []
  for (const [phone, mother] of recipients) {
    const { data: callLog, error: logError } = await supabase
      .from('call_logs')
      .insert({
        phone_number: phone,
        mother_id: mother?.id ?? null,
        call_type: 'emergency_broadcast',
        language: mother?.language ?? 'english',
        gestation_week: mother?.gestation_week ?? null,
        audio_url: audioUrl,
        status: 'queued',
        duration_seconds: 0,
        counted_toward_commission: false,
      })
      .select('*')
      .single()
    if (logError) throw new Error(logError.message)

    let africastalking: OutboundCallResponse | null = null
    let callError: string | null = null
    let savedLog = callLog
    try {
      africastalking = await makeOutboundCall(env, phone)
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
    } catch (callFailure) {
      callError = callFailure instanceof Error ? callFailure.message : 'Africa\'s Talking call failed'
      console.error('Emergency call failed', callError)
    }
    calls.push({ phoneNumber: phone, callLog: savedLog, africastalking, error: callError })
  }

  return { dispatched: calls.length, broadcast, calls }
}

const STAGE_LANGUAGES = new Set(['english', 'pidgin', 'hausa', 'yoruba', 'igbo'])

class StageInputError extends Error {}

async function registerStagePhone(env: Bindings, body: Record<string, unknown>, origin: string) {
  const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
  if (!rawPhone) throw new StageInputError('phoneNumber is required')

  let phone: string
  try {
    phone = normalizeNigerianPhone(rawPhone)
  } catch {
    throw new StageInputError('Invalid phone number. Enter a Nigerian number like 08031234567.')
  }

  const language = typeof body.language === 'string' ? body.language.trim().toLowerCase() : ''
  if (!STAGE_LANGUAGES.has(language)) {
    throw new StageInputError('Invalid language. Choose english, pidgin, hausa, yoruba, or igbo.')
  }

  const pregnancyMonth = Number(body.pregnancyMonth)
  if (!Number.isInteger(pregnancyMonth) || pregnancyMonth < 1 || pregnancyMonth > 9) {
    throw new StageInputError('Invalid month. Enter a number between 1 and 9.')
  }
  const gestationWeek = pregnancyMonth * 4
  const tbaCode = typeof body.tbaCode === 'string' ? body.tbaCode.trim() : ''
  const triggerCallNow = body.triggerCallNow === true
  const supabase = createSupabaseClient(env)

  let tbaId: string | null = null
  let tbaOnboarded = 0
  if (tbaCode) {
    const { data: tba, error } = await supabase.from('tbas').select('*').eq('agent_code', tbaCode).maybeSingle()
    if (error) throw new Error(error.message)
    if (!tba) throw new StageInputError('Invalid TBA Agent Code.')
    tbaId = tba.id
    tbaOnboarded = Number(tba.total_onboarded)
  }

  const { data: existing, error: selectError } = await supabase
    .from('mothers')
    .select('*')
    .eq('phone_number', phone)
    .maybeSingle()
  if (selectError) throw new Error(selectError.message)

  const fields = {
    language,
    pregnancy_month: pregnancyMonth,
    gestation_week: gestationWeek,
    ward: 'Ward 4',
    is_active: true,
    tba_id: tbaId,
  }

  let mother: Mother
  if (existing) {
    const { data, error } = await supabase.from('mothers').update(fields).eq('id', existing.id).select('*').single()
    if (error || !data) throw new Error(error?.message ?? 'Could not update the mother')
    mother = data
  } else {
    const { data, error } = await supabase
      .from('mothers')
      .insert({ phone_number: phone, ...fields })
      .select('*')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Could not register the mother')
    mother = data
  }

  if (tbaId && existing?.tba_id !== tbaId) {
    const { error } = await supabase
      .from('tbas')
      .update({ total_onboarded: tbaOnboarded + 1 })
      .eq('id', tbaId)
    if (error) throw new Error(error.message)
  }

  if (!triggerCallNow) return { mother, callLog: null, africastalking: null }

  const audioUrl = workerAudioUrl(origin, audioKey(language, gestationWeek))
  const { data: callLog, error: logError } = await supabase
    .from('call_logs')
    .insert({
      phone_number: phone,
      mother_id: mother.id,
      call_type: 'weekly_ivr',
      language,
      gestation_week: gestationWeek,
      audio_url: audioUrl,
      status: 'queued',
      duration_seconds: 0,
      counted_toward_commission: false,
    })
    .select('*')
    .single()
  if (logError || !callLog) throw new Error(logError?.message ?? 'Could not queue the call')

  let africastalking: OutboundCallResponse | null = null
  let savedLog = callLog
  try {
    africastalking = await makeOutboundCall(env, phone)
    if (africastalking.simulatedInSandbox) {
      const { data: ringing, error: ringError } = await supabase
        .from('call_logs')
        .update({ status: 'ringing' })
        .eq('id', callLog.id)
        .select('*')
        .single()
      if (ringError || !ringing) throw new Error(ringError?.message ?? 'Could not mark the call as ringing')
      savedLog = ringing
    }
  } catch (error) {
    console.error('Stage outbound call failed', error)
  }

  return { mother, callLog: savedLog, africastalking }
}

function isAllowed(c: AppContext, adminKey: unknown): boolean {
  if (adminKey === c.env.ADMIN_DEMO_KEY) return true
  if (adminKey !== undefined && adminKey !== null && adminKey !== '') return false
  const host = c.req.header('host') ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}
