import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Bindings, Database } from '../types/env'

function supabaseProjectUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
}

export function createSupabaseClient(
  env: Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseProjectUrl(env.SUPABASE_URL), env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: globalThis.fetch.bind(globalThis),
      headers: {
        'User-Agent': 'cradledial-worker/1.0',
      },
    },
  })
}
