// KRX 국내 금현물 시세 (원/g) — 네이버 금융 marketindex API 프록시
// Supabase Edge Functions → 'krx-gold' 배포. Secret 불필요. Verify JWT OFF 권장(간단 조회).
// 네이버 소스는 CORS 미지원이라 브라우저 직접 호출 불가 → 이 함수가 프록시.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// M04020000 = 국내 금 1g (KRX 금현물)
const SRC = 'https://api.stock.naver.com/marketindex/metals/M04020000'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    const r = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return json({ error: 'source ' + r.status }, 502)
    const d = await r.json() as {
      closePrice?: string; fluctuations?: string; fluctuationsRatio?: string; localTradedAt?: string
    }
    const krwPerGram = Number((d.closePrice ?? '').replace(/,/g, ''))
    if (!krwPerGram) return json({ error: 'no price' }, 502)
    return json({
      krwPerGram,
      change: d.fluctuations ?? null,
      changeRate: d.fluctuationsRatio ?? null,
      tradedAt: d.localTradedAt ?? null,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
