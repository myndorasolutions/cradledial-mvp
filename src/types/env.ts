export interface Bindings {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  R2_PUBLIC_URL: string
  AT_USERNAME: string
  AT_API_KEY: string
  AT_CALLER_ID: string
  AT_VOICE_USERNAME?: string
  AT_VOICE_API_KEY?: string
  ADMIN_DEMO_KEY: string
  AUDIO_BUCKET: R2Bucket
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Tba = {
  id: string
  phone_number: string
  full_name: string
  agent_code: string
  ward: string
  total_onboarded: number
  total_commission_earned: number
  created_at: string
}

export type Mother = {
  id: string
  phone_number: string
  language: string
  pregnancy_month: number
  gestation_week: number
  ward: string
  tba_id: string | null
  completed_ivr_weeks: number
  tba_commission_paid: boolean
  is_active: boolean
  created_at: string
}

export type UssdSession = {
  session_id: string
  phone_number: string
  service_code: string
  current_step: string
  temp_data: Json
  updated_at: string
}

export type CallLog = {
  id: string
  at_session_id: string | null
  mother_id: string | null
  phone_number: string
  call_type: string
  language: string
  gestation_week: number | null
  audio_url: string
  status: string
  duration_seconds: number
  counted_toward_commission: boolean
  created_at: string
}

export type AirtimePayout = {
  id: string
  tba_id: string | null
  mother_id: string | null
  amount_naira: number
  status: string
  at_transaction_id: string | null
  created_at: string
}

export type EmergencyBroadcast = {
  id: string
  ward: string
  alert_title: string
  audio_url: string
  recipients_count: number
  triggered_by: string
  created_at: string
}

type Table<Row extends object> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      tbas: Table<Tba>
      mothers: Table<Mother>
      ussd_sessions: Table<UssdSession>
      call_logs: Table<CallLog>
      airtime_payouts: Table<AirtimePayout>
      emergency_broadcasts: Table<EmergencyBroadcast>
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
