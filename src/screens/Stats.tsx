import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Goal, Transaction } from '../db/types'

/** 그 달의 순수익(수입 - 내 부담 지출) */
function monthNet(txs: Transaction[], ym: string) {
  let income = 0, expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue
    if (t.type === 'income') income += t.amount
    else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }
  return { income, expense, net: income - expense }
}

export default function Stats() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [modal, setModal] = useState(false)
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const goals = useLiveQuery(() => (profileId ? repo.listGoals(profileId) : []), [profileId], [])

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0)
  const now = thisMonth()

  // 순자산 시계열(추정): 현재 총자산에서 이후 순수익을 역산해 과거 순자산 복원 (현금흐름 기준)
  const nw = useMemo(() => {
    const map: Record<string, number> = { [now]: totalAssets }
    let cur = now
    for (let i = 0; i < 24; i++) {
      const prev = addMonth(cur, -1)
      map[prev] = map[cur] - monthNet(txs, cur).net
      cur = prev
    }
    return map
  }, [txs, totalAssets, now])

  const activeGoal = useMemo(
    () =>
      goals
        .filter((g) => g.effectiveFrom <= month)
        .sort((a, b) =>
          a.effectiveFrom !== b.effectiveFrom
            ? a.effectiveFrom < b.effectiveFrom ? 1 : -1
            : a.createdAt < b.createdAt ? 1 : -1,
        )[0],
    [goals, month],
  )

  // 최근 6개월
  const months6 = Array.from({ length: 6 }, (_, i) => addMonth(now, -(5 - i)))
  const series = months6.map((ym) => {
    const n = monthNet(txs, ym)
    const prevNw = nw[addMonth(ym, -1)] ?? 0
    const pct = prevNw > 0 ? (n.net / prevNw) * 100 : 0
    return { ym, ...n, nw: nw[ym] ?? 0, pct }
  })
  const maxNw = Math.max(1, ...series.map((s) => s.nw))

  // 선택월 지표
  const selNet = monthNet(txs, month)
  const selPrevNw = nw[addMonth(month, -1)] ?? 0
  const selPct = selPrevNw > 0 ? (selNet.net / selPrevNw) * 100 : 0
  const selSaveRate = selNet.income > 0 ? (selNet.net / selNet.income) * 100 : 0

  // 연간(YoY)
  const yoyBase = nw[addMonth(now, -12)] ?? 0
  const yoyAmt = totalAssets - yoyBase
  const yoyPct = yoyBase > 0 ? (yoyAmt / yoyBase) * 100 : 0

  // 연도별 순수익 비교 (있는 데이터 기준)
  const years = useMemo(() => {
    const set = new Set<string>()
    txs.forEach((t) => set.add(t.date.slice(0, 4)))
    return Array.from(set).sort().slice(-3).map((y) => {
      let net = 0
      for (let m = 1; m <= 12; m++) net += monthNet(txs, `${y}-${String(m).padStart(2, '0')}`).net
      return { y, net }
    })
  }, [txs])

  // 목표 예측 (선택월 기준 활성 목표)
  const avgNet = series.reduce((s, m) => s + m.net, 0) / (series.length || 1)
  const remain = activeGoal ? activeGoal.targetAmount - totalAssets : 0
  const monthsToGoal = activeGoal && avgNet > 0 ? Math.ceil(remain / avgNet) : null
  const eta = monthsToGoal ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsToGoal); return `${d.getFullYear()}년 ${d.getMonth() + 1}월` })() : null

  // 필요 저축률 역산 (목표 시점 있을 때)
  const need = useMemo(() => {
    if (!activeGoal?.targetDate) return null
    const [ty, tm] = activeGoal.targetDate.split('-').map(Number)
    const monthsLeft = (ty * 12 + (tm - 1)) - (Number(now.slice(0, 4)) * 12 + (Number(now.slice(5)) - 1))
    if (monthsLeft <= 0) return null
    const needMonthly = Math.max(0, remain) / monthsLeft
    const avgIncome = series.reduce((s, m) => s + m.income, 0) / (series.length || 1)
    const rate = avgIncome > 0 ? (needMonthly / avgIncome) * 100 : null
    return { monthsLeft, needMonthly, rate }
  }, [activeGoal, remain, series, now])

  return (
    <div>
      <PageHeader title="통계·목표" desc="자산 흐름·증감률·목표 도달 예측" />

      {/* 월 이동 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-3 gap-3.5">
        <Card>
          <CardLabel>{monthLabel(month)} 자산 증감(추정)</CardLabel>
          <div className={`text-[20px] font-extrabold tnum ${selNet.net >= 0 ? 'text-mint-d' : 'text-expense'}`}>{selNet.net >= 0 ? '+' : ''}{selPct.toFixed(1)}%</div>
          <div className="text-[12px] text-sub tnum">{signed(selNet.net)}</div>
        </Card>
        <Card>
          <CardLabel>연간(YoY) 증감</CardLabel>
          <div className={`text-[20px] font-extrabold tnum ${yoyAmt >= 0 ? 'text-mint-d' : 'text-expense'}`}>{yoyAmt >= 0 ? '+' : ''}{yoyPct.toFixed(1)}%</div>
          <div className="text-[12px] text-sub tnum">{signed(yoyAmt)}</div>
        </Card>
        <Card>
          <CardLabel>{monthLabel(month)} 저축률</CardLabel>
          <div className="text-[20px] font-extrabold tnum">{selSaveRate.toFixed(0)}%</div>
          <div className="text-[12px] text-sub">수입 대비 저축 비율</div>
        </Card>
      </div>

      {/* 목표 */}
      <Card className="mt-3.5">
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
          <Empty>오른쪽 아래 ＋ 로 목표를 추가하면 도달 예측을 보여드려요.</Empty>
        )}
        {need && (
          <div className="mt-3 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 border border-dashed border-mint">
            🎯 목표 시점({activeGoal?.targetDate})까지 {need.monthsLeft}개월 · 매월 <b>₩{won(Math.round(need.needMonthly))}</b>{need.rate != null && <> 저축 필요 (저축률 <b>{need.rate.toFixed(0)}%</b>)</>}
          </div>
        )}
      </Card>

      {/* 순자산 추이 */}
      <Card className="mt-3.5">
        <CardLabel>순자산 추이(추정) · 최근 6개월</CardLabel>
        <div className="flex items-end gap-3 h-[150px] pt-4">
          {series.map((s) => (
            <div key={s.ym} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className={`text-[10px] font-bold tnum mb-1 ${s.pct >= 0 ? 'text-mint-d' : 'text-expense'}`}>{s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%</div>
              <div className="w-full rounded-t-md bg-mint" style={{ height: `${(s.nw / maxNw) * 100}%`, minHeight: 4 }} />
              <div className="text-[10.5px] text-sub mt-1">{Number(s.ym.split('-')[1])}월</div>
              <div className="text-[9.5px] text-sub tnum">{compact(s.nw)}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-sub mt-1">※ 시세 변동 제외, 현금흐름(수입−지출) 기준 추정. 정확한 값은 자산 실시간 시세 연동 후.</div>
      </Card>

      {/* 연도 비교 */}
      {years.length > 0 && (
        <Card className="mt-3.5">
          <CardLabel>연도별 순수익 비교</CardLabel>
          {years.map((yr) => (
            <div key={yr.y} className="flex items-center justify-between py-1.5 border-b border-line last:border-0">
              <span className="text-[13px] font-semibold">{yr.y}년</span>
              <span className={`tnum font-bold ${yr.net >= 0 ? 'text-mint-d' : 'text-expense'}`}>{signed(yr.net)}</span>
            </div>
          ))}
          {years.length >= 2 && (() => {
            const a = years[years.length - 2], b = years[years.length - 1]
            const diff = b.net - a.net
            return <div className="text-[12px] text-sub mt-2">{b.y}년은 {a.y}년보다 {diff >= 0 ? '순수익이 ' : '순수익이 '}<b className={diff >= 0 ? 'text-mint-d' : 'text-expense'}>{signed(diff)}</b> {diff >= 0 ? '더 벌었어요.' : '적어요.'}</div>
          })()}
        </Card>
      )}

      <Fab onClick={() => setModal(true)} label="목표 추가" />
      <GoalModal open={modal} onClose={() => setModal(false)} profileId={profileId} defaultFrom={month} />
    </div>
  )
}

function GoalModal({ open, onClose, profileId, defaultFrom }: { open: boolean; onClose: () => void; profileId: string; defaultFrom: string }) {
  const [amount, setAmount] = useState<number | null>(null)
  const [from, setFrom] = useState(defaultFrom)
  const [targetDate, setTargetDate] = useState('')
  useEffect(() => { if (open) { setAmount(null); setFrom(defaultFrom); setTargetDate('') } }, [open, defaultFrom])

  async function save() {
    if (!(Number(amount) > 0)) return
    const g: Goal = {
      id: uid(), profileId, targetAmount: amount!,
      targetDate: targetDate || undefined, effectiveFrom: from,
      createdAt: new Date().toISOString(),
    }
    await repo.upsertGoal(g)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="목표 추가">
      <p className="text-[12px] text-sub mb-3">‘적용 시작월’부터 이 목표가 적용돼요. 이전 달은 이전 목표 기준으로 그대로 남습니다.</p>
      <Field label="목표 금액 (원)"><AmountInput value={amount} onChange={setAmount} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="적용 시작월"><input type="month" min="2000-01" max="2100-12" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="목표 시점(선택)"><input type="month" min="2000-01" max="2100-12" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
