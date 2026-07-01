import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, CheckCheck } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, PageHeader, Empty } from '../components/ui'
import type { Person, Transaction } from '../db/types'

interface Item {
  kind: 'once' | 'recur'
  key: string
  txId?: string
  splitId?: string
  recurId?: string
  label: string
  sub: string
  amount: number
  dir: 'in' | 'out'
  settled: boolean
}

export default function Receivables() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const recurring = useLiveQuery(() => (profileId ? repo.listRecurring(profileId) : []), [profileId], [])

  const itemsByPerson = useMemo(() => {
    const map: Record<string, Item[]> = {}
    // 단건 (그 달 거래)
    for (const t of txs) {
      if (!t.date.startsWith(month)) continue
      for (const s of t.splits) {
        if (!s.owedBy) continue
        ;(map[s.owedBy] ??= []).push({
          kind: 'once', key: 'o' + s.id, txId: t.id, splitId: s.id,
          label: t.merchant, sub: t.date.slice(5).replace('-', '/'),
          amount: s.amount, dir: s.owedDir ?? 'in', settled: !!s.settled,
        })
      }
    }
    // 정기 (매달)
    for (const r of recurring) {
      ;(map[r.personId] ??= []).push({
        kind: 'recur', key: 'r' + r.id, recurId: r.id,
        label: r.label, sub: `정기 · 매월 ${r.dayOfMonth}일`,
        amount: r.amount, dir: r.direction ?? 'in',
        settled: (r.paidMonths ?? []).includes(month),
      })
    }
    for (const k in map) map[k].sort((a, b) => Number(a.settled) - Number(b.settled))
    return map
  }, [txs, recurring, month])

  async function toggle(it: Item) {
    if (it.kind === 'once') {
      const t = txs.find((x) => x.id === it.txId)
      if (!t) return
      const updated: Transaction = {
        ...t,
        splits: t.splits.map((s) => (s.id === it.splitId ? { ...s, settled: !s.settled, settledAt: !s.settled ? new Date().toISOString() : null } : s)),
      }
      await repo.upsertTransaction(updated)
    } else {
      const r = recurring.find((x) => x.id === it.recurId)
      if (!r) return
      const set = new Set(r.paidMonths ?? [])
      set.has(month) ? set.delete(month) : set.add(month)
      await repo.upsertRecurring({ ...r, paidMonths: Array.from(set) })
    }
  }

  async function settleAll(items: Item[]) {
    for (const it of items.filter((i) => !i.settled)) await toggle(it)
  }

  return (
    <div>
      <PageHeader title="정산" desc="받을 돈·줄 돈을 사람별·월별로 관리" />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {people.length === 0 && <Empty>정산 상대가 없어요.</Empty>}

      <div className="space-y-3.5">
        {people.map((person) => (
          <PersonCard key={person.id} person={person} items={itemsByPerson[person.id] ?? []} onToggle={toggle} onSettleAll={settleAll} />
        ))}
      </div>
    </div>
  )
}

function PersonCard({
  person, items, onToggle, onSettleAll,
}: {
  person: Person
  items: Item[]
  onToggle: (it: Item) => void
  onSettleAll: (items: Item[]) => void
}) {
  const unpaidIn = items.filter((i) => !i.settled && i.dir === 'in').reduce((s, i) => s + i.amount, 0)
  const unpaidOut = items.filter((i) => !i.settled && i.dir === 'out').reduce((s, i) => s + i.amount, 0)
  const net = unpaidIn - unpaidOut
  const kindEmoji = { dad: '👨', mom: '👩', sibling: '🧑', other: '🙂' }[person.kind]
  const anyUnsettled = items.some((i) => !i.settled)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[15px]">{kindEmoji} {person.name}</div>
        <div className="text-right">
          {net === 0 ? (
            <div className="text-[14px] font-bold text-sub">정산 완료</div>
          ) : net > 0 ? (
            <><div className="text-[11px] text-sub">받을 돈</div><div className="text-[19px] font-extrabold tnum text-[#c77700]">₩{won(net)}</div></>
          ) : (
            <><div className="text-[11px] text-sub">줄 돈</div><div className="text-[19px] font-extrabold tnum text-income">₩{won(-net)}</div></>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <Empty>이 달 정산 내역이 없어요.</Empty>
      ) : (
        <>
          {items.map((it) => (
            <div key={it.key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <div className="flex items-center gap-2.5">
                <button onClick={() => onToggle(it)} className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${it.settled ? 'bg-mint border-mint text-white' : 'border-line'}`} title={it.settled ? '완료' : '미완료'}>
                  {it.settled && <Check size={13} />}
                </button>
                <div>
                  <div className={`text-[13.5px] flex items-center gap-1.5 ${it.settled ? 'line-through text-sub' : 'font-semibold'}`}>
                    {it.kind === 'recur' && <span>🔁</span>}{it.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${it.dir === 'out' ? 'bg-[#e7f0ff] text-income' : 'bg-[#fff1e0] text-[#c77700]'}`}>{it.dir === 'out' ? '줄' : '받을'}</span>
                  </div>
                  <div className="text-[11px] text-sub">{it.sub}</div>
                </div>
              </div>
              <span className="tnum font-bold text-[14px]">{won(it.amount)}</span>
            </div>
          ))}
          {anyUnsettled && (
            <button onClick={() => onSettleAll(items)} className="mt-3 w-full py-2 rounded-[10px] bg-mint-l text-mint-d text-[13px] font-bold flex items-center justify-center gap-1.5 hover:bg-mint hover:text-white transition-colors">
              <CheckCheck size={16} /> 전체 정산완료
            </button>
          )}
        </>
      )}
    </Card>
  )
}
