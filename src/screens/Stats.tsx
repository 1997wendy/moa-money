import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Goal } from '../db/types'

export default function Stats() {
  const { profileId } = useProfile()
  const month = thisMonth()
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const goals = useLiveQuery(() => (profileId ? repo.listGoals(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0)
  const activeGoal = useMemo(
    () => goals.filter((g) => g.effectiveFrom <= month).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0],
    [goals, month],
  )

  // 최근 6개월 순수익
  const months = Array.from({ length: 6 }, (_, i) => addMonth(month, -(5 - i)))
  const monthly = months.map((ym) => {
    let income = 0, expense = 0
    for (const t of txs) {
      if (!t.date.startsWith(ym)) continue
      if (t.type === 'income') income += t.amount
      else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
    }
    return { ym, net: income - expense, income, expense }
  })
  const maxAbs = Math.max(1, ...monthly.map((m) => Math.abs(m.net)))

  // 이번 달 카테고리별 지출
  const catSpend = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of txs) {
      if (t.type !== 'expense' || !t.date.startsWith(month)) continue
      for (const s of t.splits) if (!s.owedBy) map[s.category] = (map[s.category] ?? 0) + s.amount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [txs, month])
  const maxCat = Math.max(1, ...catSpend.map(([, v]) => v))

  const avgNet = monthly.reduce((s, m) => s + m.net, 0) / monthly.length
  const remain = activeGoal ? activeGoal.targetAmount - totalAssets : 0
  const monthsToGoal = activeGoal && avgNet > 0 ? Math.ceil(remain / avgNet) : null
  const eta = monthsToGoal
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsToGoal); return `${d.getFullYear()}년 ${d.getMonth() + 1}월` })()
    : null

  return (
    <div>
      <PageHeader title="통계·목표" desc="자산 흐름과 목표 도달 예측" />

      {/* 목표 */}
      <Card>
        <CardLabel>목표 {activeGoal ? `· ${activeGoal.label ?? compact(activeGoal.targetAmount)}` : ''}</CardLabel>
        {activeGoal ? (
          <div className="grid grid-cols-2 gap-4 items-center">
            <div>
              <div className="text-[22px] font-extrabold">{Math.min(100, Math.round((totalAssets / activeGoal.targetAmount) * 100))}% 달성</div>
              <div className="h-2 rounded-full bg-line overflow-hidden my-2">
                <div className="h-full bg-mint rounded-full" style={{ width: `${Math.min(100, (totalAssets / activeGoal.targetAmount) * 100)}%` }} />
              </div>
              <div className="text-[12px] text-sub">현재 ₩{won(totalAssets)} / 목표 ₩{won(activeGoal.targetAmount)}</div>
            </div>
            <div className="text-[13px]">
              <div className="text-sub">월 평균 순수익</div>
              <div className="font-bold tnum mb-2">{signed(Math.round(avgNet))}</div>
              <div className="text-sub">도달 예상</div>
              <div className="font-bold">{eta ?? '— (순수익 필요)'}</div>
            </div>
          </div>
        ) : (
          <Empty>목표를 추가하면 도달 예측을 보여드려요.</Empty>
        )}
      </Card>

      {/* 월별 순수익 추이 */}
      <Card className="mt-3.5">
        <CardLabel>월별 순수익 추이 (최근 6개월)</CardLabel>
        <div className="flex items-end gap-3 h-[150px] pt-3">
          {monthly.map((m) => (
            <div key={m.ym} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[10px] font-bold tnum mb-1" style={{ color: m.net >= 0 ? '#0e9c8d' : '#e5484d' }}>
                {m.net >= 0 ? '+' : ''}{compact(m.net)}
              </div>
              <div
                className="w-full rounded-t-md"
                style={{ height: `${(Math.abs(m.net) / maxAbs) * 100}%`, background: m.net >= 0 ? '#12b8a6' : '#e5484d', minHeight: 3 }}
              />
              <div className="text-[10.5px] text-sub mt-1">{Number(m.ym.split('-')[1])}월</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 카테고리별 지출 */}
      <Card className="mt-3.5">
        <CardLabel>카테고리별 지출 ({monthLabel(month)})</CardLabel>
        {catSpend.length === 0 ? (
          <Empty>이번 달 지출이 없어요.</Empty>
        ) : (
          catSpend.map(([c, v]) => (
            <div key={c} className="my-1.5">
              <div className="flex justify-between text-[13px] py-0.5">
                <span>{c}</span>
                <span className="tnum font-semibold">{won(v)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div className="h-full rounded-full bg-mint" style={{ width: `${(v / maxCat) * 100}%` }} />
              </div>
            </div>
          ))
        )}
        {catSpend[0] && (
          <div className="mt-3 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 border border-dashed border-mint">
            💡 이번 달 지출 1위는 <b>{catSpend[0][0]}</b> (₩{won(catSpend[0][1])}). 여기서 20%만 줄여도 월 ₩{won(Math.round(catSpend[0][1] * 0.2))} 절약돼요.
          </div>
        )}
      </Card>

      <Fab onClick={() => setModal(true)} label="목표 추가" />
      <GoalModal open={modal} onClose={() => setModal(false)} profileId={profileId} defaultFrom={month} />
    </div>
  )
}

function GoalModal({ open, onClose, profileId, defaultFrom }: { open: boolean; onClose: () => void; profileId: string; defaultFrom: string }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [from, setFrom] = useState(defaultFrom)
  const [targetDate, setTargetDate] = useState('')
  useEffect(() => { if (open) { setLabel(''); setAmount(null); setFrom(defaultFrom); setTargetDate('') } }, [open, defaultFrom])

  async function save() {
    if (!(Number(amount) > 0)) return
    const g: Goal = {
      id: uid(), profileId, targetAmount: amount!,
      targetDate: targetDate || undefined, effectiveFrom: from,
      label: label.trim() || undefined, createdAt: new Date().toISOString(),
    }
    await repo.upsertGoal(g)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="목표 추가 (스냅샷)">
      <p className="text-[12px] text-sub mb-3">‘적용 시작월’부터 이 목표가 적용돼요. 이전 달은 이전 목표 기준으로 그대로 남습니다.</p>
      <Field label="목표 이름"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 2억 만들기" className={inputCls} /></Field>
      <Field label="목표 금액 (원)"><AmountInput value={amount} onChange={setAmount} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="적용 시작월"><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="목표 시점(선택)"><input type="month" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
