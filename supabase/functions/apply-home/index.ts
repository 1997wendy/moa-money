// 청약홈 분양정보 프록시 — 공공데이터포털(odcloud) 오픈API
// Supabase → Edge Functions → 'apply-home' 에 이 코드로 배포. APPLYHOME_KEY secret 필요. Verify JWT OFF.
//
// 왜 이 함수가 필요한가:
//  1) 공공데이터 API는 브라우저에서 직접 부르면 보안정책(CORS)으로 막힘 → 서버가 대신 호출
//  2) 인증키를 브라우저에 노출하지 않기 위해 (키는 이 서버에만 있음)
//  3) 한 화면 그리는 데 API를 수십 번 불러야 해서 → 결과를 app_cache 테이블에 6시간 보관
//
// ※ 이 함수는 '데이터를 가져와 정리'만 한다. 추첨 세대수 계산 같은 규칙은 프론트(src/lib/applyHome.ts)에 둔다.
//    청약 제도가 바뀌어도 이 함수는 그대로 두고 프론트만 고치면 되게 하기 위함.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1'
const CACHE_MS = 6 * 60 * 60 * 1000 // 6시간
const MAX_REGIONS = 15

type Row = Record<string, string | number | null>

/** odcloud 공통 호출. cond[...] 조건은 그대로 쿼리스트링으로 넘어간다. */
async function od(path: string, cond: Record<string, string>, key: string): Promise<Row[]> {
  const u = new URL(`${BASE}/${path}`)
  u.searchParams.set('page', '1')
  u.searchParams.set('perPage', '100')
  for (const [k, v] of Object.entries(cond)) u.searchParams.set(k, v)
  const r = await fetch(u.toString(), { headers: { Authorization: `Infuser ${key}` } })
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`)
  const d = await r.json() as { data?: Row[] }
  return d.data ?? []
}

const s = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/** 동시 호출 수를 제한하며 순회 (공공 API에 한꺼번에 몰아치지 않도록) */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, st = 200) =>
    new Response(JSON.stringify(b), { status: st, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: u, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !u.user) return json({ error: 'auth' }, 401)

    const key = Deno.env.get('APPLYHOME_KEY')
    if (!key) return json({ error: 'no APPLYHOME_KEY' }, 500)

    const body = await req.json().catch(() => ({})) as { regions?: string[]; from?: string; refresh?: boolean }
    const regions = (body.regions ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_REGIONS)
    if (regions.length === 0) return json({ error: 'no regions' }, 400)
    // 기본: 1년 전 공고부터 (지난 단지도 참고용으로 보이게)
    const from = body.from ?? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)

    const cacheKey = `applyhome:${from}:${[...regions].sort().join(',')}`

    // ── 캐시 확인 ──
    if (!body.refresh) {
      const { data: c } = await admin.from('app_cache').select('value,expires_at').eq('key', cacheKey).maybeSingle()
      if (c && n(c.expires_at) > Date.now()) {
        return json({ ...JSON.parse(String(c.value)), cached: true })
      }
    }

    // ── 1단계: 지역별 공고 목록 (일반분양 + 무순위/잔여세대) ──
    const lists = await mapLimit(regions, 4, async (region) => {
      const cond = { 'cond[HSSPLY_ADRES::LIKE]': region, 'cond[RCRIT_PBLANC_DE::GTE]': from }
      const [apt, remndr] = await Promise.all([
        od('getAPTLttotPblancDetail', cond, key).catch(() => [] as Row[]),
        od('getRemndrLttotPblancDetail', cond, key).catch(() => [] as Row[]),
      ])
      return [
        ...apt.map((r) => ({ kind: 'apt' as const, region, r })),
        ...remndr.map((r) => ({ kind: 'remndr' as const, region, r })),
      ]
    })

    // 여러 지역 키워드에 중복으로 걸린 공고 제거 (주택관리번호 기준)
    const seen = new Set<string>()
    const uniq = lists.flat().filter(({ kind, r }) => {
      const id = `${kind}:${r.HOUSE_MANAGE_NO}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

    // ── 2단계: 공고별 주택형(평형) 상세 ──
    const items = await mapLimit(uniq, 5, async ({ kind, region, r }) => {
      const path = kind === 'apt' ? 'getAPTLttotPblancMdl' : 'getRemndrLttotPblancMdl'
      const mdl = await od(path, {
        'cond[HOUSE_MANAGE_NO::EQ]': String(r.HOUSE_MANAGE_NO),
        'cond[PBLANC_NO::EQ]': String(r.PBLANC_NO),
      }, key).catch(() => [] as Row[])

      return {
        kind,
        region,
        id: `${kind}-${r.HOUSE_MANAGE_NO}-${r.PBLANC_NO}`,
        houseManageNo: String(r.HOUSE_MANAGE_NO),
        pblancNo: String(r.PBLANC_NO),
        name: s(r.HOUSE_NM) ?? '(이름 없음)',
        address: s(r.HSSPLY_ADRES) ?? '',
        areaName: s(r.SUBSCRPT_AREA_CODE_NM),
        // 주택구분: APT / 민간사전청약 / 신혼희망타운 / 무순위 / 불법행위 재공급
        houseKind: s(r.HOUSE_SECD_NM),
        houseSecd: s(r.HOUSE_SECD),
        detailKind: s(r.HOUSE_DTL_SECD_NM), // 민영 / 국민 (무순위엔 없음)
        // 규제지역 정보 — 추첨 비율 계산의 근거. API가 공고 시점 기준으로 직접 알려준다.
        speclt: s(r.SPECLT_RDN_EARTH_AT), // 투기과열지구 Y/N
        mdat: s(r.MDAT_TRGET_AREA_SECD), // 조정대상지역 Y/N
        priceCap: s(r.PARCPRC_ULS_AT), // 분양가상한제 Y/N
        // 일정
        recruitDate: s(r.RCRIT_PBLANC_DE), // 모집공고일
        rceptBgn: s(r.RCEPT_BGNDE ?? r.SUBSCRPT_RCEPT_BGNDE), // 청약접수 시작
        rceptEnd: s(r.RCEPT_ENDDE ?? r.SUBSCRPT_RCEPT_ENDDE), // 청약접수 종료
        rank1Bgn: s(r.GNRL_RNK1_CRSPAREA_RCPTDE ?? r.GNRL_RCEPT_BGNDE), // 1순위 해당지역
        rank1End: s(r.GNRL_RNK1_CRSPAREA_ENDDE ?? r.GNRL_RCEPT_ENDDE),
        winnerDate: s(r.PRZWNER_PRESNATN_DE), // 당첨자발표일
        contractBgn: s(r.CNTRCT_CNCLS_BGNDE),
        contractEnd: s(r.CNTRCT_CNCLS_ENDDE),
        moveIn: s(r.MVN_PREARNGE_YM), // 입주예정월 (YYYYMM)
        // 기타
        total: n(r.TOT_SUPLY_HSHLDCO),
        builder: s(r.CNSTRCT_ENTRPS_NM),
        owner: s(r.BSNS_MBY_NM),
        tel: s(r.MDHS_TELNO),
        homepage: s(r.HMPG_ADRES),
        url: s(r.PBLANC_URL), // 청약홈 공고문 링크
        models: mdl.map((m) => ({
          modelNo: s(m.MODEL_NO),
          houseTy: s(m.HOUSE_TY) ?? '', // 주택형 = 전용면적 문자열 (예: "059.9400A")
          supplyAr: n(m.SUPLY_AR), // 공급면적(전용+공용) — 전용면적과 다름
          general: n(m.SUPLY_HSHLDCO), // 일반공급 세대수
          special: n(m.SPSPLY_HSHLDCO), // 특별공급 세대수
          price: n(m.LTTOT_TOP_AMOUNT), // 분양최고금액 (만원)
        })),
      }
    })

    // 접수일 늦은 순(최신 먼저)
    items.sort((a, b) => (b.rceptBgn ?? b.recruitDate ?? '').localeCompare(a.rceptBgn ?? a.recruitDate ?? ''))

    const payload = { updatedAt: new Date().toISOString(), from, regions, items }

    await admin.from('app_cache').upsert({
      key: cacheKey,
      value: JSON.stringify(payload),
      expires_at: Date.now() + CACHE_MS,
    })

    return json({ ...payload, cached: false })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
