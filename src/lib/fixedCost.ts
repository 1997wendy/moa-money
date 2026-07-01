// 고정지출·구독 자동 인식 — 같은 가맹점이 여러 달, 비슷한 금액으로 반복되면 정기결제로 추정
import type { Transaction } from '../db/types'

export interface FixedItem {
  merchant: string
  monthly: number
  months: number
  last: string
  next: string
  category: string
}

const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const nextMonthDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  const nd = new Date(y, m, day) // m(0-based)+1 → 다음달
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`
}

export function detectFixed(txs: Transaction[]): FixedItem[] {
  const groups: Record<string, Transaction[]> = {}
  for (const t of txs) {
    if (t.type !== 'expense') continue
    const key = t.merchant.trim()
    if (!key) continue
    ;(groups[key] ??= []).push(t)
  }

  const out: FixedItem[] = []
  for (const [merchant, list] of Object.entries(groups)) {
    const months = new Set(list.map((t) => t.date.slice(0, 7)))
    if (months.size < 2) continue // 최소 2개월 이상 등장
    const amts = list.map((t) => t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)).filter((a) => a > 0)
    if (amts.length < 2) continue
    const med = median(amts)
    if (med <= 0) continue
    const similar = amts.filter((a) => Math.abs(a - med) / med <= 0.25)
    if (similar.length < 2) continue // 비슷한 금액이 2회 이상
    const dates = list.map((t) => t.date).sort()
    const last = dates[dates.length - 1]
    const catCount: Record<string, number> = {}
    list.forEach((t) => t.splits.forEach((s) => (catCount[s.category] = (catCount[s.category] ?? 0) + 1)))
    const category = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타'
    out.push({ merchant, monthly: med, months: months.size, last, next: nextMonthDate(last), category })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}
