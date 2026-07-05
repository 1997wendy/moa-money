import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, CheckCheck, Plus, Trash2, Pencil } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, PageHeader, Empty, Modal, Field, Button, inputCls } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Person, RecurringReceivable } from '../db/types'

interface Item {
  kind: 'once' | 'recur'
  key: string; txId?: string; splitId?: string; recurId?: string
  label: string; sub: string; amount: number; dir: 'in' | 'out'; settled: boolean
}
interface Group { id: string; person: Person; items: Item[]; orphan: boolean }

export default function Receivables() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [sel, setSel] = useState(0)
  const [personModal, setPersonModal] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | undefined>()
  const [recurFor, setRecurFor] = useState<string | null>(null)
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const recurring = useLiveQuery(() => (profileId ? repo.listRecurring(profileId) : []), [profileId], [])

  const itemsByPerson = useMemo(() => {
    const map: Record<string, Item[]> = {}
    for (const t of txs) {
      if (!t.date.startsWith(month)) continue
      for (const s of t.splits) {
        if (!s.owedBy) continue
        ;(map[s.owedBy] ??= []).push({ kind: 'once', key: 'o' + s.id, txId: t.id, splitId: s.id, label: t.merchant, sub: t.date.slice(5).replace('-', '/'), amount: s.amount, dir: s.owedDir ?? 'in', settled: !!s.settled })
      }
    }
    for (const r of recurring) {
      ;(map[r.personId] ??= []).push({ kind: 'recur', key: 'r' + r.id, recurId: r.id, label: r.label, sub: `정기 · 매월 ${r.dayOfMonth}일`, amount: r.amount, dir: r.direction ?? 'in', settled: (r.paidMonths ?? []).includes(month) })
    }
    for (const k in map) map[k].sort((a, b) => Number(a.settled) - Number(b.settled))
    return map
  }, [txs, recurring, month])

  const groups: Group[] = useMemo(() => {
    const orphanIds = Object.keys(itemsByPerson).filter((id) => !people.some((p) => p.id === id))
    return [
      ...people.map((p) => ({ id: p.id, person: p, items: itemsByPerson[p.id] ?? [], orphan: false })),
      ...orphanIds.map((id) => ({ id, person: { id, profileId, name: '(삭제된 상대)', kind: 'other' } as Person, items: itemsByPerson[id], orphan: true })),
    ]
  }, [people, itemsByPerson, profileId])

  const selIdx = Math.min(sel, Math.max(0, groups.length - 1))
  const cur = groups[selIdx]
  const curUnsettled = cur ? cur.items.filter((i) => !i.settled) : []
  const unpaid = (its: Item[]) => its.filter((i) => !i.settled).reduce((s, i) => s + (i.dir === 'in' ? i.amount : -i.amount), 0)

  async function toggle(it: Item) {
    if (it.kind === 'once') {
      const t = txs.find((x) => x.id === it.txId)
      if (!t) return
      await repo.upsertTransaction({ ...t, splits: t.splits.map((s) => (s.id === it.splitId ? { ...s, settled: !s.settled, settledAt: !s.settled ? new Date().toISOString() : null } : s)) })
    } else {
      const r = recurring.find((x) => x.id === it.recurId)
      if (!r) return
      const set = new Set(r.paidMonths ?? [])
      set.has(month) ? set.delete(month) : set.add(month)
      await repo.upsertRecurring({ ...r, paidMonths: Array.from(set) })
    }
  }
  async function settleAll(items: Item[]) { for (const it of items.filter((i) => !i.settled)) await toggle(it) }
  async function delRecur(id?: string) { if (id && confirm('이 정기 항목을 삭제할까요?')) await repo.deleteRecurring(id) }
  async function delPerson(p: Person) {
    if (!confirm(`'${p.name}' 정산 상대를 삭제할까요?`)) return
    for (const r of recurring.filter((x) => x.personId === p.id)) await repo.deleteRecurring(r.id)
    await repo.deletePerson(p.id)
  }

  return (
    <div>
      <PageHeader title="정산" desc="사람별·월별 받을 돈·줄 돈" right={
        <button onClick={() => { setEditPerson(undefined); setPersonModal(true) }} className="text-[13px] font-bold text-white bg-mint rounded-[10px] px-3 py-2 hover:bg-mint-d flex items-center gap-1"><Plus size={15} />상대 추가</button>
      } />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {groups.length === 0 ? (
        <Empty>정산 상대가 없어요.<br />오른쪽 위 ‘상대 추가’로 아빠·엄마·동생 등을 추가하세요.<br /><span className="text-[11px]">추가하면 가계부 거래에서 그 사람을 선택해 정산할 수 있어요.</span></Empty>
      ) : (
        <>
          {/* 사람별 탭 */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
            {groups.map((g, i) => {
              const up = unpaid(g.items)
              return (
                <button key={g.id} onClick={() => setSel(i)} className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-bold border transition-colors flex items-center gap-1.5 ${i === selIdx ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>
                  {g.person.name}
                  {up !== 0 && <span className={`w-1.5 h-1.5 rounded-full ${i === selIdx ? 'bg-white' : 'bg-warn'}`} />}
                </button>
              )
            })}
          </div>

          {cur && <PersonPanel group={cur} onToggle={toggle} onEdit={() => { setEditPerson(cur.person); setPersonModal(true) }} onDelete={() => delPerson(cur.person)} onAddRecur={() => setRecurFor(cur.person.id)} onDelRecur={delRecur} />}
        </>
      )}

      {/* 하단 고정: 전체 정산완료 */}
      {cur && curUnsettled.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[212px] z-20 bg-surface/95 backdrop-blur border-t border-line px-4 md:px-7 py-3">
          <div className="max-w-[1000px] flex items-center gap-3">
            <div className="text-[12px] text-sub">미정산 <b className="text-ink tnum">₩{won(Math.abs(unpaid(cur.items)))}</b></div>
            <button onClick={() => settleAll(cur.items)} className="flex-1 py-2.5 rounded-[10px] bg-mint text-white text-[14px] font-bold flex items-center justify-center gap-1.5 hover:bg-mint-d">
              <CheckCheck size={17} /> {cur.person.name} 전체 정산완료
            </button>
          </div>
        </div>
      )}

      <PersonModal open={personModal} onClose={() => setPersonModal(false)} edit={editPerson} profileId={profileId} />
      <RecurModal open={!!recurFor} onClose={() => setRecurFor(null)} personId={recurFor} profileId={profileId} />
    </div>
  )
}

function PersonPanel({ group, onToggle, onEdit, onDelete, onAddRecur, onDelRecur }: {
  group: Group
  onToggle: (it: Item) => void; onEdit: () => void; onDelete: () => void; onAddRecur: () => void; onDelRecur: (id?: string) => void
}) {
  const { person, items, orphan } = group
  const totalIn = items.filter((i) => i.dir === 'in').reduce((s, i) => s + i.amount, 0)
  const totalOut = items.filter((i) => i.dir === 'out').reduce((s, i) => s + i.amount, 0)
  const unpaidCount = items.filter((i) => !i.settled).length

  return (
    <Card className="mb-24">
      <div className="flex items-start justify-between mb-3">
        <div className="font-bold text-[16px] flex items-center gap-1.5">
          {person.name}
          {!orphan && <button onClick={onEdit} className="text-sub hover:text-ink p-0.5"><Pencil size={14} /></button>}
          {!orphan && <button onClick={onDelete} className="text-sub hover:text-expense p-0.5"><Trash2 size={14} /></button>}
        </div>
        <div className="text-right">
          {totalIn > 0 && <div className="text-[13px]"><span className="text-[11px] text-sub">받을 돈 </span><b className="tnum text-[#c77700]">₩{won(totalIn)}</b></div>}
          {totalOut > 0 && <div className="text-[13px]"><span className="text-[11px] text-sub">줄 돈 </span><b className="tnum text-income">₩{won(totalOut)}</b></div>}
          {totalIn === 0 && totalOut === 0 && <div className="text-[13px] text-sub">내역 없음</div>}
          <div className={`text-[11px] font-bold mt-0.5 ${unpaidCount === 0 && items.length > 0 ? 'text-mint-d' : 'text-warn'}`}>
            {items.length === 0 ? '' : unpaidCount === 0 ? '✔ 정산 완료' : `미정산 ${unpaidCount}건`}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-[13px] text-sub text-center py-3">이 달 정산 내역이 없어요.</div>
      ) : (
        items.map((it) => (
          <div key={it.key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <div className="flex items-center gap-2.5">
              <button onClick={() => onToggle(it)} className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${it.settled ? 'bg-mint border-mint text-white' : 'border-line'}`}>
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
            <div className="flex items-center gap-2">
              <span className="tnum font-bold text-[14px]">{won(it.amount)}</span>
              {it.kind === 'recur' && <button onClick={() => onDelRecur(it.recurId)} className="text-sub hover:text-expense"><Trash2 size={13} /></button>}
            </div>
          </div>
        ))
      )}

      {!orphan && (
        <button onClick={onAddRecur} className="mt-3 w-full py-2 rounded-[10px] border border-line text-sub text-[12.5px] font-bold flex items-center justify-center gap-1 hover:bg-canvas">
          <Plus size={14} /> 정기 항목 추가 (매달 반복)
        </button>
      )}
    </Card>
  )
}

function PersonModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Person; profileId: string }) {
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName(edit ? edit.name : '') }, [open, edit])
  async function save() {
    if (!name.trim()) return
    await repo.upsertPerson({ id: edit?.id ?? uid(), profileId, name: name.trim(), kind: edit?.kind ?? 'other' })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? '정산 상대 수정' : '정산 상대 추가'}>
      <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="예: 아빠 / 엄마 / 동생 이름" className={inputCls} autoFocus /></Field>
      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}

function RecurModal({ open, onClose, personId, profileId }: { open: boolean; onClose: () => void; personId: string | null; profileId: string }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [day, setDay] = useState('1')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  useEffect(() => { if (open) { setLabel(''); setAmount(null); setDay('1'); setDir('in') } }, [open])
  async function save() {
    if (!personId || !label.trim() || !(Number(amount) > 0)) return
    await repo.upsertRecurring({ id: uid(), profileId, personId, label: label.trim(), amount: amount!, dayOfMonth: Math.min(31, Math.max(1, Number(day) || 1)), direction: dir, paidMonths: [] } as RecurringReceivable)
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="정기 항목 추가">
      <p className="text-[12px] text-sub mb-3">매달 반복되는 받을/줄 돈이에요 (예: 관리비, 보험비).</p>
      <Field label="내용"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 관리비" className={inputCls} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="금액"><AmountInput value={amount} onChange={setAmount} /></Field>
        <Field label="매월 며칠"><input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className={inputCls + ' text-right tnum'} /></Field>
      </div>
      <Field label="방향">
        <div className="flex gap-1.5">
          {(['in', 'out'] as const).map((d) => (
            <button key={d} onClick={() => setDir(d)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${dir === d ? (d === 'out' ? 'bg-income text-white border-income' : 'bg-[#c77700] text-white border-[#c77700]') : 'bg-surface text-sub border-line'}`}>{d === 'in' ? '받을 돈' : '줄 돈'}</button>
          ))}
        </div>
      </Field>
      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
