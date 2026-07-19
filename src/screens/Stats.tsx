import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import { krwValue, repayableTotal } from '../lib/assets'
import { EXPENSE_CATS } from '../lib/categories'
import { detectFixed } from '../lib/fixedCost'

const CAT_COLORS = ['#12b8a6', '#5b8def', '#f5a524', '#9b8afb', '#e5484d', '#3fc7b8', '#ec6ea6', '#6bbd6e', '#8b96a3', '#c58af9']
const catColor = (cat: string) => { const i = EXPENSE_CATS.indexOf(cat); return CAT_COLORS[(i < 0 ? EXPENSE_CATS.length : i) % CAT_COLORS.length] }
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
  const { profileId, profile } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [tab, setTab] = useState<'now' | 'trend' | 'goal'>('now')
  const [modal, setModal] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | undefined>()
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId]) // undefined = 로딩중
  const goals = useLiveQuery(() => (profileId ? repo.listGoals(profileId) : []), [profileId], [])
  const supports = useLiveQuery(() => (profileId ? repo.listSupports(profileId) : []), [profileId], [])

  // '내 돈만' 기준 (받은 돈 중 돌려줄 돈 제외)
  const totalAssets = (assets ?? []).reduce((s, a) => s + krwValue(a), 0) - repayableTotal(supports)
  const now = thisMonth()

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

  // 실제 순자산 추이 — 대시보드와 동일(월별 스냅샷). 이번 달은 현재 총자산
  const history = profile?.netWorthHistory ?? {}
  const merged: Record<string, number> = { ...history }
  if (assets !== undefined) merged[now] = totalAssets // 로드되면 이번 달은 실시간 값(0 포함)
  const trendMonths = Object.keys(merged).filter((m) => m <= now).sort().slice(-6)
  const trend = trendMonths.map((ym) => ({ ym, nw: merged[ym] ?? 0 }))
  const nwVals = trend.map((t) => t.nw)
  const nwLo = nwVals.length ? Math.min(...nwVals) : 0
  const nwHi = nwVals.length ? Math.max(...nwVals) : 0
  const chartX = (i: number) => (trend.length <= 1 ? 50 : 6 + (i / (trend.length - 1)) * 88)
  const chartY = (v: number) => (nwHi === nwLo ? 41 : 12 + (1 - (v - nwLo) / (nwHi - nwLo)) * 58)
  const linePts = trend.map((t, i) => `${chartX(i)},${chartY(t.nw)}`).join(' ')
  const trendPct = trend.length >= 2 && trend[0].nw > 0 ? ((trend[trend.length - 1].nw - trend[0].nw) / trend[0].nw) * 100 : 0

  // 이번 달 지표 (실제 가계부 기준)
  const selNet = monthNet(txs, month)
  const selSaveRate = selNet.income > 0 ? (selNet.net / selNet.income) * 100 : 0

  // 이번 달 카테고리별 지출(내 부담) — 많은 순
  const catSpend = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of txs) {
      if (t.type !== 'expense' || !t.date.startsWith(month)) continue
      for (const s of t.splits) if (!s.owedBy) map[s.category] = (map[s.category] ?? 0) + s.amount
    }
    return Object.entries(map).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt)
  }, [txs, month])
  const catTotal = catSpend.reduce((s, c) => s + c.amt, 0)

  // 월별 카테고리 지출 추이 (데이터 있는 달만 표로)
  const catTrend = useMemo(() => {
    const ms = Array.from({ length: 12 }, (_, i) => addMonth(now, -(11 - i)))
    const totalByCat: Record<string, number> = {}
    const cols = ms.map((ym) => {
      const map: Record<string, number> = {}
      for (const t of txs) {
        if (t.type !== 'expense' || !t.date.startsWith(ym)) continue
        for (const s of t.splits) if (!s.owedBy) { map[s.category] = (map[s.category] ?? 0) + s.amount; totalByCat[s.category] = (totalByCat[s.category] ?? 0) + s.amount }
      }
      return { ym, total: Object.values(map).reduce((a, b) => a + b, 0), map }
    }).filter((c) => c.total > 0).slice(-4) // 데이터 있는 달만, 최근 4개까지
    const cats = Object.entries(totalByCat).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([c]) => c)
    return { cols, cats, has: cats.length > 0 }
  }, [txs, now])

  // 월 평균 — '보고 있는 달 이전의 거래 있는 달'만 평균. 진행 중인 선택월은 제외.
  //   → 과거 달을 봐도 그 시점 기준으로 고정됨. 달이 쌓일수록 그만큼만 평균에 반영.
  const dataMonths = Array.from(new Set(txs.map((t) => t.date.slice(0, 7)))).filter((m) => m < month).sort()
  const avgMonths = dataMonths.length
  const avgOf = (key: 'net' | 'income') => (avgMonths > 0 ? dataMonths.reduce((s, m) => s + monthNet(txs, m)[key], 0) / avgMonths : 0)
  const avgNet = avgOf('net')

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

  // 목표 예측 (활성 목표)
  const remain = activeGoal ? activeGoal.targetAmount - totalAssets : 0
  const monthsToGoal = activeGoal && avgNet > 0 ? Math.ceil(remain / avgNet) : null
  const etaFar = monthsToGoal != null && monthsToGoal > 1200 // 100년 초과 → 예측 무의미
  const eta = monthsToGoal != null && !etaFar
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() + monthsToGoal); return `${d.getFullYear()}년 ${d.getMonth() + 1}월` })()
    : null

  // 필요 저축률 역산 (목표 시점 있을 때)
  const need = (() => {
    if (!activeGoal?.targetDate) return null
    const [ty, tm] = activeGoal.targetDate.split('-').map(Number)
    const monthsLeft = (ty * 12 + (tm - 1)) - (Number(month.slice(0, 4)) * 12 + (Number(month.slice(5)) - 1))
    if (monthsLeft <= 0) return null
    const needMonthly = Math.max(0, remain) / monthsLeft
    const avgInc = avgOf('income')
    const rate = avgInc > 0 ? (needMonthly / avgInc) * 100 : null
    return { monthsLeft, needMonthly, rate }
  })()

  const fixed = useMemo(() => detectFixed(txs), [txs])
  const fixedTotal = fixed.reduce((s, f) => s + f.monthly, 0)

  // 이번달 / 지난달 / 작년 같은 달 비교
  const cmp = [
    { label: '이번 달', ...monthNet(txs, month) },
    { label: '지난 달', ...monthNet(txs, addMonth(month, -1)) },
    { label: '작년 같은 달', ...monthNet(txs, addMonth(month, -12)) },
  ]
  const pctVs = (cur: number, base: number) => (base > 0 ? ((cur - base) / base) * 100 : null)

  return (
    <div>
      <PageHeader title="통계·목표" />

      {/* 월 이동 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      <div className="flex bg-canvas rounded-[10px] p-1 mb-4 w-fit">
        {([['now', '이번 달'], ['trend', '추이·연도'], ['goal', '목표']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-colors ${tab === k ? 'bg-surface shadow-sm text-ink' : 'text-sub'}`}>{l}</button>
        ))}
      </div>

      {tab === 'now' && (<>
      <Card className="mb-3.5">
        <CardLabel>📝 {monthLabel(month)} 회고</CardLabel>
        <MonthMemo profileId={profileId} month={month} />
      </Card>

      {/* 핵심 지표 (실제 가계부 기준) */}
      <div className="grid grid-cols-2 gap-2 md:gap-3.5">
        <Card>
          <CardLabel>{monthLabel(month)} 순수익</CardLabel>
          <div className={`text-[18px] md:text-[22px] font-extrabold tnum ${selNet.net >= 0 ? 'text-mint-d' : 'text-expense'}`}>{signed(selNet.net)}</div>
        </Card>
        <Card>
          <CardLabel>{monthLabel(month)} 저축률</CardLabel>
          <div className="text-[18px] md:text-[22px] font-extrabold tnum">{selSaveRate.toFixed(0)}%</div>
        </Card>
      </div>

      {/* 이번달 / 지난달 / 작년 같은 달 비교 */}
      <Card className="mt-3.5">
        <CardLabel>기간 비교</CardLabel>
        <table className="w-full text-[12.5px] mt-1">
          <thead><tr className="text-sub text-left border-b border-line">
            <th className="py-1.5">구분</th>
            {cmp.map((c) => <th key={c.label} className="text-right">{c.label}</th>)}
          </tr></thead>
          <tbody>
            {([['지출', 'expense'], ['수입', 'income'], ['순수익', 'net']] as const).map(([label, key]) => (
              <tr key={key} className="border-b border-line last:border-0">
                <td className="py-2 font-semibold">{label}</td>
                {cmp.map((c, i) => {
                  const v = c[key]
                  const p = i === 0 ? pctVs(v, cmp[1][key]) : null
                  const color = key === 'expense' ? 'text-expense' : key === 'income' ? 'text-income' : v >= 0 ? 'text-mint-d' : 'text-expense'
                  return (
                    <td key={i} className={`text-right tnum ${i === 0 ? 'font-bold ' + color : 'text-sub'}`}>
                      {won(v)}
                      {i === 0 && p != null && <div className="text-[10px] font-normal text-sub">지난달비 {p >= 0 ? '+' : ''}{p.toFixed(0)}%</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 카테고리별 지출 */}
      <Card className="mt-3.5">
        <CardLabel>{monthLabel(month)} 카테고리별 지출{catTotal > 0 ? ` · ₩${won(catTotal)}` : ''}</CardLabel>
        {catSpend.length === 0 ? (
          <Empty>이번 달 지출 내역이 없어요.</Empty>
        ) : (
          catSpend.map((c) => {
            const pct = catTotal > 0 ? (c.amt / catTotal) * 100 : 0
            return (
              <div key={c.cat} className="py-1.5">
                <div className="flex items-baseline justify-between text-[13px] mb-1">
                  <span className="font-semibold">{c.cat}</span>
                  <span className="tnum text-sub">₩{won(c.amt)} <span className="text-[11px]">· {pct.toFixed(0)}%</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-mint rounded-full" style={{ width: `${pct}%` }} /></div>
              </div>
            )
          })
        )}
      </Card>
      </>)}

      {tab === 'goal' && (
      <Card className="mt-3.5">
        <div className="flex items-center justify-between">
          <CardLabel>목표 {activeGoal ? `· ${activeGoal.label ?? compact(activeGoal.targetAmount)}` : ''}</CardLabel>
          {activeGoal && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => { setEditGoal(activeGoal); setModal(true) }} className="text-sub hover:text-ink p-1" title="목표 수정"><Pencil size={14} /></button>
              <button onClick={async () => {
                if (!confirm(`${monthLabel(month)}부터의 목표를 삭제할까요? (이전 달 목표는 유지)`)) return
                for (const g of goals.filter((x) => x.id === activeGoal.id || x.effectiveFrom > month)) await repo.deleteGoal(g.id)
              }} className="text-sub hover:text-expense p-1" title="목표 삭제"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
        {activeGoal ? (
          <div className="grid grid-cols-2 gap-4 items-center">
            <div>
              <div className="text-[22px] font-extrabold">{Math.min(100, Math.floor((totalAssets / activeGoal.targetAmount) * 100))}% 달성</div>
              <div className="h-2 rounded-full bg-line overflow-hidden my-2">
                <div className="h-full bg-mint rounded-full" style={{ width: `${Math.min(100, (totalAssets / activeGoal.targetAmount) * 100)}%` }} />
              </div>
              <div className="text-[12px] text-sub">현재 ₩{won(totalAssets)} / 목표 ₩{won(activeGoal.targetAmount)}</div>
            </div>
            <div className="text-[13px]">
              <div className="text-sub">월 평균 순수익 <span className="text-[10px]">{avgMonths > 0 ? `(${avgMonths}개월 평균)` : '(데이터 부족)'}</span></div>
              <div className="font-bold tnum mb-2">{avgMonths > 0 ? signed(Math.round(avgNet)) : '—'}</div>
              <div className="text-sub">도달 예상</div>
              <div className="font-bold">{eta ?? (etaFar ? '목표가 커서 예측 어려움' : avgMonths === 0 ? '완료된 달 데이터 필요' : avgNet <= 0 ? '순수익이 있어야 예측 가능' : '—')}</div>
            </div>
          </div>
        ) : (
          <Empty>오른쪽 아래 ＋ 로 목표를 추가하면 도달 예측을 보여드려요.</Empty>
        )}
        {need && (
          <div className="mt-3 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 border border-dashed border-mint">
            🎯 목표 시점({activeGoal?.targetDate})까지 {need.monthsLeft}개월 · 매월 <b>₩{won(Math.round(need.needMonthly))}</b> 저축 필요
            {need.rate != null && (need.rate > 500 ? <span className="text-expense"> — 지금 소득 대비 목표가 너무 큽니다</span> : <> (저축률 <b>{need.rate.toFixed(0)}%</b>)</>)}
          </div>
        )}
      </Card>
      )}

      {tab === 'trend' && (<>
      <Card className="mt-3.5">
        <div className="flex items-center justify-between">
          <CardLabel>순자산 추이</CardLabel>
          {trend.length >= 2 && <span className={`text-[12px] font-bold tnum ${trendPct >= 0 ? 'text-mint-d' : 'text-expense'}`}>{trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}%</span>}
        </div>
        <div className="relative mt-3" style={{ height: 110 }}>
          {trend.length >= 2 && (
            <svg width="100%" height="110" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 pointer-events-none">
              <polyline points={linePts} fill="none" stroke="#12b8a6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {trend.map((t, i) => (
            <div key={t.ym} className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-mint border-2 border-surface" style={{ left: `${chartX(i)}%`, top: `${chartY(t.nw)}%` }} title={won(t.nw)} />
          ))}
          {trend.map((t, i) => (
            <div key={t.ym} className="absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: `${chartX(i)}%`, top: 84 }}>
              <div className="text-[10px] text-sub">{Number(t.ym.split('-')[1])}월</div>
              <div className="text-[9.5px] text-sub tnum">{compact(t.nw)}</div>
            </div>
          ))}
        </div>
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

      {/* 월별 카테고리 지출 추이 (표) */}
      <Card className="mt-3.5">
        <CardLabel>월별 카테고리 지출</CardLabel>
        {!catTrend.has ? (
          <Empty>지출 데이터가 쌓이면 카테고리별 월 추이를 보여드려요.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12.5px] mt-1">
              <thead>
                <tr className="text-sub border-b border-line">
                  <th className="text-left py-1.5 px-1 font-semibold">카테고리</th>
                  {catTrend.cols.map((c) => <th key={c.ym} className="text-right px-1 whitespace-nowrap">{Number(c.ym.split('-')[1])}월</th>)}
                </tr>
              </thead>
              <tbody>
                {catTrend.cats.map((cat) => (
                  <tr key={cat} className="border-b border-line last:border-0">
                    <td className="py-2 px-1 font-semibold whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: catColor(cat) }} />{cat}</td>
                    {catTrend.cols.map((c) => {
                      const v = c.map[cat] ?? 0
                      return <td key={c.ym} className={`text-right px-1 tnum ${v ? '' : 'text-sub'}`}>{v ? compact(v) : '·'}</td>
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold">
                  <td className="py-2 px-1">합계</td>
                  {catTrend.cols.map((c) => <td key={c.ym} className="text-right px-1 tnum">{compact(c.total)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 고정지출·구독 자동 인식 */}
      <Card className="mt-3.5">
        <CardLabel>🔁 고정지출·구독{fixed.length > 0 ? ` · 월 ₩${won(fixedTotal)}` : ''}</CardLabel>
        {fixed.length === 0 ? (
          <Empty>매달 반복되는 결제가 아직 안 보여요. (2개월 이상 쌓이면 자동 인식)</Empty>
        ) : (
          fixed.map((f) => (
            <div key={f.merchant} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <div>
                <div className="text-[13.5px] font-semibold">{f.merchant} <span className="text-[11px] text-sub font-normal">{f.category}</span></div>
                <div className="text-[11px] text-sub">{f.months}개월째 · 다음 예상 {f.next.slice(5).replace('-', '/')}</div>
              </div>
              <span className="tnum font-bold text-[14px] text-expense">-{won(f.monthly)}/월</span>
            </div>
          ))
        )}
        {fixed.length > 0 && <div className="text-[11px] text-sub mt-2">💡 안 쓰는 구독이 있다면 여기서 정리 대상을 찾아보세요.</div>}
      </Card>
      </>)}

      {tab === 'goal' && <Fab onClick={() => { setEditGoal(undefined); setModal(true) }} label="목표 추가" />}
      <GoalModal open={modal} onClose={() => setModal(false)} profileId={profileId} defaultFrom={month} edit={editGoal} />
    </div>
  )
}

function GoalModal({ open, onClose, profileId, defaultFrom, edit }: { open: boolean; onClose: () => void; profileId: string; defaultFrom: string; edit?: Goal }) {
  const [amount, setAmount] = useState<number | null>(null)
  const [from, setFrom] = useState(defaultFrom)
  const [targetDate, setTargetDate] = useState('')
  useEffect(() => {
    if (!open) return
    // 수정도 '보고 있는 달(적용 시작월)부터' 반영 — 값만 채우고 시작월은 선택월로
    if (edit) { setAmount(edit.targetAmount); setFrom(defaultFrom); setTargetDate(edit.targetDate ?? '') }
    else { setAmount(null); setFrom(defaultFrom); setTargetDate('') }
  }, [open, defaultFrom, edit])

  async function save() {
    if (!(Number(amount) > 0)) return
    // 수정인데 시작월이 원래와 같으면 그 목표를 갱신, 다르면 그 달부터 새 버전(이전 달은 유지)
    const sameStart = edit && edit.effectiveFrom === from
    const g: Goal = {
      id: sameStart ? edit.id : uid(), profileId, targetAmount: amount!,
      targetDate: targetDate || undefined, effectiveFrom: from,
      createdAt: sameStart ? edit.createdAt : new Date().toISOString(),
    }
    await repo.upsertGoal(g)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '목표 수정' : '목표 추가'}>
      <p className="text-[12px] text-sub mb-3">‘적용 시작월’부터 이 목표가 적용돼요. 이전 달은 이전 목표 기준으로 그대로 남습니다.</p>
      <Field label="목표 금액 (원)"><AmountInput value={amount} onChange={setAmount} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="적용 시작월"><input type="month" min="2000-01" max="2100-12" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="목표 시점(선택)"><input type="month" min="2000-01" max="2100-12" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}

function MonthMemo({ profileId, month }: { profileId: string; month: string }) {
  const note = useLiveQuery(() => (profileId ? repo.getMonthNote(profileId, month) : undefined), [profileId, month])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(note?.content ?? '') }, [note, editing, month])
  return (
    <textarea
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setEditing(false); repo.upsertMonthNote(profileId, month, text) }}
      placeholder="이번 달 뭘 잘했고, 뭘 아쉬웠나요? 다음 달엔 뭘 바꿀지… (칸 밖 누르면 자동 저장)"
      className={inputCls + ' h-28 resize-none leading-relaxed'}
    />
  )
}
