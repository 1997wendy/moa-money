// 청약 알림 발송 — 하루 2번 자동 실행되며 새 공고·접수 임박을 메일로 알린다
// Supabase → Edge Functions → 'apply-notify' 로 배포. Verify JWT OFF (대신 NOTIFY_SECRET으로 보호).
// 필요한 secret: APPLYHOME_KEY, NOTIFY_SECRET, RESEND_API_KEY
//
// [실행 스케줄] Supabase Dashboard → Integrations → Cron  (시간은 UTC 기준으로 넣어야 함)
//   0  23 * * *  →  한국시간 08:00  ?stage=morning  (신규 공고 + 접수 전날)
//   30 23 * * *  →  한국시간 08:30  ?stage=open     (접수 당일, 9시 시작 30분 전)
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

const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1'

// ── 한국 시간 기준 날짜 ──
// Edge Function은 UTC로 도니, 그대로 쓰면 아침 8시 실행분이 '어제'로 계산된다.
const kstDate = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10)

type Row = Record<string, any>

async function od(path: string, cond: Record<string, string>, key: string): Promise<Row[]> {
  const u = new URL(`${BASE}/${path}`)
  u.searchParams.set('page', '1')
  u.searchParams.set('perPage', '100')
  for (const [k, v] of Object.entries(cond)) u.searchParams.set(k, v)
  const r = await fetch(u.toString(), { headers: { Authorization: `Infuser ${key}` } })
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return (await r.json() as { data?: Row[] }).data ?? []
}

/**
 * ⚠️ 이 계산은 src/lib/applyHome.ts 의 lotteryOf() 와 같은 규칙이다.
 *    청약 제도가 바뀌면 두 곳을 모두 고쳐야 한다. (알림 문구에 세대수를 넣으려면 서버도 알아야 해서 불가피하게 중복)
 */
function lotteryPct(zone: 'remndr' | 'speclt' | 'mdat' | 'normal', area: number): number | null {
  if (zone === 'remndr') return 1
  if (zone === 'speclt') return area <= 60 ? 0.6 : area <= 85 ? 0.3 : 0.2
  if (zone === 'mdat') return area <= 60 ? 0.6 : area <= 85 ? 0.3 : null
  return area > 85 ? 1 : 0.6
}

const areaOf = (houseTy: string) => Number(/[0-9]+(\.[0-9]+)?/.exec(houseTy ?? '')?.[0] ?? 0)
const eok = (manwon: number) => (manwon ? `${(manwon / 10000).toFixed(1)}억` : '-')

interface Notice {
  key: string
  name: string
  region: string
  address: string
  kind: 'apt' | 'remndr'
  recruitDate: string | null
  rank1: string | null // 1순위 해당지역 접수일 = 실제 D-day
  spsply: string | null // 특별공급 접수일
  winner: string | null
  lottery: number
  small: number // 60㎡ 이하 추첨 물량
  minPrice: number
  maxPrice: number
  url: string | null
}

async function collect(regions: string[], key: string): Promise<Notice[]> {
  const from = kstDate(-120) // 최근 4개월 공고만 확인하면 충분
  const out: Notice[] = []
  const seen = new Set<string>()

  for (const region of regions) {
    const cond = { 'cond[HSSPLY_ADRES::LIKE]': region, 'cond[RCRIT_PBLANC_DE::GTE]': from }
    const [apt, rem] = await Promise.all([
      od('getAPTLttotPblancDetail', cond, key).catch(() => [] as Row[]),
      od('getRemndrLttotPblancDetail', cond, key).catch(() => [] as Row[]),
    ])

    for (const [kind, rows] of [['apt', apt], ['remndr', rem]] as const) {
      for (const r of rows) {
        const k = `${kind}-${r.HOUSE_MANAGE_NO}-${r.PBLANC_NO}`
        if (seen.has(k)) continue
        seen.add(k)

        const mdl = await od(
          kind === 'apt' ? 'getAPTLttotPblancMdl' : 'getRemndrLttotPblancMdl',
          { 'cond[HOUSE_MANAGE_NO::EQ]': String(r.HOUSE_MANAGE_NO), 'cond[PBLANC_NO::EQ]': String(r.PBLANC_NO) },
          key,
        ).catch(() => [] as Row[])

        const zone = kind === 'remndr' ? 'remndr'
          : r.SPECLT_RDN_EARTH_AT === 'Y' ? 'speclt'
          : r.MDAT_TRGET_AREA_SECD === 'Y' ? 'mdat' : 'normal'

        let lottery = 0, small = 0
        const prices: number[] = []
        for (const m of mdl) {
          const area = areaOf(String(m.HOUSE_TY ?? ''))
          const pct = lotteryPct(zone, area)
          let base = Number(m.SUPLY_HSHLDCO) || 0
          if (zone === 'remndr' && base === 0) base = Number(m.SPSPLY_HSHLDCO) || (mdl.length === 1 ? Number(r.TOT_SUPLY_HSHLDCO) || 0 : 0)
          const units = pct === null ? 0 : Math.floor(base * pct)
          lottery += units
          if (area <= 60) small += units
          const p = Number(m.LTTOT_TOP_AMOUNT) || 0
          if (p > 0) prices.push(p)
        }

        out.push({
          key: k,
          name: String(r.HOUSE_NM ?? ''),
          region,
          address: String(r.HSSPLY_ADRES ?? ''),
          kind,
          recruitDate: r.RCRIT_PBLANC_DE ?? null,
          rank1: r.GNRL_RNK1_CRSPAREA_RCPTDE ?? r.GNRL_RCEPT_BGNDE ?? r.RCEPT_BGNDE ?? r.SUBSCRPT_RCEPT_BGNDE ?? null,
          spsply: r.SPSPLY_RCEPT_BGNDE ?? null,
          winner: r.PRZWNER_PRESNATN_DE ?? null,
          lottery,
          small,
          minPrice: prices.length ? Math.min(...prices) : 0,
          maxPrice: prices.length ? Math.max(...prices) : 0,
          url: r.PBLANC_URL ?? null,
        })
      }
    }
  }
  return out
}

function message(stage: 'new' | 'd1' | 'd0', n: Notice): { title: string; body: string } {
  const title =
    stage === 'new' ? (n.kind === 'remndr' ? '🏠 무순위(줍줍) 공고' : '🏠 새 청약 공고')
    : stage === 'd1' ? '⏰ 내일 청약 접수'
    : '🚨 오늘 청약 접수'

  const lines = [
    `${n.name} (${n.region})`,
    n.rank1 ? `1순위 접수 ${n.rank1}${stage === 'd0' ? ' — 오전 9시 시작' : ''}` : '',
    n.lottery > 0 ? `추첨 물량 ${n.lottery}세대${n.small > 0 ? ` · 60㎡ 이하 ${n.small}세대` : ''}` : '',
    n.minPrice > 0 ? `${eok(n.minPrice)}${n.maxPrice !== n.minPrice ? ` ~ ${eok(n.maxPrice)}` : ''}` : '',
    n.spsply && n.rank1 && n.spsply !== n.rank1 ? `(특별공급은 ${n.spsply})` : '',
    stage === 'd0' ? '※ 정확한 접수 시간은 공고문을 확인하세요.' : '',
  ].filter(Boolean)

  return { title, body: lines.join('\n') }
}

async function mailSend(apiKey: string, to: string, title: string, body: string, link: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: '모아 청약알림 <onboarding@resend.dev>',
      to: [to],
      subject: `${title} — ${body.split('\n')[0]}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.7">
        <h2 style="margin:0 0 12px">${title}</h2>
        <div style="white-space:pre-line">${body}</div>
        <p style="margin-top:16px"><a href="${link}" style="color:#12b8a6;font-weight:bold">공고 보러 가기 →</a></p>
      </div>`,
    }),
  })
  return r.ok
}

/** 실제 확인·발송 작업 (오래 걸린다 — 지역마다 공공데이터를 조회해야 해서 10초 안팎) */
async function run(stage: string): Promise<unknown[]> {
  const applyKey = Deno.env.get('APPLYHOME_KEY')
  if (!applyKey) throw new Error('no APPLYHOME_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: watches } = await admin.from('apply_watch').select('*').eq('enabled', true)

  const today = kstDate()
  const tomorrow = kstDate(1)
  const report: unknown[] = []

  for (const w of watches ?? []) {
    const regions: string[] = (w.regions ?? []).filter(Boolean)
    if (regions.length === 0) continue

    // 허용된 계정인지 확인 (다른 사람이 설정을 만들어도 발송하지 않는다)
    const { data: acc } = await admin.auth.admin.getUserById(w.user_id)
    if (!(await allowed(acc?.user?.email))) continue

    const notified: Record<string, string> = w.notified ?? {}
    const notices = await collect(regions, applyKey).catch(() => [] as Notice[])
    const jobs: { stage: 'new' | 'd1' | 'd0'; n: Notice }[] = []

    for (const n of notices) {
      // 특별공급만 있고 일반공급 추첨 물량이 없는 공고는, 특공 알림을 켠 경우에만 보낸다
      if (n.lottery === 0 && !w.special_on) continue

      if (stage === 'morning') {
        // 1) 새로 올라온 공고 (아직 접수 전인 것만)
        if (!notified[`${n.key}:new`] && (!n.rank1 || n.rank1 >= today)) jobs.push({ stage: 'new', n })
        // 2) 1순위 접수 전날
        if (n.rank1 === tomorrow && !notified[`${n.key}:d1`]) jobs.push({ stage: 'd1', n })
      } else {
        // 3) 1순위 접수 당일
        if (n.rank1 === today && !notified[`${n.key}:d0`]) jobs.push({ stage: 'd0', n })
      }
    }

    if (jobs.length === 0) continue

    for (const job of jobs) {
      const { title, body } = message(job.stage, job.n)
      const link = job.n.url ?? 'https://moa-money.netlify.app/subscription'
      let sent = false
      if (w.email_on && w.email && resendKey) {
        sent = await mailSend(resendKey, w.email, title, body, link).catch(() => false)
      }
      // 발송에 실패하면 기록하지 않는다 → 다음 실행 때 다시 시도
      if (sent) notified[`${job.n.key}:${job.stage}`] = today
      report.push({ user: w.user_id, stage: job.stage, name: job.n.name, sent })
    }

    await admin.from('apply_watch')
      .update({ notified, updated_at: new Date().toISOString() })
      .eq('user_id', w.user_id)
  }

  return report
}

Deno.serve((req) => {
  const url = new URL(req.url)
  const stage = url.searchParams.get('stage') ?? 'morning' // morning | open
  const secretIn = url.searchParams.get('secret') ?? req.headers.get('x-notify-secret') ?? ''
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

  const NOTIFY_SECRET = Deno.env.get('NOTIFY_SECRET')
  if (!NOTIFY_SECRET || secretIn !== NOTIFY_SECRET) return json({ error: 'forbidden' }, 403)

  // 자동 실행(cron)은 응답을 최대 5초까지만 기다린다. 이 작업은 10초쯤 걸리므로
  // "접수했다"고 즉시 답하고 실제 작업은 뒤에서 이어서 돌린다.
  // ?wait=1 을 붙이면 끝까지 기다렸다가 결과를 돌려준다 (직접 확인해볼 때 사용).
  const work = run(stage).catch((e) => [{ error: String(e) }])

  if (url.searchParams.get('wait')) {
    return work.then((report) => json({ ok: true, stage, today: kstDate(), sent: report }))
  }

  // @ts-ignore Supabase Edge Runtime 전용 API
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  return json({ ok: true, stage, started: true })
})
