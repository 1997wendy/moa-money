// 해외주식: 시세(quote) + 종목검색(search) — Finnhub
// Supabase → Edge Functions → 'stock-price' 에 이 코드로 재배포. FINNHUB_KEY secret 필요. Verify JWT OFF.
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
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: u, error } = await admin.auth.getUser(token)
    if (error || !u.user) return json({ error: 'auth' }, 401)

    const key = Deno.env.get('FINNHUB_KEY')
    if (!key) return json({ error: 'no FINNHUB_KEY' }, 500)

    const body = await req.json() as { search?: string; symbols?: string[] }

    // 종목 검색
    if (body.search) {
      const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(body.search)}&token=${key}`)
      const d = await r.json()
      const results = (d.result ?? [])
        .filter((x: { symbol: string; type?: string }) => x.symbol && !x.symbol.includes('.'))
        .slice(0, 15)
        .map((x: { symbol: string; description: string; type?: string }) => ({ symbol: x.symbol, description: x.description, type: x.type }))
      return json({ results })
    }

    // 시세
    const prices: Record<string, number> = {}
    for (const s of (body.symbols ?? []).slice(0, 30)) {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key}`)
      const d = await r.json()
      if (typeof d.c === 'number' && d.c > 0) prices[s] = d.c
    }
    return json({ prices })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
