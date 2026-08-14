// 청약 일정 — 데이터 호출 + '추첨제 물량' 계산 규칙
//
// [이 파일이 하는 일]
//  1) apply-home Edge Function을 통해 청약홈 분양정보를 가져온다
//  2) 각 평형이 추첨제로 몇 세대 나오는지 계산한다  ← 핵심
//
// [추첨 비율의 근거]
//  '주택공급에 관한 규칙' 제28조. 민영주택 일반공급 1순위에서 경쟁이 있을 때
//  전용면적과 규제지역 종류에 따라 가점제/추첨제 비율이 법으로 정해져 있다.
//  규제지역 여부는 우리가 추측하지 않고 API가 공고마다 알려주는 값(투기과열지구/조정대상지역)을 그대로 쓴다.
//  → 정부가 규제지역을 새로 지정/해제해도 이 코드를 고칠 필요가 없다.
import { supabase } from './supabase'

/** 기본 관심지역 — 설정에서 바꿀 수 있다 */
export const DEFAULT_REGIONS = ['강남구', '서초구', '송파구', '용산구', '마포구', '성동구']

export interface ApplyModel {
  modelNo: string | null
  houseTy: string // 주택형 (예: "059.9400A") — 앞 숫자가 전용면적
  supplyAr: number // 공급면적(전용+공용). 가점제 기준은 전용면적이므로 계산엔 안 씀
  general: number // 일반공급 세대수
  special: number // 특별공급 세대수
  price: number // 분양최고금액 (만원)
}

export interface ApplyItem {
  kind: 'apt' | 'remndr'
  region: string
  id: string
  houseManageNo: string
  pblancNo: string
  name: string
  address: string
  areaName: string | null
  houseKind: string | null
  houseSecd: string | null
  detailKind: string | null
  speclt: string | null // 투기과열지구 Y/N
  mdat: string | null // 조정대상지역 Y/N
  priceCap: string | null // 분양가상한제 Y/N
  recruitDate: string | null
  rceptBgn: string | null
  rceptEnd: string | null
  rank1Bgn: string | null
  rank1End: string | null
  winnerDate: string | null
  contractBgn: string | null
  contractEnd: string | null
  moveIn: string | null
  total: number
  builder: string | null
  owner: string | null
  tel: string | null
  homepage: string | null
  url: string | null
  models: ApplyModel[]
}

export interface ApplyResponse {
  updatedAt: string
  from: string
  regions: string[]
  items: ApplyItem[]
  cached?: boolean
}

/** 규제지역 구분 — 추첨 비율을 정하는 기준 */
export type Zone = 'remndr' | 'speclt' | 'mdat' | 'normal'

export function zoneOf(it: ApplyItem): Zone {
  if (it.kind === 'remndr') return 'remndr' // 무순위/잔여세대는 가점 자체가 없음
  if (it.speclt === 'Y') return 'speclt' // 투기과열지구
  if (it.mdat === 'Y') return 'mdat' // 조정대상지역(청약과열지역)
  return 'normal'
}

export const ZONE_LABEL: Record<Zone, string> = {
  remndr: '무순위·잔여세대',
  speclt: '투기과열지구',
  mdat: '조정대상지역',
  normal: '비규제지역',
}

/** 주택형 문자열에서 전용면적(㎡)을 뽑는다. "059.9400A" → 59.94 */
export function exclusiveArea(houseTy: string): number {
  const m = /[0-9]+(\.[0-9]+)?/.exec(houseTy ?? '')
  return m ? Number(m[0]) : 0
}

export interface Lottery {
  pct: number | null // 추첨 비율 (0~1). null = 공고문을 봐야 알 수 있음
  exact: boolean // true = 법으로 확정된 비율, false = 최소치(공고에 따라 더 높을 수 있음)
  label: string // 화면 표시용 문구
}

/**
 * 전용면적 + 규제지역 종류 → 일반공급 1순위의 추첨제 비율
 * (주택공급에 관한 규칙 제28조)
 */
export function lotteryOf(zone: Zone, area: number): Lottery {
  // 무순위·잔여세대: 가점 개념이 없고 전원 추첨
  if (zone === 'remndr') return { pct: 1, exact: true, label: '추첨 100%' }

  if (zone === 'speclt') {
    // 투기과열지구 — 가점 40% / 70% / 80%
    if (area <= 60) return { pct: 0.6, exact: true, label: '추첨 60%' }
    if (area <= 85) return { pct: 0.3, exact: true, label: '추첨 30%' }
    return { pct: 0.2, exact: true, label: '추첨 20%' }
  }

  if (zone === 'mdat') {
    // 조정대상지역 — 85㎡ 이하는 투기과열지구와 같은 비율.
    // 85㎡ 초과는 공고마다 달라질 수 있어 단정하지 않는다.
    if (area <= 60) return { pct: 0.6, exact: true, label: '추첨 60%' }
    if (area <= 85) return { pct: 0.3, exact: true, label: '추첨 30%' }
    return { pct: null, exact: false, label: '공고문 확인' }
  }

  // 비규제지역 — 85㎡ 초과는 전부 추첨.
  // 85㎡ 이하는 가점 40% '이하'에서 지자체가 공고로 정하므로 추첨이 최소 60%.
  if (area > 85) return { pct: 1, exact: true, label: '추첨 100%' }
  return { pct: 0.6, exact: false, label: '추첨 60% 이상' }
}

export interface ModelCalc extends ApplyModel {
  area: number // 전용면적
  lottery: Lottery
  lotteryUnits: number | null // 추첨으로 나오는 세대수(근사)
}

export interface ItemCalc {
  zone: Zone
  models: ModelCalc[]
  lotteryTotal: number // 추첨 물량 합계
  hasUnknown: boolean // 공고문을 봐야 하는 평형이 섞여 있는지
  smallLottery: number // 60㎡ 이하 추첨 물량 (점수 낮을 때 가장 유리한 구간)
  // 추첨 물량도 무주택자에게 먼저 간다(주택공급규칙 제28조의2). 화면 숫자를 실제보다 후하게 보이지 않게 나눠둔다.
  noHomeFirst: number // 75% — 무주택자 우선
  therest: number // 25% — 무주택 낙첨자 + 1주택 처분조건자 우선, 그 뒤 유주택자
  minPrice: number // 최저 분양가 (만원)
  maxPrice: number
}

/** 공고 하나에 대해 평형별 추첨 물량을 계산 */
export function calcItem(it: ApplyItem): ItemCalc {
  const zone = zoneOf(it)
  const models: ModelCalc[] = it.models.map((m) => {
    const area = exclusiveArea(m.houseTy)
    const lottery = lotteryOf(zone, area)
    // 무순위·잔여세대는 '일반공급 세대수'가 비어 있는 공고가 있다.
    // 이 경우 특별공급 칸 → 평형이 하나뿐이면 공급규모 순으로 대체한다. (전 세대가 추첨이므로 세대수 그 자체가 추첨 물량)
    const base =
      zone === 'remndr' && m.general === 0
        ? (m.special || (it.models.length === 1 ? it.total : 0))
        : m.general
    // 실제 배분 시 소수점 처리는 공고마다 달라 근사치다 → 내림으로 보수적으로 계산
    const lotteryUnits = lottery.pct === null ? null : Math.floor(base * lottery.pct)
    return { ...m, area, lottery, lotteryUnits }
  })
  models.sort((a, b) => a.area - b.area) // 작은 평형 먼저 (추첨에 유리한 순)

  const prices = models.map((m) => m.price).filter((p) => p > 0)
  const total = models.reduce((a, m) => a + (m.lotteryUnits ?? 0), 0)
  // 무순위·잔여세대는 애초에 무주택자만 신청 가능해서 이 배분이 없다
  const noHomeFirst = zone === 'remndr' ? total : Math.floor(total * 0.75)
  return {
    zone,
    models,
    lotteryTotal: total,
    noHomeFirst,
    therest: total - noHomeFirst,
    hasUnknown: models.some((m) => m.lotteryUnits === null),
    smallLottery: models.filter((m) => m.area <= 60).reduce((a, m) => a + (m.lotteryUnits ?? 0), 0),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  }
}

/**
 * 내 청약 조건 — 같은 공고라도 순위와 무주택 여부에 따라 노려볼 수 있는 물량이 완전히 다르다.
 *  rank2        : 세대주가 아니라 규제지역에서 2순위밖에 안 되는 상태
 *  rank1_owned  : 세대주라 1순위지만, 같은 세대에 집이 있어 무주택자가 아닌 상태
 *  rank1_nohome : 세대분리 등으로 1순위 + 무주택세대구성원인 상태
 */
export type ApplyCase = 'rank2' | 'rank1_owned' | 'rank1_nohome'

export const CASE_LABEL: Record<ApplyCase, string> = {
  rank2: '2순위 (세대주 아님)',
  rank1_owned: '1순위 · 세대에 집 있음',
  rank1_nohome: '1순위 · 무주택 세대',
}

export const CASE_DESC: Record<ApplyCase, string> = {
  rank2: '세대주가 아니면 규제지역에서 1순위가 안 됩니다.',
  rank1_owned: '세대주 변경만 한 상태. 무주택자 우선 물량은 대상이 아닙니다.',
  rank1_nohome: '세대분리로 독립한 상태. 추첨 물량 전체가 대상입니다.',
}

export interface MyChance {
  units: number // 내 조건에서 노려볼 수 있는 세대수
  label: string // 화면 표시 문구
  blocked: boolean // 사실상 기회가 없는 상태
}

/** 공고 하나 + 내 조건 → 실제로 노려볼 수 있는 물량 */
export function myChance(c: ItemCalc, myCase: ApplyCase): MyChance {
  // 무순위·잔여세대는 2025년부터 무주택자만 신청할 수 있다
  if (c.zone === 'remndr') {
    return myCase === 'rank1_nohome'
      ? { units: c.lotteryTotal, label: '전원 추첨 대상', blocked: false }
      : { units: 0, label: '무주택자만 신청 가능', blocked: true }
  }

  if (myCase === 'rank2') {
    return { units: 0, label: '1순위에서 마감되면 기회 없음', blocked: true }
  }

  if (myCase === 'rank1_owned') {
    return {
      units: c.therest,
      label: c.therest > 0 ? `최대 ${c.therest}세대 (무주택 낙첨자 뒤)` : '남는 물량이 있어야 가능',
      blocked: c.therest === 0,
    }
  }

  return { units: c.lotteryTotal, label: '추첨 물량 전체가 대상', blocked: false }
}

/** 접수 상태 — 목록 정렬/배지용 */
export type Phase = 'upcoming' | 'open' | 'result' | 'done'

export function phaseOf(it: ApplyItem, today: string): Phase {
  const bgn = it.rceptBgn ?? it.recruitDate
  const end = it.rceptEnd ?? bgn
  if (bgn && today < bgn) return 'upcoming' // 접수 예정
  if (bgn && end && today >= bgn && today <= end) return 'open' // 접수 중
  if (it.winnerDate && today <= it.winnerDate) return 'result' // 발표 대기
  return 'done'
}

export const PHASE_LABEL: Record<Phase, string> = {
  upcoming: '접수 예정',
  open: '접수 중',
  result: '발표 대기',
  done: '종료',
}

/** 만원 단위 금액을 "4억 1,800만" 형태로 (억 미만이면 "6,897만원") */
export function amt(manwon: number): string {
  if (!manwon) return '-'
  const v = Math.round(manwon)
  if (v >= 10000) {
    const e = Math.floor(v / 10000)
    const rest = v % 10000
    return rest ? `${e}억 ${rest.toLocaleString()}만` : `${e}억`
  }
  return `${v.toLocaleString()}만원`
}

export interface PayStep {
  label: string
  pct: number
  amount: number // 만원
  when: string
  note?: string
}

export interface PayPlan {
  steps: PayStep[]
  tax: number // 취득세 (만원)
  taxRate: number
  extraTotal: number // 분양가 외 추가로 드는 돈(취득세)
  bigLoan: boolean // 규제지역 대출 제한에 걸리는 고가 주택인지
}

/**
 * 분양대금 납부 계획(일반적인 예시) — 계약금 20% / 중도금 60%(6회) / 잔금 20%
 * ※ 단지마다 다르다. 정확한 비율은 모집공고문에 나온다.
 */
export function paymentPlan(priceManwon: number, area: number): PayPlan {
  const p = priceManwon
  // 9억 초과 주택 취득세 3% + 지방교육세 0.3% (+ 85㎡ 초과는 농특세 0.2%)
  const taxRate = area > 85 ? 0.035 : 0.033
  return {
    steps: [
      { label: '계약금', pct: 20, amount: p * 0.2, when: '당첨 후 약 1개월 내' },
      { label: '중도금', pct: 60, amount: p * 0.6, when: '공사 기간 중', note: `6회 분납 · 회당 ${amt(p * 0.1)}` },
      { label: '잔금', pct: 20, amount: p * 0.2, when: '입주할 때' },
    ],
    tax: p * taxRate,
    taxRate,
    extraTotal: p * taxRate,
    // 규제지역 15억 초과 주택은 주택담보대출 한도가 크게 줄어든다
    bigLoan: p >= 150000,
  }
}

/** 만원 단위 분양가를 "20.9억" 형태로 */
export function eok(manwon: number): string {
  if (!manwon) return '-'
  const v = manwon / 10000
  return v >= 10 ? `${v.toFixed(1)}억` : `${v.toFixed(2)}억`
}

/** 입주예정월 "202905" → "2029년 5월" */
export function moveInLabel(ym: string | null): string {
  if (!ym || ym.length < 6) return '-'
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`
}

/** Edge Function 호출 */
export async function fetchApplyHome(regions: string[], opts?: { from?: string; refresh?: boolean }): Promise<ApplyResponse | null> {
  try {
    const { data, error } = await supabase.functions.invoke('apply-home', {
      body: { regions, from: opts?.from, refresh: opts?.refresh },
    })
    if (error) return null
    const d = data as ApplyResponse & { error?: string }
    if (!d || d.error || !Array.isArray(d.items)) return null
    return d
  } catch {
    return null
  }
}
