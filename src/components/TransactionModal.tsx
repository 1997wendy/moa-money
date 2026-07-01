// 거래 추가/수정
// - 지출: N분 분할 + 전체금액 입력 시 마지막 빈칸 자동계산(초과 시 음수) + 받을/줄 방향
// - 수입: 분할 없음(단일 카테고리)
// - 금액: 실시간 콤마 + 수식(3+3) 입력
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { todayISO, won } from '../lib/format'
import { EXPENSE_CATS, INCOME_CATS } from '../lib/categories'
import type { Split, Transaction, TxType } from '../db/types'
import { Modal, Field, inputCls, Button } from './ui'
import AmountInput from './AmountInput'

interface Props {
  open: boolean
  onClose: () => void
  edit?: Transaction
}

type DraftSplit = {
  id: string
  category: string
  amount: number | null
  owedBy: string
  owedDir: 'in' | 'out'
}

export default function TransactionModal({ open, onClose, edit }: Props) {
  const { profileId } = useProfile()
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])

  const [date, setDate] = useState(todayISO())
  const [type, setType] = useState<TxType>('expense')
  const [merchant, setMerchant] = useState('')
  const [cardId, setCardId] = useState('')
  const [memo, setMemo] = useState('')
  const [total, setTotal] = useState<number | null>(null)
  const [splits, setSplits] = useState<DraftSplit[]>([])
  const [incomeAmt, setIncomeAmt] = useState<number | null>(null)
  const [incomeCat, setIncomeCat] = useState(INCOME_CATS[0])

  const catOptions = type === 'income' ? INCOME_CATS : EXPENSE_CATS

  useEffect(() => {
    if (!open) return
    if (edit) {
      setDate(edit.date)
      setType(edit.type)
      setMerchant(edit.merchant)
      setCardId(edit.cardId ?? '')
      setMemo(edit.memo ?? '')
      setTotal(null)
      if (edit.type === 'income') {
        setIncomeAmt(edit.amount)
        setIncomeCat(edit.splits[0]?.category ?? INCOME_CATS[0])
        setSplits([])
      } else {
        setSplits(edit.splits.map((s) => ({
          id: s.id, category: s.category, amount: s.amount,
          owedBy: s.owedBy ?? '', owedDir: s.owedDir ?? 'in',
        })))
      }
    } else {
      setDate(todayISO())
      setType('expense')
      setMerchant('')
      setCardId('')
      setMemo('')
      setTotal(null)
      setIncomeAmt(null)
      setIncomeCat(INCOME_CATS[0])
      setSplits([{ id: uid(), category: EXPENSE_CATS[0], amount: null, owedBy: '', owedDir: 'in' }])
    }
  }, [open, edit])

  // 자동계산: total 있으면 마지막 빈칸 = total - 나머지 합 (초과 시 음수)
  const nonNullSum = splits.reduce((s, x) => s + (x.amount ?? 0), 0)
  const nullIdxs = splits.map((x, i) => (x.amount == null ? i : -1)).filter((i) => i >= 0)
  const autoIdx = total != null && nullIdxs.length > 0 ? nullIdxs[nullIdxs.length - 1] : -1
  const remaining = total != null ? total - nonNullSum : 0
  const resolved = splits.map((s, i) => (s.amount != null ? s.amount : i === autoIdx ? remaining : null))
  const computedTotal = total ?? splits.reduce((s, x) => s + (x.amount ?? 0), 0)

  const setSplit = (id: string, patch: Partial<DraftSplit>) =>
    setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addSplit = () =>
    setSplits((prev) => [...prev, { id: uid(), category: EXPENSE_CATS[0], amount: null, owedBy: '', owedDir: 'in' }])
  const removeSplit = (id: string) =>
    setSplits((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))

  async function save() {
    if (!merchant.trim()) return
    const card = cards.find((c) => c.id === cardId)
    let finalSplits: Split[] = []
    if (type === 'income') {
      if (!(Number(incomeAmt) > 0)) return
      finalSplits = [{ id: edit?.splits[0]?.id ?? uid(), category: incomeCat, amount: incomeAmt! }]
    } else {
      finalSplits = splits
        .map((s, i) => ({ s, amt: resolved[i] }))
        .filter(({ amt }) => amt != null && amt > 0)
        .map(({ s, amt }) => ({
          id: s.id,
          category: s.category || '기타',
          amount: amt!,
          owedBy: s.owedBy || null,
          owedDir: s.owedBy ? s.owedDir : undefined,
          settled: edit?.splits.find((e) => e.id === s.id)?.settled ?? false,
        }))
      if (finalSplits.length === 0) return
    }
    const t: Transaction = {
      id: edit?.id ?? uid(),
      profileId,
      date,
      type,
      merchant: merchant.trim(),
      amount: finalSplits.reduce((a, s) => a + s.amount, 0),
      cardId: type === 'expense' && cardId ? cardId : null,
      method: type === 'expense' ? card?.name : undefined,
      memo: memo.trim() || undefined,
      betterCardNote: edit?.betterCardNote,
      splits: finalSplits,
      createdAt: edit?.createdAt ?? new Date().toISOString(),
    }
    await repo.upsertTransaction(t)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '거래 수정' : '거래 추가'}>
      <div className="flex gap-2 mb-4">
        {(['expense', 'income'] as TxType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-2 rounded-[10px] text-[13px] font-bold border transition-colors ${
              type === t
                ? t === 'expense' ? 'bg-expense text-white border-expense' : 'bg-income text-white border-income'
                : 'bg-surface text-sub border-line'
            }`}
          >
            {t === 'expense' ? '지출' : '수입'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="날짜">
          <input type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        {type === 'expense' && (
          <Field label="결제수단">
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} className={inputCls}>
              <option value="">현금/기타</option>
              {cards.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </Field>
        )}
      </div>

      <Field label="가맹점 / 내용">
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="예: 스타벅스" className={inputCls} />
      </Field>

      {type === 'income' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="카테고리">
            <select value={incomeCat} onChange={(e) => setIncomeCat(e.target.value)} className={inputCls}>
              {catOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </Field>
          <Field label="금액"><AmountInput value={incomeAmt} onChange={setIncomeAmt} /></Field>
        </div>
      ) : (
        <>
          <Field label="전체 금액 (선택 · 넣으면 마지막 빈칸 자동계산)">
            <AmountInput value={total} onChange={setTotal} placeholder="예: 120,000" />
          </Field>

          <div className="mt-1 mb-1 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-sub">
              내역 {splits.length > 1 && <span className="text-mint-d">· N분 {splits.length}건</span>}
            </span>
            <button onClick={addSplit} className="text-[12px] font-bold text-mint-d flex items-center gap-1">
              <Plus size={13} /> 분할 추가
            </button>
          </div>

          {splits.map((s, i) => (
            <div key={s.id} className="border border-line rounded-[10px] p-2.5 mb-2">
              <div className="flex gap-2 items-center">
                <select value={s.category} onChange={(e) => setSplit(s.id, { category: e.target.value })} className={inputCls + ' flex-1 min-w-0'}>
                  {catOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                {i === autoIdx ? (
                  <div className="w-[112px] shrink-0 border border-line rounded-[10px] px-3 py-2 text-[14px] bg-canvas text-right tnum relative flex items-center justify-end">
                    <span className="absolute left-1.5 text-[9px] font-bold text-mint-d bg-mint-l px-1 rounded">자동</span>
                    <span className={remaining < 0 ? 'text-expense' : ''}>{won(remaining)}</span>
                  </div>
                ) : (
                  <div className="w-[112px] shrink-0">
                    <AmountInput value={resolved[i]} onChange={(v) => setSplit(s.id, { amount: v })} placeholder="금액" />
                  </div>
                )}
                {splits.length > 1 && (
                  <button onClick={() => removeSplit(s.id)} className="text-sub hover:text-expense px-0.5 shrink-0"><Trash2 size={16} /></button>
                )}
              </div>
              {people.length > 0 && (
                <div className="mt-2">
                  <select value={s.owedBy} onChange={(e) => setSplit(s.id, { owedBy: e.target.value })} className={inputCls + ' w-full py-1.5'}>
                    <option value="">정산 없음 (내 지출)</option>
                    {people.map((p) => (<option key={p.id} value={p.id}>{p.name}와 정산</option>))}
                  </select>
                  {s.owedBy && (
                    <div className="flex gap-1.5 mt-1.5">
                      {(['in', 'out'] as const).map((dir) => (
                        <button
                          key={dir}
                          onClick={() => setSplit(s.id, { owedDir: dir })}
                          className={`px-3 py-1 rounded-lg text-[12px] font-bold border transition-colors ${
                            s.owedDir === dir
                              ? dir === 'out' ? 'bg-income text-white border-income' : 'bg-[#c77700] text-white border-[#c77700]'
                              : 'bg-surface text-sub border-line'
                          }`}
                        >
                          {dir === 'in' ? '받을돈' : '줄돈'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className={`text-right text-[13px] font-bold mb-3 tnum ${remaining < 0 && total != null ? 'text-expense' : ''}`}>
            합계 -₩{won(computedTotal)}{remaining < 0 && total != null ? ' · 분할 합이 전체금액 초과!' : ''}
          </div>
        </>
      )}

      <Field label="메모 (선택)">
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="자유 메모" className={inputCls} />
      </Field>

      <div className="flex gap-2 mt-4">
        {edit && (
          <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteTransaction(edit.id); onClose() }}>삭제</Button>
        )}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
