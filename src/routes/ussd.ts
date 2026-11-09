import { Hono, type Context } from 'hono'
import type { Bindings, Json, Tba } from '../types/env'
import { createSupabaseClient } from '../lib/supabase'
import { normalizeNigerianPhone } from '../lib/phone'

const TEXT_PLAIN = 'text/plain; charset=utf-8'
const SAVE_FAILED = 'END CradleDial could not save your details. Please dial again.'
const INVALID_PHONE =
  'END Invalid phone number. Please dial again and enter a Nigerian number like 08031234567.'
const INVALID_MONTH = 'END Invalid month. Please dial again and enter a number between 1 and 9.'
const INVALID_AGENT = 'END Invalid TBA Agent Code.'
const INVALID_LANGUAGE = 'END Invalid language. Please dial again and choose 1 to 5.'
const INVALID_OPTION = 'END Invalid option. Please dial again.'

const LANGUAGES: Record<string, { code: string; name: string }> = {
  '1': { code: 'english', name: 'English' },
  '2': { code: 'pidgin', name: 'Pidgin' },
  '3': { code: 'hausa', name: 'Hausa' },
  '4': { code: 'yoruba', name: 'Yoruba' },
  '5': { code: 'igbo', name: 'Igbo' },
}

const LANGUAGE_MENU = `CON Welcome to CradleDial
Select Language:
1. English
2. Pidgin
3. Hausa
4. Yoruba
5. Igbo
6. TBA Agent Portal`

const MOTHER_LANGUAGE_MENU = `CON Select Mother's Language:
1. English
2. Pidgin
3. Hausa
4. Yoruba
5. Igbo`

type AppContext = Context<{ Bindings: Bindings }>
type Supabase = ReturnType<typeof createSupabaseClient>

export const ussdRoutes = new Hono<{ Bindings: Bindings }>()

ussdRoutes.post('/', async (c) => {
  try {
    return await handleUssd(c)
  } catch (error) {
    console.error('USSD handler failed', error)
    return reply(c, SAVE_FAILED)
  }
})

async function handleUssd(c: AppContext): Promise<Response> {
  const payload = await readPayload(c)
  const sessionId = payload.sessionId?.trim() ?? ''
  const serviceCode = payload.serviceCode?.trim() || '*347*12#'
  const rawPhone = payload.phoneNumber?.trim() ?? ''
  const text = (payload.text ?? '').trim()

  if (!sessionId) {
    return reply(c, SAVE_FAILED)
  }

  let callerPhone: string
  try {
    callerPhone = normalizeNigerianPhone(rawPhone)
  } catch {
    return reply(c, INVALID_PHONE)
  }

  const agentFromCode = agentCodeFromServiceCode(serviceCode)
  let parts = text === '' ? [] : text.split('*')
  if (agentFromCode && parts[0] !== agentFromCode) {
    parts = [agentFromCode, ...parts]
  }

  const supabase = createSupabaseClient(c.env)
  const session = {
    c,
    supabase,
    sessionId,
    serviceCode,
    callerPhone,
    text,
    parts,
  }

  if (parts.length === 0) {
    return finish(session, 'language_menu', { text, parts }, LANGUAGE_MENU)
  }

  const first = parts[0] ?? ''
  if (LANGUAGES[first]) {
    return handleMotherRegistration(session)
  }
  if (first === '6') {
    return handleTbaPortal(session)
  }
  if (/^\d{3,}$/.test(first)) {
    return onboardMother(session, first, parts.slice(1), 'direct')
  }

  return finish(session, 'invalid_option', { text, parts }, INVALID_OPTION)
}

interface SessionContext {
  c: AppContext
  supabase: Supabase
  sessionId: string
  serviceCode: string
  callerPhone: string
  text: string
  parts: string[]
}

async function handleMotherRegistration(session: SessionContext): Promise<Response> {
  const languageChoice = session.parts[0] ?? ''
  const language = LANGUAGES[languageChoice]
  if (!language) {
    return finish(session, 'invalid_language', { text: session.text, parts: session.parts }, INVALID_LANGUAGE)
  }

  if (session.parts.length === 1) {
    return finish(
      session,
      'mother_month',
      { text: session.text, parts: session.parts, language: language.code },
      'CON Enter month of pregnancy (1-9):',
    )
  }

  if (session.parts.length !== 2) {
    return finish(session, 'invalid_option', { text: session.text, parts: session.parts }, INVALID_OPTION)
  }

  const month = parseMonth(session.parts[1] ?? '')
  if (month === null) {
    return finish(
      session,
      'invalid_month',
      { text: session.text, parts: session.parts, language: language.code },
      INVALID_MONTH,
    )
  }

  const gestationWeek = month * 4
  const saved = await saveMother(session.supabase, {
    phone: session.callerPhone,
    language: language.code,
    pregnancyMonth: month,
    gestationWeek,
    tbaId: null,
  })
  if ('error' in saved) {
    console.error('Mother registration failed', saved.error)
    return reply(session.c, SAVE_FAILED)
  }

  return finish(
    session,
    'mother_registered',
    {
      text: session.text,
      parts: session.parts,
      language: language.code,
      pregnancy_month: month,
      gestation_week: gestationWeek,
      mother_phone: session.callerPhone,
    },
    `END Registered at Week ${gestationWeek} (${language.name}). Every Tuesday morning, CradleDial will call you with your weekly maternal health guide.`,
  )
}

async function handleTbaPortal(session: SessionContext): Promise<Response> {
  if (session.parts.length === 1) {
    return finish(
      session,
      'tba_code',
      { text: session.text, parts: session.parts },
      'CON TBA Agent Portal\nEnter your TBA Agent Code (e.g. 101) or press 0 to Register as a new TBA:',
    )
  }

  const second = session.parts[1] ?? ''
  if (second === '0') {
    return registerNewTba(session)
  }

  return onboardMother(session, second, session.parts.slice(2), 'portal')
}

async function registerNewTba(session: SessionContext): Promise<Response> {
  if (session.parts.length === 2) {
    return finish(
      session,
      'tba_name',
      { text: session.text, parts: session.parts },
      'CON Enter your Full Name:',
    )
  }

  const fullName = session.parts.slice(2).join(' ').trim()
  if (!fullName) {
    return finish(session, 'tba_name', { text: session.text, parts: session.parts }, 'END Please enter your full name.')
  }

  try {
    const agentCode = await generateAgentCode(session.supabase)
    const { error } = await session.supabase.from('tbas').insert({
      phone_number: session.callerPhone,
      full_name: fullName,
      agent_code: agentCode,
      ward: 'Ward 4',
    })
    if (error) {
      console.error('TBA registration failed', error.message)
      return reply(session.c, SAVE_FAILED)
    }

    return finish(
      session,
      'tba_registered',
      { text: session.text, parts: session.parts, agent_code: agentCode, full_name: fullName },
      `END Welcome ${fullName}! Your CradleDial TBA Agent Code is ${agentCode}. Dial *347*12*${agentCode}# to onboard mothers and earn N50 per mother.`,
    )
  } catch (error) {
    console.error('TBA registration failed', error)
    return reply(session.c, SAVE_FAILED)
  }
}

async function onboardMother(
  session: SessionContext,
  agentCode: string,
  input: string[],
  style: 'portal' | 'direct',
): Promise<Response> {
  const tba = await findTba(session.supabase, agentCode)
  if (!tba) {
    return finish(
      session,
      'invalid_agent',
      { text: session.text, parts: session.parts, agent_code: agentCode },
      INVALID_AGENT,
    )
  }

  if (input.length === 0) {
    const phonePrompt =
      style === 'portal'
        ? `CON Welcome ${tba.full_name}!\nEnter Mother's Phone Number (e.g. 08031234567):`
        : `CON Welcome ${tba.full_name}!\nEnter Mother's Phone Number:`
    return finish(
      session,
      'tba_mother_phone',
      { text: session.text, parts: session.parts, agent_code: agentCode },
      phonePrompt,
    )
  }

  let motherPhone: string
  try {
    motherPhone = normalizeNigerianPhone(input[0] ?? '')
  } catch {
    return finish(
      session,
      'invalid_mother_phone',
      { text: session.text, parts: session.parts, agent_code: agentCode },
      INVALID_PHONE,
    )
  }

  if (input.length === 1) {
    return finish(
      session,
      'tba_mother_language',
      { text: session.text, parts: session.parts, agent_code: agentCode, mother_phone: motherPhone },
      MOTHER_LANGUAGE_MENU,
    )
  }

  const language = LANGUAGES[input[1] ?? '']
  if (!language) {
    return finish(
      session,
      'invalid_language',
      { text: session.text, parts: session.parts, agent_code: agentCode, mother_phone: motherPhone },
      INVALID_LANGUAGE,
    )
  }

  if (input.length === 2) {
    return finish(
      session,
      'tba_mother_month',
      {
        text: session.text,
        parts: session.parts,
        agent_code: agentCode,
        mother_phone: motherPhone,
        language: language.code,
      },
      "CON Enter Mother's Month of Pregnancy (1-9):",
    )
  }

  if (input.length !== 3) {
    return finish(session, 'invalid_option', { text: session.text, parts: session.parts }, INVALID_OPTION)
  }

  const month = parseMonth(input[2] ?? '')
  if (month === null) {
    return finish(
      session,
      'invalid_month',
      {
        text: session.text,
        parts: session.parts,
        agent_code: agentCode,
        mother_phone: motherPhone,
        language: language.code,
      },
      INVALID_MONTH,
    )
  }

  const gestationWeek = month * 4
  const saved = await saveMother(session.supabase, {
    phone: motherPhone,
    language: language.code,
    pregnancyMonth: month,
    gestationWeek,
    tbaId: tba.id,
  })
  if ('error' in saved) {
    console.error('TBA mother registration failed', saved.error)
    return reply(session.c, SAVE_FAILED)
  }

  if (saved.created) {
    const { error } = await session.supabase
      .from('tbas')
      .update({ total_onboarded: Number(tba.total_onboarded) + 1 })
      .eq('id', tba.id)
    if (error) {
      console.error('TBA onboard counter failed', error.message)
      return reply(session.c, SAVE_FAILED)
    }
  }

  return finish(
    session,
    'tba_mother_registered',
    {
      text: session.text,
      parts: session.parts,
      agent_code: agentCode,
      mother_phone: motherPhone,
      language: language.code,
      pregnancy_month: month,
      gestation_week: gestationWeek,
    },
    `END Success! Mother (${motherPhone}) registered at Week ${gestationWeek} (${language.name}) under TBA ${tba.full_name}. You will earn N50 airtime after she completes 3 weekly calls.`,
  )
}

async function saveMother(
  supabase: Supabase,
  input: {
    phone: string
    language: string
    pregnancyMonth: number
    gestationWeek: number
    tbaId: string | null
  },
): Promise<{ created: boolean } | { error: string }> {
  const { data: existing, error: selectError } = await supabase
    .from('mothers')
    .select('id')
    .eq('phone_number', input.phone)
    .maybeSingle()

  if (selectError) {
    return { error: selectError.message }
  }

  const fields = {
    language: input.language,
    pregnancy_month: input.pregnancyMonth,
    gestation_week: input.gestationWeek,
    ward: 'Ward 4',
    is_active: true,
    tba_id: input.tbaId,
  }

  if (existing) {
    const { error } = await supabase.from('mothers').update(fields).eq('id', existing.id)
    if (error) return { error: error.message }
    return { created: false }
  }

  const { error } = await supabase.from('mothers').insert({
    phone_number: input.phone,
    ...fields,
  })
  if (error) return { error: error.message }
  return { created: true }
}

async function findTba(supabase: Supabase, agentCode: string): Promise<Tba | null> {
  const { data, error } = await supabase.from('tbas').select('*').eq('agent_code', agentCode).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  return data
}

async function generateAgentCode(supabase: Supabase): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(100 + Math.floor(Math.random() * 900))
    const { data, error } = await supabase.from('tbas').select('id').eq('agent_code', code).maybeSingle()
    if (error) {
      throw new Error(error.message)
    }
    if (!data) return code
  }
  throw new Error('Could not allocate a TBA agent code')
}

async function finish(
  session: SessionContext,
  step: string,
  temp: { [key: string]: Json | undefined },
  message: string,
): Promise<Response> {
  const { error } = await session.supabase.from('ussd_sessions').upsert(
    {
      session_id: session.sessionId,
      phone_number: session.callerPhone,
      service_code: session.serviceCode,
      current_step: step,
      temp_data: compactJson(temp),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  )
  if (error) {
    console.error('USSD session upsert failed', error.message)
    return reply(session.c, SAVE_FAILED)
  }
  return reply(session.c, message)
}

function compactJson(temp: { [key: string]: Json | undefined }): Json {
  const data: { [key: string]: Json | undefined } = {}
  for (const [key, value] of Object.entries(temp)) {
    if (value !== undefined) data[key] = value
  }
  return data
}

function parseMonth(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const month = Number(value)
  if (!Number.isInteger(month) || month < 1 || month > 9) return null
  return month
}

function agentCodeFromServiceCode(serviceCode: string): string | null {
  const segments = serviceCode.trim().replace(/#$/, '').split('*').filter(Boolean)
  if (segments.length < 3) return null
  const code = segments[segments.length - 1] ?? ''
  return /^\d{3,}$/.test(code) ? code : null
}

async function readPayload(c: AppContext): Promise<Record<string, string>> {
  const body = await c.req.parseBody()
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') payload[key] = value
  }
  return payload
}

function reply(c: AppContext, message: string): Response {
  return c.body(message, 200, {
    'Content-Type': TEXT_PLAIN,
  })
}
