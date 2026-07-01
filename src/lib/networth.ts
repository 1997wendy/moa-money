// 순자산 추이(추정) — 현재 총자산에서 월별 순수익을 역산해 과거 순자산 복원(현금흐름 기준)
import type { Transaction } from '../db/types'
import { addMonth } from './format'

export function monthNet(txs: Transaction[], ym: string): number {
  let inc = 0, exp = 0
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue
    if (t.type === 'income') inc += t.amount
    else exp += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }
  return inc - exp
}

export interface TrendPoint { ym: string; net: number; nw: number; pct: number }

/** months: 오름차순 ym 배열(마지막이 현재월). totalNow = 현재 총자산 */
export function netWorthSeries(txs: Transaction[], totalNow: number, months: string[]): TrendPoint[] {
  const nw: Record<string, number> = {}
  const last = months[months.length - 1]
  nw[last] = totalNow
  for (let i = months.length - 1; i > 0; i--) {
    nw[months[i - 1]] = nw[months[i]] - monthNet(txs, months[i])
  }
  return months.map((ym) => {
    const net = monthNet(txs, ym)
    const prevNw = nw[addMonth(ym, -1)] ?? nw[ym] - net
    const pct = prevNw > 0 ? (net / prevNw) * 100 : 0
    return { ym, net, nw: nw[ym] ?? 0, pct }
  })
}
