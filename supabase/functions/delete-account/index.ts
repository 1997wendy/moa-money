// 회원 탈퇴 Edge Function
// Supabase 대시보드 → Edge Functions → 새 함수 'delete-account' 로 이 코드 붙여넣고 Deploy.
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 함수에 자동 주입됨 — 따로 넣을 필요 없음)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    if (!token) return json({ error: 'no token' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: u, error } = await admin.auth.getUser(token)
    if (error || !u.user) return json({ error: 'invalid user' }, 401)

    const uid = u.user.id
    await admin.from('backups').delete().eq('user_id', uid)
    await admin.from('shared_profiles').delete().eq('owner_id', uid)
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) return json({ error: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
