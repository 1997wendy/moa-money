import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, compact, thisMonth, monthLabel } from '../lib/format'
import { Card, CardLabel, PageHeader, Empty } from '../components/ui'

export default function Dashboard() {
  const { profileId } = useProfile()
  const month = thisMonth()

  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const goal = useLiveQuery(() => (profileId ? repo.goalForMonth(profileId, month) : undefined), [profileId, month])
  const schedules = useLiveQuery(() => (profileId ? repo.listSchedules(profileId) : []), [profileId], [])

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0)

  // 이번 달 수입/지출 (받을돈=내 돈 아님 → 지출 통계에서 제외)
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }
  const net = income - expense

  const progress = goal ? Math.min(100, Math.round((totalAssets / goal.targetAmount) * 100)) : 0
  const remain = goal ? goal.targetAmount - totalAssets : 0
  const monthsToGoal = goal && net > 0 ? Math.ceil(remain / net) : null
  const eta = monthsToGoal
    ? (() => {
        const d = new Date()
        d.setMonth(d.getMonth() + monthsToGoal)
        return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
      })()
    : null

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const upcoming = [...schedules]
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => (a.date === b.date ? (a.time ?? '') < (b.time ?? '') ? -1 : 1 : a.date < b.date ? -1 : 1))
    .slice(0, 4)

  // 결제수단 유의 안내 (자동 계산된 회고가 있는 거래)
  const alerts = txs.filter((t) => t.betterCardNote)

  return (
    <div>
      <PageHeader title="대시보드" desc={`${monthLabel(month)} · 한눈에 보는 내 자산`} />

      <div className="grid grid-cols-3 gap-3.5">
        <Card>
          <CardLabel>총 자산</CardLabel>
          <div className="text-[26px] font-extrabold tnum">₩ {won(totalAssets)}</div>
          <div className="text-[12px] text-sub mt-1">{assets.length}개 자산 합산</div>
        </Card>
        <Card>
          <CardLabel>이번 달 수입</CardLabel>
          <div className="text-[24px] font-extrabold tnum text-income">+{won(income)}</div>
        </Card>
        <Card>
          <CardLabel>이번 달 지출</CardLabel>
          <div className="text-[24px] font-extrabold tnum text-expense">-{won(expense)}</div>
          <div className="text-[12px] text-sub mt-1">순수익 {signed(net)}</div>
        </Card>
      </div>

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
            upcoming.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <span className="text-[13.5px]">📅 {s.title}</span>
                <span className="text-[12px] text-sub tnum">{s.date.slice(5).replace('-', '/')}{s.time ? ` ${s.time}` : ''}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card className="mt-3.5">
        <div className="flex items-center justify-between mb-1">
          <CardLabel>⚠️ 결제수단 유의 안내</CardLabel>
          <Link to="/ledger" className="text-[12px] text-mint-d font-bold">가계부 →</Link>
        </div>
        {alerts.length === 0 ? (
          <Empty>잘못 쓴 결제수단이 없어요. 👍<br />(카드 혜택 규칙을 등록하면 더 정확히 알려드려요)</Empty>
        ) : (
          alerts.map((t) => (
            <div key={t.id} className="py-2.5 border-b border-line last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold">{t.merchant}</span>
                <span className="text-[13px] font-bold tnum text-expense">-{won(t.amount)}</span>
              </div>
              <div className="text-[12px] text-[#c77700] mt-0.5">💡 {t.betterCardNote}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
