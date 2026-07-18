// 국내주식/ETF 현재가 — 한국투자증권(KIS) OpenAPI
// Supabase Edge Functions → 'kr-stock' 배포. Secrets: KIS_APPKEY, KIS_APPSECRET. Verify JWT OFF.
// 토큰은 app_cache 테이블에 저장해 24h 재사용 (콜드스타트마다 재발급→카톡알림/1분1회 제한 회피)
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const BASE = 'https://openapi.koreainvestment.com:9443'
const TOKEN_KEY = 'kis_token'

// 웜 인스턴스 캐시 (같은 인스턴스 내 재사용)
let cached: { token: string; exp: number } | null = null

// 저장된(유효한) 토큰 읽기 — 없으면 null
async function readCachedToken(admin: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await admin.from('app_cache').select('value, expires_at').eq('key', TOKEN_KEY).maybeSingle()
    if (data && typeof data.expires_at === 'number' && data.expires_at > Date.now() + 60_000) {
      cached = { token: data.value as string, exp: data.expires_at }
      return cached.token
    }
  } catch { /* app_cache 미존재 → 무시 */ }
  return null
}

async function getToken(admin: SupabaseClient, appkey: string, appsecret: string): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const fromDb = await readCachedToken(admin)
  if (fromDb) return fromDb
  // 신규 발급 (하루 1회 수준)
  const r = await fetch(`${BASE}/oauth2/tokenP`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey, appsecret }),
  })
  const d = await r.json()
  if (!d.access_token) {
    // 1분당 1회 제한(EGW00133) 등 — 다른 호출이 방금 발급했을 수 있으니 잠깐 후 저장소 재확인
    await new Promise((res) => setTimeout(res, 2500))
    const retry = await readCachedToken(admin)
    if (retry) return retry
    throw new Error('token ' + JSON.stringify(d))
  }
  const exp = Date.now() + (Number(d.expires_in) || 86400) * 1000
  cached = { token: d.access_token, exp }
  try { await admin.from('app_cache').upsert({ key: TOKEN_KEY, value: d.access_token, expires_at: exp }) } catch { /* noop */ }
  return cached.token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const uToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: u, error } = await admin.auth.getUser(uToken)
    if (error || !u.user) return json({ error: 'auth' }, 401)

    const appkey = Deno.env.get('KIS_APPKEY'); const appsecret = Deno.env.get('KIS_APPSECRET')
    if (!appkey || !appsecret) return json({ error: 'no KIS keys' }, 500)

    const { codes } = await req.json() as { codes: string[] }
    const at = await getToken(admin, appkey, appsecret)
    const prices: Record<string, number> = {}
    const names: Record<string, string> = {}
    const errors: Record<string, string> = {} // 진단용 — 현재가 못 받은 이유(KIS 메시지)
    for (const code of (codes ?? []).slice(0, 20)) {
      const url = `${BASE}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(code)}`
      const r = await fetch(url, { headers: { authorization: `Bearer ${at}`, appkey, appsecret, tr_id: 'FHKST01010100', custtype: 'P' } })
      const d = await r.json()
      const p = Number(d?.output?.stck_prpr)
      if (p > 0) prices[code] = p
      else errors[code] = `http=${r.status} rt_cd=${d?.rt_cd ?? '?'} msg=${d?.msg1 ?? d?.msg_cd ?? JSON.stringify(d).slice(0, 200)}`
      if (d?.output?.hts_kor_isnm) names[code] = d.output.hts_kor_isnm
    }
    return json({ prices, names, errors })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
