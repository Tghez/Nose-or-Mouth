import { supabase, isSupabaseConfigured } from './supabase'
import type { User } from '@supabase/supabase-js'
import type { Session } from '../../types/session'

export interface AuthState {
  user: User | null
  isPro: boolean
}

export type AuthChangeCallback = (state: AuthState) => void

export const authState: AuthState = { user: null, isPro: false }

export async function initAuth(onChange: AuthChangeCallback): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    authState.user  = session.user
    authState.isPro = await fetchIsPro(session.user.id)
    onChange({ ...authState })
  }

  supabase.auth.onAuthStateChange(async (_event, newSession) => {
    authState.user  = newSession?.user ?? null
    authState.isPro = authState.user ? await fetchIsPro(authState.user.id) : false
    onChange({ ...authState })
  })
}

async function fetchIsPro(userId: string): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .single()
  return data?.subscription_status === 'active'
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase not configured'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error?.message ?? null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Supabase not configured'
  const { error } = await supabase.auth.signUp({ email, password })
  return error?.message ?? null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

export async function syncSession(session: Session): Promise<void> {
  if (!supabase || !authState.user) return
  await supabase.from('sessions').upsert({
    user_id:       authState.user.id,
    date:          session.date,
    nose_seconds:  session.noseBreathingSeconds,
    mouth_seconds: session.mouthBreathingSeconds,
    updated_at:    new Date().toISOString()
  }, { onConflict: 'user_id,date' })
}
