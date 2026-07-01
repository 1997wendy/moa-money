// Supabase 클라이언트
// 아래 두 값은 '공개용(anon)' 이라 코드에 있어도 안전해요. (비밀키·DB비번은 절대 여기 넣지 않음)
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://grfljmlaqqxnlikiepfz.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZmxqbWxhcXF4bmxpa2llcGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MzMwNTUsImV4cCI6MjA5ODQwOTA1NX0.FMQNf8o1mC2KVP_FIwZQpPVuN7cmFm6NOXiMzTDHMxs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})
