// 알림 테스트 발송 — 실제 공고를 몇 달 기다리지 않고 지금 확인해보기 위한 함수
// Supabase → Edge Functions → 'apply-test' 로 배포. Verify JWT ON.
// 필요한 secret: RESEND_API_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 알림을 쓸 수 있는 계정 (프론트 src/lib/applyNotify.ts 의 목록과 동일해야 함)
// 사이트는 공개하되 메일 발송은 본인 계정에서만 — 발송 서비스 사용량이 공유되기 때문.
// ⚠️ 저장소가 공개라 메일 주소를 그대로 적지 않고, 되돌릴 수 없는 값(SHA-256)으로만 비교한다.
//    계정 추가: node -e "console.log(require('crypto').createHash('sha256').update('메일주소').digest('hex'))"
const NOTIFY_ALLOW_HASH = [
  '1ae3e4416f2a891a01aa91f1105b9e9ee81efbd866914fecca5d0cf60cd7cc27',
]
async function allowed(email?: string | null): Promise<boolean> {
  if (!email) return false
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return NOTIFY_ALLOW_HASH.includes(hex)
}

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

    if (!(await allowed(u.user.email))) return json({ ok: false, reason: '이 계정은 알림 기능을 쓸 수 없어요.' }, 403)

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ ok: false, reason: 'RESEND_API_KEY가 설정되지 않았어요.' })

    const body = await req.json().catch(() => ({})) as { email?: string }
    const to = body.email || u.user.email
    if (!to) return json({ ok: false, reason: '받을 메일 주소가 없어요.' })

    const title = '🏠 모아 청약 알림 테스트'
    const text = '반포 디에이치 클래스트 (서초구)\n1순위 접수 2027-03-15\n추첨 물량 82세대 · 60㎡ 이하 71세대\n\n실제 공고가 뜨면 이런 식으로 알려드려요.'
    const link = 'https://moa-money.netlify.app/subscription'

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '모아 청약알림 <onboarding@resend.dev>',
        to: [to],
        subject: title,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.7">
          <h2 style="margin:0 0 12px">${title}</h2>
          <div style="white-space:pre-line">${text}</div>
          <p style="margin-top:16px"><a href="${link}" style="color:#12b8a6;font-weight:bold">공고 보러 가기 →</a></p>
        </div>`,
      }),
    })

    if (r.ok) return json({ ok: true, to })
    const detail = await r.text()
    // Resend는 도메인 인증 전이면 '가입한 본인 메일'로만 보낼 수 있다 — 가장 흔한 실패 원인
    return json({ ok: false, reason: `발송 실패: ${detail.slice(0, 200)}` })
  } catch (e) {
    return json({ ok: false, reason: String(e) })
  }
})
