// 가맹점 기반 "다음엔 이 카드로" 자동 추천 엔진
import { won } from './format'
import type { BenefitRule, Card, Transaction } from '../db/types'

export interface BestPick {
  card: Card
  rule: BenefitRule
  saved: number
}

const norm = (s: string) => s.toLowerCase().replace(/\s/g, '')

/** 규칙의 가맹점 키워드가 거래 가맹점명에 포함되는지 */
export function ruleMatches(rule: BenefitRule, merchant: string): boolean {
  const mm = norm(merchant)
  return rule.merchants.some((k) => k.trim() && mm.includes(norm(k)))
}

/** 규칙 적용 시 이 거래에서 아끼는 금액(건당, 한도 반영) */
export function ruleSaving(rule: BenefitRule, amount: number): number {
  const raw = rule.kind === 'rate' ? (amount * rule.value) / 100 : rule.value
  return Math.round(rule.cap ? Math.min(raw, rule.cap) : raw)
}

/** 이 가맹점·금액에 가장 유리한 카드/규칙 */
export function bestCardFor(merchant: string, amount: number, cards: Card[]): BestPick | null {
  let best: BestPick | null = null
  for (const c of cards) {
    for (const r of c.benefits ?? []) {
      if (!ruleMatches(r, merchant)) continue
      const saved = ruleSaving(r, amount)
      if (!best || saved > best.saved) best = { card: c, rule: r, saved }
    }
  }
  return best && best.saved > 0 ? best : null
}

/** 거래에 대한 "다음엔 이 카드로" 안내 문구 (더 나은 카드가 있을 때만) */
export function adviceFor(tx: Transaction, cards: Card[]): string | null {
  if (tx.type !== 'expense') return null
  const best = bestCardFor(tx.merchant, tx.amount, cards)
  if (!best) return null
  if (best.card.id === tx.cardId) return null // 이미 최적 카드로 결제함
  const rateStr = best.rule.kind === 'rate' ? `${best.rule.value}%` : `건당 ${won(best.rule.value)}원`
  return `${best.card.name}(${best.rule.area} ${rateStr})로 결제했으면 약 ${won(best.saved)}원 아꼈어요.`
}
