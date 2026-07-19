import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { useStockSync } from '../hooks/useStockSync'
import { useKrStockSync } from '../hooks/useKrStockSync'
import { useGoldSync } from '../hooks/useGoldSync'
import { useHoldingSync } from '../hooks/useHoldingSync'
import { useFxSync } from '../hooks/useFxSync'
import { won, signed, compact, thisMonth, monthLabel, todayISO } from '../lib/format'
import { upcomingList } from '../lib/schedule'
import { krwValue, repayableTotal } from '../lib/assets'
import { Card, CardLabel, PageHeader, Empty } from '../components/ui'

export default function Dashboard() {
  const { profileId, profile } = useProfile()
  // 화면 열 때마다 시세·환율 갱신 (총자산 최신 반영)
  useCoinSync(profileId)
  useStockSync(profileId)
  useKrStockSync(profileId)
  useGoldSync(profileId)
  useHoldingSync(profileId)
  useFxSync(profileId)
  const month = thisMonth()

  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId]) // undefined = 로딩중
  const assetList = assets ?? []
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const goal = useLiveQuery(() => (profileId ? repo.goalForMonth(profileId, month) : undefined), [profileId, month])
  const schedules = useLiveQuery(() => (profileId ? repo.listSchedules(profileId) : []), [profileId], [])
  const supports = useLiveQuery(() => (profileId ? repo.listSupports(profileId) : []), [profileId], [])

  // '내 돈만' 기준 (받은 돈 중 돌려줄 돈은 제외) — 대시보드·통계·목표·투자는 모두 내 돈 기준
  const totalAssets = assetList.reduce((s, a) => s + krwValue(a), 0) - repayableTotal(supports)

  // 실제 순자산 추이 — 월별 스냅샷 기록. 이번 달은 현재 총자산으로 갱신
  const recorded = useRef('')
  useEffect(() => {
    if (!profile || assets === undefined) return // 로드 완료 후에만 기록 (0원도 반영)
    const key = `${month}:${totalAssets}`
    if (recorded.current === key) return
    recorded.current = key
    if (profile.netWorthHistory?.[month] === totalAssets) return
    repo.upsertProfile({ ...profile, netWorthHistory: { ...(profile.netWorthHistory ?? {}), [month]: totalAssets } })
  }, [profile, totalAssets, month, assets])

  const history = profile?.netWorthHistory ?? {}
  const merged: Record<string, number> = { ...history }
  if (assets !== undefined) merged[month] = totalAssets // 로드되면 이번 달은 실시간 값(0 포함)
  const trendMonths = Object.keys(merged).filter((m) => m <= month).sort().slice(-6)
  const trend = trendMonths.map((ym) => ({ ym, nw: merged[ym] ?? 0 }))
  const firstNw = trend[0]?.nw ?? 0
  const lastNw = trend[trend.length - 1]?.nw ?? 0
  const trendPct = firstNw > 0 ? ((lastNw - firstNw) / firstNw) * 100 : 0
  // 선 그래프 좌표 (min~max로 스케일해 변화가 보이게)
  const nwVals = trend.map((t) => t.nw)
  const nwLo = nwVals.length ? Math.min(...nwVals) : 0
  const nwHi = nwVals.length ? Math.max(...nwVals) : 0
  const chartX = (i: number) => (trend.length <= 1 ? 50 : 6 + (i / (trend.length - 1)) * 88)
  const chartY = (v: number) => (nwHi === nwLo ? 41 : 12 + (1 - (v - nwLo) / (nwHi - nwLo)) * 58)
  const linePts = trend.map((t, i) => `${chartX(i)},${chartY(t.nw)}`).join(' ')

  // 이번 달 수입/지출 (받을돈=내 돈 아님 → 지출 통계에서 제외)
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }
  const net = income - expense
  // 3개 카드 폰트를 가장 긴 숫자에 맞춰 통일 (숫자 짧으면 크게)
  const bigLen = Math.max(won(totalAssets).length, won(income).length + 1, won(expense).length + 1)
  const bigFs = bigLen >= 14 ? 18 : bigLen >= 11 ? 22 : 26

  const progress = goal ? Math.min(100, Math.floor((totalAssets / goal.targetAmount) * 100)) : 0
  const remain = goal ? goal.targetAmount - totalAssets : 0
  const monthsToGoal = goal && net > 0 ? Math.ceil(remain / net) : null
  const eta = monthsToGoal
    ? (() => {
        const d = new Date()
        d.setMonth(d.getMonth() + monthsToGoal)
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
      })()
    : null

  // 반복·기간 일정까지 펼쳐서 다가오는 일정 4건 (진행 중인 기간일정 포함)
  const upcoming = upcomingList(schedules, todayISO(), 60, 4)

  return (
    <div>
      <PageHeader title="대시보드" desc={monthLabel(month)} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="col-span-2 md:col-span-1">
          <CardLabel>{repayableTotal(supports) > 0 ? '내 돈 (받은 돈 제외)' : '총 자산'}</CardLabel>
          <div className="font-extrabold tnum" style={{ fontSize: bigFs }}>{won(totalAssets)}</div>
        </Card>
        <Card>
          <CardLabel>이번 달 수입</CardLabel>
          <div className="font-extrabold tnum text-income" style={{ fontSize: bigFs }}>+{won(income)}</div>
        </Card>
        <Card>
          <CardLabel>이번 달 지출</CardLabel>
          <div className="font-extrabold tnum text-expense" style={{ fontSize: bigFs }}>-{won(expense)}</div>
          <div className="text-[12px] text-sub mt-1">순수익 {signed(net)}</div>
        </Card>
      </div>

      {/* 순자산 추이 (실제 월별 스냅샷) */}
      <Card className="mt-3.5">
        <div className="flex items-center justify-between">
          <CardLabel>순자산 추이</CardLabel>
          {trend.length >= 2 && <span className={`text-[12px] font-bold tnum ${trendPct >= 0 ? 'text-mint-d' : 'text-expense'}`}>{trendPct >= 0 ? '+' : ''}{trendPct.toFixed(1)}%</span>}
        </div>
        <div className="relative mt-3" style={{ height: 100 }}>
          {trend.length >= 2 && (
            <svg width="100%" height="100" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 pointer-events-none">
              <polyline points={linePts} fill="none" stroke="#12b8a6" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {trend.map((t, i) => (
            <div key={t.ym} className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-mint border-2 border-surface" style={{ left: `${chartX(i)}%`, top: chartY(t.nw) }} title={won(t.nw)} />
          ))}
          {trend.map((t, i) => (
            <div key={t.ym} className="absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: `${chartX(i)}%`, top: 76 }}>
              <div className="text-[10px] text-sub">{Number(t.ym.split('-')[1])}월</div>
              <div className="text-[9.5px] text-sub tnum">{compact(t.nw)}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <Card>
          <CardLabel>목표 {goal ? `· ${goal.label ?? compact(goal.targetAmount)}` : ''}</CardLabel>
          {goal ? (
            <>
              <div className="text-[19px] font-extrabold">{progress}% 달성</div>
              <div className="h-2 rounded-full bg-line overflow-hidden my-2.5">
                <div className="h-full bg-mint rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-[12px] text-sub">
                목표 ₩{won(goal.targetAmount)} · 남은 금액 ₩{won(Math.max(0, remain))}
                {eta && (
                  <>
                    <br />
                    현재 순수익 추세라면 <b className="text-ink">{eta}</b> 도달 예상
                  </>
                )}
              </div>
            </>
          ) : (
            <Empty>
              목표가 없어요. <Link to="/stats" className="text-mint-d font-bold">통계·목표</Link>에서 추가하세요.
            </Empty>
          )}
        </Card>

        <Card>
          <CardLabel>다가오는 일정</CardLabel>
          {upcoming.length === 0 ? (
            <Empty>예정된 일정이 없어요.</Empty>
          ) : (
            upcoming.map((u) => (
              <div key={u.s.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <span className="text-[13.5px] truncate pr-2">📅 {u.s.title}{u.s.repeat && u.s.repeat !== 'none' ? ' 🔁' : ''}</span>
                <span className="text-[12px] text-sub tnum shrink-0">{u.ongoing ? '진행 중' : `${u.date.slice(5).replace('-', '/')}${u.s.time ? ` ${u.s.time}` : ''}`}</span>
              </div>
            ))
          )}
        </Card>
      </div>

    </div>
  )
}
