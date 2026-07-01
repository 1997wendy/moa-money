import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Empty } from '../components/ui'
import type { Person, Transaction } from '../db/types'

interface Item {
  txId: string
  splitId: string
  date: string
  merchant: string
  category: string
  amount: number
  settled: boolean
}

export default function Receivables() {
  const { profileId } = useProfile()
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const recurring = useLiveQuery(() => (profileId ? repo.listRecurring(profileId) : []), [profileId], [])
  const [showSettled, setShowSettled] = useState(false)

  // 사람별 분할건 수집
  const perPerson = useMemo(() => {
    const map: Record<string, Item[]> = {}
    for (const t of txs) {
      for (const s of t.splits) {
        if (!s.owedBy) continue
        ;(map[s.owedBy] ??= []).push({
          txId: t.id,
          splitId: s.id,
          date: t.date,
          merchant: t.merchant,
          category: s.category,
          amount: s.amount,
          settled: !!s.settled,
        })
      }
    }
    for (const k in map) map[k].sort((a, b) => (a.date < b.date ? 1 : -1))
    return map
  }, [txs])

  async function toggleSettled(txId: string, splitId: string) {
    const t = txs.find((x) => x.id === txId)
    if (!t) return
    const updated: Transaction = {
      ...t,
      splits: t.splits.map((s) =>
        s.id === splitId
          ? { ...s, settled: !s.settled, settledAt: !s.settled ? new Date().toISOString() : null }
          : s,
      ),
    }
    await repo.upsertTransaction(updated)
  }

  const month = thisMonth()

  return (
    <div>
      <PageHeader
        title="받을돈 정산"
        desc="아빠·엄마·동생에게 받을 돈을 사람별로 관리"
        right={
          <label className="text-[12px] text-sub flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} />
            수령완료 포함
          </label>
        }
      />

      {people.length === 0 && <Empty>정산 상대가 없어요.</Empty>}

      <div className="space-y-3.5">
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            items={perPerson[person.id] ?? []}
            recurring={recurring.filter((r) => r.personId === person.id)}
            month={month}
            showSettled={showSettled}
            onToggle={toggleSettled}
          />
        ))}
      </div>
    </div>
  )
}

function PersonCard({
  person, items, recurring, month, showSettled, onToggle,
}: {
  person: Person
  items: Item[]
  recurring: { id: string; label: string; amount: number; dayOfMonth: number }[]
  month: string
  showSettled: boolean
  onToggle: (txId: string, splitId: string) => void
}) {
  const visible = showSettled ? items : items.filter((i) => !i.settled)
  const unpaid = items.filter((i) => !i.settled).reduce((s, i) => s + i.amount, 0)
  const recurringSum = recurring.reduce((s, r) => s + r.amount, 0)
  const totalOwed = unpaid + recurringSum

  // 카테고리별 합계 (아빠에게 보여줄 요약)
  const byCat = useMemo(() => {
    const map: Record<string, number> = {}
    items.filter((i) => showSettled || !i.settled).forEach((i) => (map[i.category] = (map[i.category] ?? 0) + i.amount))
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [items, showSettled])

  const kindEmoji = { dad: '👨', mom: '👩', sibling: '🧑', other: '🙂' }[person.kind]

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[15px]">{kindEmoji} {person.name}</div>
        <div className="text-right">
          <div className="text-[11px] text-sub">받을 돈</div>
          <div className="text-[19px] font-extrabold tnum text-warn">₩{won(totalOwed)}</div>
        </div>
      </div>

      {/* 매달 반복 */}
      {recurring.length > 0 && (
        <div className="mb-3">
          <CardLabel>매달 정기 ({month.split('-')[1]}월)</CardLabel>
          {recurring.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1.5 text-[13px] border-b border-line last:border-0">
              <span>🔁 {r.label} <span className="text-[11px] text-sub">매월 {r.dayOfMonth}일</span></span>
              <span className="tnum font-semibold">{won(r.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 카테고리별 합계 */}
      {byCat.length > 0 && (
        <div className="mb-3 flex gap-2 flex-wrap">
          {byCat.map(([c, v]) => (
            <span key={c} className="text-[11.5px] bg-canvas rounded-full px-2.5 py-1 text-sub">
              {c} <b className="text-ink tnum">{won(v)}</b>
            </span>
          ))}
        </div>
      )}

      {/* 개별 항목 (체크로 수령완료) */}
      {visible.length === 0 && recurring.length === 0 ? (
        <Empty>받을 내역이 없어요.</Empty>
      ) : (
        visible.map((i) => (
          <div key={i.splitId} className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onToggle(i.txId, i.splitId)}
                className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                  i.settled ? 'bg-mint border-mint text-white' : 'border-line'
                }`}
                title={i.settled ? '수령완료' : '미수령'}
              >
                {i.settled && <Check size={13} />}
              </button>
              <div>
                <div className={`text-[13.5px] ${i.settled ? 'line-through text-sub' : 'font-semibold'}`}>{i.merchant}</div>
                <div className="text-[11px] text-sub">{i.date.slice(5).replace('-', '/')} · {i.category}</div>
              </div>
            </div>
            <span className="tnum font-bold text-[14px]">{won(i.amount)}</span>
          </div>
        ))
      )}
    </Card>
  )
}
