import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = 'https://zquwchcnlqfpqxidpjoc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpxdXdjaGNubHFmcHF4aWRwam9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTU0NzMsImV4cCI6MjA5NjEzMTQ3M30.KcLh_KYEOYB3W389m_uKeKfZee3p2lN0_G7qDQDYRy8'

export const isSupabaseConfigured = true

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true
  }
})
