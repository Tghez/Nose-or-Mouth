import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Session } from '../../../types/session'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface WeekSession {
  date: string
  noseSeconds: number
  mouthSeconds: number
}

interface AuthState {
  user: User | null
  isPro: boolean
}

interface AuthContextValue extends AuthState {
  initAuth: (onProChange?: (isPro: boolean) => void) => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  syncSession: (session: Session) => Promise<void>
  fetchWeekSessions: () => Promise<WeekSession[]>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchIsPro(userId: string): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .single()
  return data?.subscription_status === 'active'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isPro: false })

  const initAuth = useCallback(async (onProChange?: (isPro: boolean) => void) => {
    if (!supabase || !isSupabaseConfigured) return

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const isPro = await fetchIsPro(session.user.id)
      setAuthState({ user: session.user, isPro })
      onProChange?.(isPro)
    }

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const user = newSession?.user ?? null
      const isPro = user ? await fetchIsPro(user.id) : false
      setAuthState({ user, isPro })
      onProChange?.(isPro)
    })
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase not configured'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase not configured'
    const { error } = await supabase.auth.signUp({ email, password })
    return error?.message ?? null
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const syncSession = useCallback(async (session: Session) => {
    if (!supabase || !authState.user) return
    await supabase.from('sessions').upsert({
      user_id:       authState.user.id,
      date:          session.date,
      nose_seconds:  session.noseBreathingSeconds,
      mouth_seconds: session.mouthBreathingSeconds,
      updated_at:    new Date().toISOString()
    }, { onConflict: 'user_id,date' })
  }, [authState.user])

  const fetchWeekSessions = useCallback(async (): Promise<WeekSession[]> => {
    if (!supabase || !authState.user) return []
    const sevenDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('sessions')
      .select('date,nose_seconds,mouth_seconds')
      .eq('user_id', authState.user.id)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: true })
    if (!data) return []
    return data.map(row => ({
      date:         row.date as string,
      noseSeconds:  row.nose_seconds as number,
      mouthSeconds: row.mouth_seconds as number,
    }))
  }, [authState.user])

  return (
    <AuthContext.Provider value={{ ...authState, initAuth, signIn, signUp, signOut, syncSession, fetchWeekSessions }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
