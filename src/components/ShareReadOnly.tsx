// 공유받은 데이터를 읽기 전용으로 그리는 공용 화면.
// 이메일 공유(SharedView)와 비밀 URL 공유(PublicShareView)가 함께 쓴다.
import { won, thisMonth, monthLabel } from '../lib/format'
import { krwValue } from '../lib/assets'
import { Card, CardLabel, Empty } from './ui'
import type { MenuPerms } from '../lib/sharing'
import type { Asset, Schedule, Transaction } from '../db/types'

export interface SharedData {
  assets?: Asset[]
  transactions?: Transaction[]
  schedules?: Schedule[]
  people?: { id: string; name: string }[]
}

export default function ShareReadOnly({
  data, perms, badge,
}: {
  data: SharedData
  perms: MenuPerms
  /** 메뉴 이름 옆에 붙일 뱃지 (이메일 공유의 '수정 권한' 표시용 · 비밀 URL에선 없음) */
  badge?: (menuKey: string) => React.ReactNode
}) {
  const show = (k: string) => (perms[k] ?? 'read') !== 'hidden'

  const assets = data.assets ?? []
  const txs = data.transactions ?? []
  const schedules = data.schedules ?? []
  const people = data.people ?? []
  const month = thisMonth()
  const totalAssets = assets.reduce((s, a) => s + krwValue(a), 0)

  let income = 0, expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue
    if (t.type === 'income') income += t.amount
    else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }

  const Badge = ({ k }: { k: string }) => <>{badge?.(k) ?? null}</>

  return (
    <>
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
          <CardLabel>자산<Badge k="assets" /></CardLabel>
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
          <CardLabel>가계부 · {monthLabel(month)}<Badge k="ledger" /></CardLabel>
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
            <CardLabel>정산 (받을 돈)<Badge k="receivables" /></CardLabel>
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
          <CardLabel>캘린더 · 일정<Badge k="calendar" /></CardLabel>
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
    </>
  )
}

/** 표시된 자산 합계 (하단 안내문구용) */
export const shareTotalAssets = (data: SharedData) => (data.assets ?? []).reduce((s, a) => s + krwValue(a), 0)
