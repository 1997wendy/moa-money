import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, CheckCheck, Plus, Trash2, Pencil } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, PageHeader, Empty, Fab, Modal, Field, Button, inputCls } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Person, PersonKind, RecurringReceivable } from '../db/types'

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
        ;(map[s.owedBy] ??= []).push({
          kind: 'once', key: 'o' + s.id, txId: t.id, splitId: s.id,
          label: t.merchant, sub: t.date.slice(5).replace('-', '/'),
          amount: s.amount, dir: s.owedDir ?? 'in', settled: !!s.settled,
        })
      }
    }
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
      <PageHeader title="정산" desc="받을 돈·줄 돈을 사람별·월별로 관리" />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {people.length === 0 && (
        <Empty>정산 상대가 없어요.<br />오른쪽 아래 ＋ 로 아빠·엄마·동생 등을 추가하세요.<br /><span className="text-[11px]">추가하면 가계부 거래에서 그 사람을 선택해 정산할 수 있어요.</span></Empty>
      )}

      <div className="space-y-3.5">
        {people.map((person) => (
          <PersonCard
            key={person.id}
            person={person}
            items={itemsByPerson[person.id] ?? []}
            onToggle={toggle}
            onSettleAll={settleAll}
            onEdit={() => { setEditPerson(person); setPersonModal(true) }}
            onDelete={() => delPerson(person)}
            onAddRecur={() => setRecurFor(person.id)}
            onDelRecur={delRecur}
          />
        ))}
      </div>

      <Fab onClick={() => { setEditPerson(undefined); setPersonModal(true) }} label="정산 상대 추가" />
      <PersonModal open={personModal} onClose={() => setPersonModal(false)} edit={editPerson} profileId={profileId} />
      <RecurModal open={!!recurFor} onClose={() => setRecurFor(null)} personId={recurFor} profileId={profileId} />
    </div>
  )
}

function PersonCard({
  person, items, onToggle, onSettleAll, onEdit, onDelete, onAddRecur, onDelRecur,
}: {
  person: Person; items: Item[]
  onToggle: (it: Item) => void; onSettleAll: (items: Item[]) => void
  onEdit: () => void; onDelete: () => void; onAddRecur: () => void; onDelRecur: (id?: string) => void
}) {
  const unpaidIn = items.filter((i) => !i.settled && i.dir === 'in').reduce((s, i) => s + i.amount, 0)
  const unpaidOut = items.filter((i) => !i.settled && i.dir === 'out').reduce((s, i) => s + i.amount, 0)
  const net = unpaidIn - unpaidOut
  const kindEmoji = { dad: '👨', mom: '👩', sibling: '🧑', other: '🙂' }[person.kind]
  const anyUnsettled = items.some((i) => !i.settled)

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-[15px] flex items-center gap-1.5">
          {kindEmoji} {person.name}
          <button onClick={onEdit} className="text-sub hover:text-ink p-0.5"><Pencil size={13} /></button>
          <button onClick={onDelete} className="text-sub hover:text-expense p-0.5"><Trash2 size={13} /></button>
        </div>
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
        <div className="text-[13px] text-sub text-center py-3">이 달 정산 내역이 없어요.</div>
      ) : (
        items.map((it) => (
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
            <div className="flex items-center gap-2">
              <span className="tnum font-bold text-[14px]">{won(it.amount)}</span>
              {it.kind === 'recur' && <button onClick={() => onDelRecur(it.recurId)} className="text-sub hover:text-expense"><Trash2 size={13} /></button>}
            </div>
          </div>
        ))
      )}

      <div className="flex gap-2 mt-3">
        {anyUnsettled && (
          <button onClick={() => onSettleAll(items)} className="flex-1 py-2 rounded-[10px] bg-mint-l text-mint-d text-[13px] font-bold flex items-center justify-center gap-1.5 hover:bg-mint hover:text-white transition-colors">
            <CheckCheck size={16} /> 전체 정산완료
          </button>
        )}
        <button onClick={onAddRecur} className="py-2 px-3 rounded-[10px] border border-line text-sub text-[12.5px] font-bold flex items-center gap-1 hover:bg-canvas">
          <Plus size={14} /> 정기 항목
        </button>
      </div>
    </Card>
  )
}

const KINDS: [PersonKind, string][] = [['dad', '아빠'], ['mom', '엄마'], ['sibling', '동생'], ['other', '기타']]

function PersonModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Person; profileId: string }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PersonKind>('other')
  useEffect(() => {
    if (!open) return
    if (edit) { setName(edit.name); setKind(edit.kind) }
    else { setName(''); setKind('other') }
  }, [open, edit])

  async function save() {
    if (!name.trim()) return
    await repo.upsertPerson({ id: edit?.id ?? uid(), profileId, name: name.trim(), kind })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '정산 상대 수정' : '정산 상대 추가'}>
      <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 아빠 / 엄마 / 동생 이름" className={inputCls} autoFocus /></Field>
      <Field label="분류(아이콘)">
        <div className="flex gap-1.5">
          {KINDS.map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${kind === k ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{l}</button>
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

function RecurModal({ open, onClose, personId, profileId }: { open: boolean; onClose: () => void; personId: string | null; profileId: string }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [day, setDay] = useState('1')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  useEffect(() => { if (open) { setLabel(''); setAmount(null); setDay('1'); setDir('in') } }, [open])

  async function save() {
    if (!personId || !label.trim() || !(Number(amount) > 0)) return
    const r: RecurringReceivable = {
      id: uid(), profileId, personId, label: label.trim(),
      amount: amount!, dayOfMonth: Math.min(31, Math.max(1, Number(day) || 1)),
      direction: dir, paidMonths: [],
    }
    await repo.upsertRecurring(r)
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
