import { makeOutboundCall, type OutboundCallResponse } from './africastalking'
import { audioKey, workerAudioUrl } from './audio'
import { normalizeNigerianPhone } from './phone'
import { createSupabaseClient } from './supabase'
import type { Bindings, CallLog, Mother } from '../types/env'

export interface WeeklyLessonResult {
  phoneNumber: string
  gestationWeek: number
  graduated: boolean
  callLog: CallLog | null
  africastalking: unknown
  error: string | null
}

export async function runWeeklyLessons(
  env: Bindings,
  phoneNumber?: string,
  origin?: string,
): Promise<{ lessons: WeeklyLessonResult[] }> {
  const supabase = createSupabaseClient(env)
  let query = supabase.from('mothers').select('*').eq('is_active', true)
  if (phoneNumber) {
    query = query.eq('phone_number', normalizeNigerianPhone(phoneNumber))
  }
  const { data: mothers, error } = await query
  if (error) throw new Error(error.message)

  const lessons: WeeklyLessonResult[] = []
  for (const mother of mothers ?? []) {
    lessons.push(await advanceMother(env, supabase, mother, origin))
  }
  return { lessons }
}

async function advanceMother(
  env: Bindings,
  supabase: ReturnType<typeof createSupabaseClient>,
  mother: Mother,
  origin?: string,
): Promise<WeeklyLessonResult> {
  const nextWeek = Number(mother.gestation_week) + 1
  if (nextWeek >= 42) {
    const { error } = await supabase
      .from('mothers')
      .update({ gestation_week: nextWeek, is_active: false })
      .eq('id', mother.id)
    if (error) throw new Error(error.message)
    return {
      phoneNumber: mother.phone_number,
      gestationWeek: nextWeek,
      graduated: true,
      callLog: null,
      africastalking: null,
      error: null,
    }
  }

  const pregnancyMonth = Math.min(9, Math.ceil(nextWeek / 4))
  const { error: updateError } = await supabase
    .from('mothers')
    .update({ gestation_week: nextWeek, pregnancy_month: pregnancyMonth })
    .eq('id', mother.id)
  if (updateError) throw new Error(updateError.message)

  const key = audioKey(mother.language, nextWeek)
  const audioUrl = origin ? workerAudioUrl(origin, key) : `/audio/${key}`
  const { data: callLog, error: insertError } = await supabase
    .from('call_logs')
    .insert({
      phone_number: mother.phone_number,
      mother_id: mother.id,
      call_type: 'weekly_ivr',
      language: mother.language,
      gestation_week: nextWeek,
      audio_url: audioUrl,
      status: 'queued',
      duration_seconds: 0,
      counted_toward_commission: false,
    })
    .select('*')
    .single()
  if (insertError || !callLog) throw new Error(insertError?.message ?? 'Could not queue the weekly call')

  let africastalking: OutboundCallResponse | null = null
  let callError: string | null = null
  let savedLog = callLog
  try {
    africastalking = await makeOutboundCall(env, mother.phone_number)
    if (africastalking.simulatedInSandbox) {
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
    console.error('Weekly outbound call failed', callError)
  }

  return {
    phoneNumber: mother.phone_number,
    gestationWeek: nextWeek,
    graduated: false,
    callLog: savedLog,
    africastalking,
    error: callError,
  }
}
