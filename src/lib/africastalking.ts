import type { Bindings } from '../types/env'

export interface OutboundCallResponse {
  entries?: Array<{
    phoneNumber: string
    status: string
    sessionId?: string
  }>
  errorMessage?: string
  simulatedInSandbox?: boolean
  status?: string
}

export interface AirtimeRecipientResult {
  phoneNumber: string
  errorMessage: string
  amount: string
  status: string
  requestId: string
  discount: string
}

export interface AirtimeResponse {
  errorMessage: string
  numSent: number
  totalAmount: string
  totalDiscount: string
  responses: AirtimeRecipientResult[]
}

function voiceBaseUrl(username: string): string {
  return username === 'sandbox'
    ? 'https://voice.sandbox.africastalking.com'
    : 'https://voice.africastalking.com'
}

function apiBaseUrl(username: string): string {
  return username === 'sandbox'
    ? 'https://api.sandbox.africastalking.com'
    : 'https://api.africastalking.com'
}

export function makeOutboundCall(env: Bindings, to: string): Promise<OutboundCallResponse> {
  return createAfricasTalking(env).makeOutboundCall(to)
}

export function sendAirtime(
  env: Bindings,
  phoneNumber: string,
  amountNaira: number,
): Promise<AirtimeResponse> {
  return createAfricasTalking(env).sendAirtime(phoneNumber, `NGN ${amountNaira}`)
}

function simulatedCall(): OutboundCallResponse {
  return { simulatedInSandbox: true, status: 'ringing_simulator' }
}

export function createAfricasTalking(env: Bindings) {
  const username = env.AT_USERNAME
  const headers = {
    apiKey: env.AT_API_KEY,
    Accept: 'application/json',
  }
  const voiceUsername = env.AT_VOICE_USERNAME || env.AT_USERNAME
  const voiceKey = env.AT_VOICE_API_KEY || env.AT_API_KEY
  const sandboxVoice = !env.AT_VOICE_USERNAME && env.AT_USERNAME === 'sandbox'

  return {
    async makeOutboundCall(to: string): Promise<OutboundCallResponse> {
      if (sandboxVoice) return simulatedCall()
      const body = new URLSearchParams({
        username: voiceUsername,
        from: env.AT_CALLER_ID,
        to,
      })
      try {
        const response = await fetch(`${voiceBaseUrl(voiceUsername)}/call`, {
          method: 'POST',
          headers: {
            apiKey: voiceKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        })
        if (!response.ok) {
          if (voiceUsername === 'sandbox') return simulatedCall()
          throw new Error(`Africa's Talking call failed: ${response.status}`)
        }
        return (await response.json()) as OutboundCallResponse
      } catch (error) {
        if (voiceUsername === 'sandbox') return simulatedCall()
        throw error
      }
    },

    async sendAirtime(phoneNumber: string, amount: string): Promise<AirtimeResponse> {
      const response = await fetch(`${apiBaseUrl(username)}/version1/airtime/send`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          recipients: [{ phoneNumber, amount }],
        }),
      })
      if (!response.ok) {
        throw new Error(`Africa's Talking airtime failed: ${response.status}`)
      }
      return (await response.json()) as AirtimeResponse
    },
  }
}
