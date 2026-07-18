// 정기 지출 자동 입력 — 앱을 켤 때, 이번 달에 아직 안 넣은 정기 지출을 지정한 날짜가 지났으면 자동 생성
import { useEffect, useRef } from 'react'
import { useProfile } from '../state/profile'
import { repo, uid } from '../db/repository'
import { thisMonth } from '../lib/format'
import type { Transaction } from '../db/types'

export function useRecurringExpenses() {
  const { profileId } = useProfile()
  const ran = useRef('')
  useEffect(() => {
    if (!profileId || ran.current === profileId) return
    ran.current = profileId
    ;(async () => {
      const [list, cards] = await Promise.all([repo.listRecurringExpenses(profileId), repo.listCards(profileId)])
      const ym = thisMonth()
      const now = new Date()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      for (const r of list) {
        if (!r.active || r.lastRun === ym) continue
        const dueDay = Math.min(r.day, daysInMonth) // 31일 지정인데 28일까지면 말일에
        if (now.getDate() < dueDay) continue // 아직 지정 날짜 전이면 다음에
        const card = cards.find((c) => c.id === r.cardId)
        const t: Transaction = {
          id: uid(),
          profileId,
          date: `${ym}-${String(dueDay).padStart(2, '0')}`,
          type: 'expense',
          merchant: r.merchant,
          amount: r.amount,
          cardId: r.cardId ?? null,
          method: card?.name ?? '현금/기타',
          memo: r.memo || undefined,
          splits: [{ id: uid(), category: r.category || '기타', amount: r.amount }],
          createdAt: new Date().toISOString(),
        }
        await repo.upsertTransaction(t)
        await repo.upsertRecurringExpense({ ...r, lastRun: ym })
      }
    })()
  }, [profileId])
}
