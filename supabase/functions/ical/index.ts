// 외부 캘린더(.ics) 원문 프록시 — 브라우저 CORS 우회
// Supabase Edge Functions → 'ical' 배포. Secret 불필요. Verify JWT OFF 권장.
// (구글/카카오 등 .ics 주소는 CORS 미허용이라 브라우저 직접 fetch 불가 → 이 함수가 대신 받아 전달)

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
    const { url } = await req.json() as { url: string }
    if (!url || !/^https?:\/\//i.test(url)) return json({ error: 'bad url' }, 400)
    // webcal:// → https:// 로 변환된 주소를 받는다고 가정
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', accept: 'text/calendar,*/*' } })
    if (!r.ok) return json({ error: 'source ' + r.status }, 502)
    const ics = await r.text()
    if (!ics.includes('BEGIN:VCALENDAR')) return json({ error: 'not ics' }, 422)
    return json({ ics })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
