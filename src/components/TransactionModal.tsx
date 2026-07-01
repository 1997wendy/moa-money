// 거래 추가/수정 — N분 분할결제·받을돈 지정 지원
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { todayISO } from '../lib/format'
import type { Split, Transaction, TxType } from '../db/types'
import { Modal, Field, inputCls, Button } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  edit?: Transaction
}

type DraftSplit = { id: string; category: string; amount: string; owedBy: string; note: string }

export default function TransactionModal({ open, onClose, edit }: Props) {
  const { profileId } = useProfile()
  const cats = useLiveQuery(() => (profileId ? repo.listCategories(profileId) : []), [profileId], [])
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])

  const [date, setDate] = useState(todayISO())
  const [type, setType] = useState<TxType>('expense')
  const [merchant, setMerchant] = useState('')
  const [cardId, setCardId] = useState('')
  const [betterCardNote, setBetterCardNote] = useState('')
  const [splits, setSplits] = useState<DraftSplit[]>([
    { id: uid(), category: '', amount: '', owedBy: '', note: '' },
  ])

  useEffect(() => {
    if (!open) return
    if (edit) {
      setDate(edit.date)
      setType(edit.type)
      setMerchant(edit.merchant)
      setCardId(edit.cardId ?? '')
      setBetterCardNote(edit.betterCardNote ?? '')
      setSplits(
        edit.splits.map((s) => ({
          id: s.id,
          category: s.category,
          amount: String(s.amount),
          owedBy: s.owedBy ?? '',
          note: s.note ?? '',
        })),
      )
    } else {
      setDate(todayISO())
      setType('expense')
      setMerchant('')
      setCardId('')
      setBetterCardNote('')
      setSplits([{ id: uid(), category: '', amount: '', owedBy: '', note: '' }])
    }
  }, [open, edit])

  const total = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const usableCats = cats.filter((c) => c.kind === type || c.kind === 'both')

  const setSplit = (id: string, patch: Partial<DraftSplit>) =>
    setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addSplit = () =>
    setSplits((prev) => [...prev, { id: uid(), category: '', amount: '', owedBy: '', note: '' }])
  const removeSplit = (id: string) =>
    setSplits((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))

  async function save() {
    if (!merchant.trim() || total <= 0) return
    const finalSplits: Split[] = splits
      .filter((s) => Number(s.amount) > 0)
      .map((s) => ({
        id: s.id,
        category: s.category || (type === 'income' ? '기타수입' : '기타'),
        amount: Number(s.amount),
        owedBy: s.owedBy || null,
        note: s.note || undefined,
        settled: edit?.splits.find((e) => e.id === s.id)?.settled ?? false,
      }))
    const card = cards.find((c) => c.id === cardId)
    const t: Transaction = {
      id: edit?.id ?? uid(),
      profileId,
      date,
      type,
      merchant: merchant.trim(),
      amount: finalSplits.reduce((a, s) => a + s.amount, 0),
      cardId: cardId || null,
      method: card?.name,
      betterCardNote: betterCardNote.trim() || undefined,
      splits: finalSplits,
      createdAt: edit?.createdAt ?? new Date().toISOString(),
    }
    await repo.upsertTransaction(t)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '거래 수정' : '거래 추가'}>
      {/* 수입/지출 토글 */}
      <div className="flex gap-2 mb-4">
        {(['expense', 'income'] as TxType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-2 rounded-[10px] text-[13px] font-bold border transition-colors ${
              type === t
                ? t === 'expense'
                  ? 'bg-expense text-white border-expense'
                  : 'bg-income text-white border-income'
                : 'bg-surface text-sub border-line'
            }`}
          >
            {t === 'expense' ? '지출' : '수입'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="날짜">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="결제수단(카드)">
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} className={inputCls}>
            <option value="">선택 안 함</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="가맹점 / 내용">
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="예: 스타벅스" className={inputCls} />
      </Field>

      {/* 분할 내역 */}
      <div className="mt-1 mb-1 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-sub">
          내역 {splits.length > 1 && <span className="text-mint-d">· N분 분할 {splits.length}건</span>}
        </span>
        <button onClick={addSplit} className="text-[12px] font-bold text-mint-d flex items-center gap-1">
          <Plus size={13} /> 분할 추가
        </button>
      </div>

      {splits.map((s) => (
        <div key={s.id} className="border border-line rounded-[10px] p-2.5 mb-2">
          <div className="flex gap-2">
            <select value={s.category} onChange={(e) => setSplit(s.id, { category: e.target.value })} className={inputCls + ' flex-1'}>
              <option value="">카테고리</option>
              {usableCats.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              inputMode="numeric"
              value={s.amount}
              onChange={(e) => setSplit(s.id, { amount: e.target.value })}
              placeholder="금액"
              className={inputCls + ' w-[110px] text-right tnum'}
            />
            {splits.length > 1 && (
              <button onClick={() => removeSplit(s.id)} className="text-sub hover:text-expense px-1">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {type === 'expense' && people.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-sub">받을 사람</span>
              <select value={s.owedBy} onChange={(e) => setSplit(s.id, { owedBy: e.target.value })} className={inputCls + ' flex-1 py-1.5'}>
                <option value="">없음 (내 지출)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}에게 받을 돈</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}

      <div className="text-right text-[13px] font-bold mb-3 tnum">
        합계 {type === 'income' ? '+' : '-'}₩{total.toLocaleString('ko-KR')}
      </div>

      {type === 'expense' && (
        <Field label='"다음엔 이 카드로" 회고 (선택)'>
          <input
            value={betterCardNote}
            onChange={(e) => setBetterCardNote(e.target.value)}
            placeholder="예: 배달은 신한 딥드림으로 결제할 걸"
            className={inputCls}
          />
        </Field>
      )}

      <div className="flex gap-2 mt-4">
        {edit && (
          <Button
            variant="ghost"
            className="!text-expense"
            onClick={async () => {
              await repo.deleteTransaction(edit.id)
              onClose()
            }}
          >
            삭제
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
