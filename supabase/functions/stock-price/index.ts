// 해외주식 시세 Edge Function (Finnhub)
// Supabase → Edge Functions → 새 함수 'stock-price' 로 이 코드 붙여넣고 Deploy.
// 그리고 함수/프로젝트 Secrets 에 FINNHUB_KEY = 발급받은 키 를 등록.
// (Verify JWT with legacy secret 은 OFF 권장 — 코드에서 직접 인증 확인)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    // 로그인 사용자만 (우리 Finnhub 키 보호)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: u, error } = await admin.auth.getUser(token)
    if (error || !u.user) return json({ error: 'auth' }, 401)

    const key = Deno.env.get('FINNHUB_KEY')
    if (!key) return json({ error: 'no FINNHUB_KEY' }, 500)

    const { symbols } = await req.json() as { symbols: string[] }
    const prices: Record<string, number> = {}
    for (const s of (symbols ?? []).slice(0, 30)) {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key}`)
      const d = await r.json()
      if (typeof d.c === 'number' && d.c > 0) prices[s] = d.c
    }
    return json({ prices })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
