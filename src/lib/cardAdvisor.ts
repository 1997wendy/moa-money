// 가맹점 기반 "다음엔 이 카드로" 자동 추천 엔진
import { won } from './format'
import type { BenefitRule, BenefitTier, Card, Transaction } from '../db/types'

export interface BestPick {
  card: Card
  rule: BenefitRule
  tier: BenefitTier
  saved: number
}

const norm = (s: string) => s.toLowerCase().replace(/\s/g, '')

// 같은 가맹점의 다른 표기(한글·영문·약칭)를 자동 인식. 한 줄이 하나의 그룹 (모두 소문자·공백제거 기준)
const ALIAS_GROUPS: string[][] = [
  ['지마켓', 'g마켓', 'gmarket'],
  ['쿠팡', 'coupang'],
  ['쿠팡이츠', 'coupangeats'],
  ['11번가', '11st', '십일번가'],
  ['ssg', '쓱', '에스에스지', 'ssg닷컴'],
  ['옥션', 'auction'],
  ['네이버페이', 'npay', 'naverpay', '네이버pay'],
  ['카카오페이', 'kakaopay', '카카오pay'],
  ['스타벅스', 'starbucks', '스벅'],
  ['맥도날드', 'mcdonald', 'mcdonalds', '맥날'],
  ['버거킹', 'burgerking'],
  ['gs25', '지에스25'],
  ['세븐일레븐', '7eleven', 'seven', '세븐일레'],
  ['이마트', 'emart'],
  ['이마트24', 'emart24'],
  ['홈플러스', 'homeplus'],
  ['롯데마트', 'lottemart'],
  ['배달의민족', '배민', 'baemin'],
  ['요기요', 'yogiyo'],
  ['넷플릭스', 'netflix'],
  ['유튜브', 'youtube', '유튜브프리미엄'],
  ['멜론', 'melon'],
  ['cgv', '씨지비'],
  ['롯데시네마', 'lottecinema'],
  ['메가박스', 'megabox'],
  ['올리브영', 'oliveyoung'],
]
// 이 토큰과 같은 뜻으로 취급할 표기들 (별칭 그룹 + 자기 자신)
const aliasSet = (t: string) => ALIAS_GROUPS.find((g) => g.includes(t)) ?? [t]
// keyword가 가맹점명(정규화)에 (별칭 포함) 걸리는지
const termHit = (keyword: string, mmNorm: string) => aliasSet(norm(keyword)).some((a) => mmNorm.includes(a))

const kwHit = (keys: string[] | undefined, merchant: string) => {
  const mm = norm(merchant)
  return (keys ?? []).some((k) => k.trim() && termHit(k, mm))
}

/** 규칙의 가맹점 키워드가 거래 가맹점명에 포함되는지 (표기 별칭 자동 인식).
 *  '!키워드'는 제외(예: "쿠팡, !쿠팡이츠" → 쿠팡은 O, 쿠팡이츠는 X) */
export function ruleMatches(rule: BenefitRule, merchant: string): boolean {
  const mm = norm(merchant)
  const keys = rule.merchants ?? []
  const neg = keys.filter((k) => k.trim().startsWith('!')).map((k) => k.trim().slice(1))
  if (neg.some((k) => k && termHit(k, mm))) return false
  return keys.some((k) => k.trim() && !k.trim().startsWith('!') && termHit(k, mm))
}

/** 혜택 제외 가맹점 (적립·할인 안 됨) */
export const isExcluded = (card: Card, merchant: string) => kwHit(card.excludeMerchants, merchant)
/** 실적 제외 가맹점 (혜택은 되지만 실적에 안 잡힘) */
export const isSpendExcluded = (card: Card, merchant: string) => kwHit(card.excludeFromSpend, merchant)

/** 전월 실적에 해당하는 '특별적립 통합 한도' (0 = 무제한). 기본적립엔 적용 안 됨. */
export function activeSpecialCap(card: Card, prevSpend: number): number {
  const tiers = card.specialCapTiers?.length ? card.specialCapTiers : card.pointCap ? [{ minPrev: 0, cap: card.pointCap }] : []
  const hit = tiers.filter((t) => prevSpend >= (t.minPrev ?? 0)).sort((a, b) => (b.minPrev ?? 0) - (a.minPrev ?? 0))[0]
  return hit?.cap ?? 0
}

/** 규칙의 조건행(구간) 목록. 구버전 데이터(value/min 등)도 정규화. */
export function ruleTiers(rule: BenefitRule): BenefitTier[] {
  if (rule.tiers?.length) return rule.tiers.map((t) => ({ ...t, minPrev: t.minPrev ?? t.min }))
  return [{ value: rule.value ?? 0, minSpend: rule.minSpend, maxCount: rule.maxCount, cap: rule.cap }]
}

export interface EvalCtx {
  amount: number // 이 거래 결제금액 (모르면 Infinity)
  prevSpend: number // 전월 실적 (모르면 Infinity)
  thisSpend: number // 당월 실적 (모르면 Infinity)
}

/** 조건을 모두 충족하는 구간 중 가장 유리한 것 (혜택값 큰 것, 동률이면 전월실적 문턱 큰 것) */
export function pickTier(rule: BenefitRule, ctx: EvalCtx): BenefitTier | null {
  const ok = ruleTiers(rule).filter(
    (t) =>
      (t.value ?? 0) > 0 &&
      ctx.amount >= (t.minSpend ?? 0) &&
      ctx.prevSpend >= (t.minPrev ?? 0) &&
      ctx.thisSpend >= (t.minThisMonth ?? 0),
  )
  if (!ok.length) return null
  return ok.slice().sort((a, b) => b.value - a.value || (b.minPrev ?? 0) - (a.minPrev ?? 0))[0]
}

/** 이 구간값으로 아끼는 원금(건당, 한도 미반영) */
export function tierSaving(kind: 'rate' | 'fixed', value: number, amount: number): number {
  return Math.round(kind === 'rate' ? (amount * value) / 100 : value)
}

/** 이 가맹점·조건에 적용되는 (규칙, 구간): 혜택제외면 null, 특별적립 우선, 없으면 기본적립 */
export function applicable(card: Card, merchant: string, ctx: EvalCtx): { rule: BenefitRule; tier: BenefitTier } | null {
  if (isExcluded(card, merchant)) return null
  for (const r of card.benefits ?? []) {
    if (!ruleMatches(r, merchant)) continue
    const t = pickTier(r, ctx)
    if (t) return { rule: r, tier: t }
  }
  if (card.baseBenefit) {
    const t = pickTier(card.baseBenefit, ctx)
    if (t) return { rule: card.baseBenefit, tier: t }
  }
  return null
}

/** 이 가맹점·금액에 가장 유리한 카드/규칙 (넛지용: 실적 조건은 최상으로 가정) */
export function bestCardFor(merchant: string, amount: number, cards: Card[]): BestPick | null {
  let best: BestPick | null = null
  const ctx = { amount, prevSpend: Infinity, thisSpend: Infinity }
  for (const c of cards) {
    const a = applicable(c, merchant, ctx)
    if (!a) continue
    const saved = tierSaving(a.rule.kind, a.tier.value, amount)
    if (!best || saved > best.saved) best = { card: c, rule: a.rule, tier: a.tier, saved }
  }
  return best && best.saved > 0 ? best : null
}

/** 카드 실적 합계 (혜택/실적 제외 가맹점 제외) */
export function cardSpend(txs: Transaction[], card: Card): number {
  return txs.filter((t) => t.type === 'expense' && t.cardId === card.id && !isExcluded(card, t.merchant) && !isSpendExcluded(card, t.merchant)).reduce((a, t) => a + t.amount, 0)
}

/** 한 규칙의 이번 달 적립 집계 (조건·횟수·금액 한도 반영) */
export function evalRuleMonth(rule: BenefitRule, txs: Transaction[], prevSpend: number, thisSpend: number) {
  const monthTier = pickTier(rule, { amount: Infinity, prevSpend, thisSpend })
  const cap = monthTier?.cap
  const maxCount = monthTier?.maxCount
  let raw = 0, n = 0
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (maxCount && n >= maxCount) break
    const tier = pickTier(rule, { amount: t.amount, prevSpend, thisSpend })
    if (!tier) continue
    const s = tierSaving(rule.kind, tier.value, t.amount)
    if (s > 0) { raw += s; n++ }
  }
  return { used: cap != null ? Math.min(raw, cap) : raw, cap: cap ?? null, tier: monthTier }
}

/** 카드의 이번 달 적립 상태 (기본/특별별 사용액, 통합 사용액) */
export function cardMonthState(card: Card, cardMonthTxs: Transaction[], prevSpend: number, thisSpend: number) {
  const specials = card.benefits ?? []
  const base = card.baseBenefit
  const baseTxs: Transaction[] = []
  const spTxs: Record<string, Transaction[]> = {}
  for (const t of [...cardMonthTxs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (isExcluded(card, t.merchant)) continue
    const sp = specials.find((r) => ruleMatches(r, t.merchant) && pickTier(r, { amount: t.amount, prevSpend, thisSpend }))
    if (sp) (spTxs[sp.id] ??= []).push(t)
    else if (base) baseTxs.push(t)
  }
  const specialUsed: Record<string, number> = {}
  let specialTotal = 0
  for (const r of specials) { const e = evalRuleMonth(r, spTxs[r.id] ?? [], prevSpend, thisSpend); specialUsed[r.id] = e.used; specialTotal += e.used }
  const baseE = base ? evalRuleMonth(base, baseTxs, prevSpend, thisSpend) : null
  return { specialUsed, specialTotal, spCap: activeSpecialCap(card, prevSpend), baseUsed: baseE?.used ?? 0, baseCap: baseE?.cap ?? null }
}

type MonthState = ReturnType<typeof cardMonthState>

/** 이 거래로 카드가 '추가로' 실제 받을 적립 (전월실적·한도·제외 반영). 못 받으면 0. */
export function marginalSaving(card: Card, merchant: string, amount: number, prevSpend: number, thisSpend: number, state: MonthState): number {
  if (card.requiredSpend && prevSpend < card.requiredSpend) return 0 // 전월실적 미달
  const a = applicable(card, merchant, { amount, prevSpend, thisSpend })
  if (!a) return 0
  const s = tierSaving(a.rule.kind, a.tier.value, amount)
  if (a.rule === card.baseBenefit) {
    return state.baseCap != null ? Math.max(0, Math.min(s, state.baseCap - state.baseUsed)) : s
  }
  const catHead = a.tier.cap != null ? a.tier.cap - (state.specialUsed[a.rule.id] ?? 0) : Infinity
  const spHead = state.spCap > 0 ? state.spCap - state.specialTotal : Infinity
  return Math.max(0, Math.min(s, catHead, spHead))
}

/** "다음엔 이 카드로" — 이번 달 한도까지 반영해, 실제로 더 받는 카드가 있을 때만 안내 */
export function betterCardAdvice(tx: Transaction, cards: Card[], monthTxs: Transaction[], prevTxs: Transaction[]): string | null {
  if (tx.type !== 'expense') return null
  // 전월(앞달) 데이터가 통으로 없으면(=그 달 앱 미사용) 실적 조건은 '충족'으로 가정. 데이터가 있으면 실제값 사용.
  const prevEmpty = prevTxs.length === 0
  const ctxOf = (card: Card) => {
    const prevSpend = prevEmpty ? Infinity : cardSpend(prevTxs, card)
    // 이 거래 '시점까지'의 사용분만으로 한도 여유 계산 (이후 결제가 소급 반영되지 않게)
    const priorTxs = monthTxs.filter((x) => x.type === 'expense' && x.cardId === card.id && x.id !== tx.id && x.date <= tx.date)
    const thisSpend = cardSpend(priorTxs, card)
    return { prevSpend, thisSpend, state: cardMonthState(card, priorTxs, prevSpend, thisSpend) }
  }
  const used = cards.find((c) => c.id === tx.cardId)
  const usedEarn = used ? (() => { const { prevSpend, thisSpend, state } = ctxOf(used); return marginalSaving(used, tx.merchant, tx.amount, prevSpend, thisSpend, state) })() : 0
  let best: { card: Card; earn: number; rule: BenefitRule; tier: BenefitTier } | null = null
  for (const c of cards) {
    if (c.id === tx.cardId) continue
    const { prevSpend, thisSpend, state } = ctxOf(c)
    const earn = marginalSaving(c, tx.merchant, tx.amount, prevSpend, thisSpend, state)
    const a = applicable(c, tx.merchant, { amount: tx.amount, prevSpend, thisSpend })
    if (a && (!best || earn > best.earn)) best = { card: c, earn, rule: a.rule, tier: a.tier }
  }
  if (!best || best.earn - usedEarn < 100) return null // 100원 미만 이득이면 안내 안 함
  const rateStr = best.rule.kind === 'rate' ? `${best.tier.value}%` : `건당 ${won(best.tier.value)}원`
  return `${best.card.name}(${best.rule.area} ${rateStr})로 결제했으면 약 ${won(best.earn - usedEarn)}원 더 아꼈어요.`
}
