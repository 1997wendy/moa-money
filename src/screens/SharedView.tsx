import { useParams, Link } from 'react-router-dom'
import { useSharedToMe } from '../hooks/useSharedToMe'
import { won, compact, thisMonth, monthLabel } from '../lib/format'
import { krwValue } from '../lib/assets'
import { Card, CardLabel, PageHeader, Empty } from '../components/ui'
import type { Asset, Schedule, Transaction } from '../db/types'

export default function SharedView() {
  const { id } = useParams()
  const { shares, loading } = useSharedToMe()
  const share = shares.find((s) => s.id === id)

  if (loading) return <div className="text-sub text-[13px] py-10 text-center">불러오는 중…</div>
  if (!share) return (
    <div>
      <PageHeader title="공유 뷰" />
      <Empty>공유를 찾을 수 없어요. (로그인 이메일이 공유받은 이메일과 같은지 확인하세요.)<br /><Link to="/" className="text-mint-d font-bold">홈으로</Link></Empty>
    </div>
  )

  const d = share.data as {
    assets?: Asset[]; transactions?: Transaction[]; schedules?: Schedule[]
    cards?: unknown[]; people?: { id: string; name: string }[]
  }
  const perms = share.menu_perms ?? {}
  const show = (k: string) => (perms[k] ?? 'read') !== 'hidden'
  const canEdit = (k: string) => perms[k] === 'edit'

  const assets = d.assets ?? []
  const txs = d.transactions ?? []
  const schedules = d.schedules ?? []
  const people = d.people ?? []
  const month = thisMonth()
  const totalAssets = assets.reduce((s, a) => s + krwValue(a), 0)

  let income = 0, expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue
    if (t.type === 'income') income += t.amount
    else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }

  const EditBadge = ({ k }: { k: string }) => canEdit(k)
    ? <span className="text-[10px] font-bold text-mint-d bg-mint-l px-1.5 py-0.5 rounded ml-1.5">수정 권한(곧 지원)</span>
    : null

  return (
    <div>
      <PageHeader title={`${share.profile_name} (공유)`} desc={`${share.owner_email ?? '소유자'} 님이 공유 · 읽기 전용`} />

      {show('dashboard') && (
        <Card className="mb-3.5">
          <CardLabel>요약</CardLabel>
          <div className="grid grid-cols-3 gap-3">
            <div><div className="text-[11px] text-sub">총 자산</div><div className="text-[18px] font-extrabold tnum">₩{won(totalAssets)}</div></div>
            <div><div className="text-[11px] text-sub">{monthLabel(month)} 수입</div><div className="text-[16px] font-bold tnum text-income">+{won(income)}</div></div>
            <div><div className="text-[11px] text-sub">지출</div><div className="text-[16px] font-bold tnum text-expense">-{won(expense)}</div></div>
          </div>
        </Card>
      )}

      {show('assets') && (
        <Card className="mb-3.5">
          <CardLabel>자산<EditBadge k="assets" /></CardLabel>
          {assets.length === 0 ? <Empty>자산이 없어요.</Empty> : assets.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <span className="text-[13.5px] font-semibold">{a.name}</span>
              <span className="tnum font-bold text-[14px]">{won(krwValue(a))}</span>
            </div>
          ))}
        </Card>
      )}

      {show('ledger') && (
        <Card className="mb-3.5">
          <CardLabel>가계부 · {monthLabel(month)}<EditBadge k="ledger" /></CardLabel>
          {txs.filter((t) => t.date.startsWith(month)).length === 0 ? <Empty>이번 달 거래가 없어요.</Empty> : (
            txs.filter((t) => t.date.startsWith(month)).slice(0, 30).map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <div><span className="text-[13.5px] font-semibold">{t.merchant}</span><span className="text-[11px] text-sub ml-2">{t.date.slice(5).replace('-', '/')}</span></div>
                <span className={`tnum font-bold text-[14px] ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>{t.type === 'income' ? '+' : '-'}{won(t.amount)}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {show('receivables') && (() => {
        const byPerson: Record<string, number> = {}
        for (const t of txs) for (const s of t.splits) if (s.owedBy && !s.settled && (s.owedDir ?? 'in') === 'in') byPerson[s.owedBy] = (byPerson[s.owedBy] ?? 0) + s.amount
        const rows = Object.entries(byPerson)
        return (
          <Card className="mb-3.5">
            <CardLabel>정산 (받을 돈)<EditBadge k="receivables" /></CardLabel>
            {rows.length === 0 ? <Empty>받을 돈이 없어요.</Empty> : rows.map(([pid, amt]) => (
              <div key={pid} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <span className="text-[13.5px] font-semibold">{people.find((p) => p.id === pid)?.name ?? '상대'}</span>
                <span className="tnum font-bold text-[14px] text-[#c77700]">₩{won(amt)}</span>
              </div>
            ))}
          </Card>
        )
      })()}

      {show('calendar') && (
        <Card className="mb-3.5">
          <CardLabel>캘린더 · 일정<EditBadge k="calendar" /></CardLabel>
          {schedules.length === 0 ? <Empty>일정이 없어요.</Empty> : (
            [...schedules].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                <span className="text-[13.5px]">📅 {s.title}</span>
                <span className="text-[12px] text-sub tnum">{s.date.slice(5).replace('-', '/')}{s.time ? ` ${s.time}` : ''}</span>
              </div>
            ))
          )}
        </Card>
      )}

      <div className="text-[11px] text-sub text-center mt-2">이 화면은 <b>읽기 전용</b>이에요. 수정 권한 편집 기능은 다음 업데이트에서 열려요. · 표시 자산 합계 {compact(totalAssets)}</div>
    </div>
  )
}
