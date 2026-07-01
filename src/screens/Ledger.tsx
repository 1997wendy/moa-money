import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Empty, Fab } from '../components/ui'
import TransactionModal from '../components/TransactionModal'
import type { Transaction } from '../db/types'

type View = 'all' | 'expense' | 'income'

export default function Ledger() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [view, setView] = useState<View>('all')
  const [cat, setCat] = useState('전체')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Transaction | undefined>()

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const personName = (id?: string | null) => people.find((p) => p.id === id)?.name

  // 합계 (정산=내 돈 아님 → 지출에서 제외)
  const totals = useMemo(() => {
    let income = 0, expense = 0
    for (const t of txs) {
      if (t.type === 'income') income += t.amount
      else expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
    }
    return { income, expense, net: income - expense }
  }, [txs])

  // 지출 카테고리별 합계
  const catTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of txs) {
      if (t.type !== 'expense') continue
      for (const s of t.splits) if (!s.owedBy) map[s.category] = (map[s.category] ?? 0) + s.amount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [txs])

  // 목록 필터
  const list = useMemo(() => {
    let rows = txs
    if (view === 'expense') rows = rows.filter((t) => t.type === 'expense')
    if (view === 'income') rows = rows.filter((t) => t.type === 'income')
    if (view === 'expense' && cat !== '전체') rows = rows.filter((t) => t.splits.some((s) => s.category === cat))
    return rows
  }, [txs, view, cat])

  function openAdd() { setEdit(undefined); setModal(true) }
  function openEdit(t: Transaction) { setEdit(t); setModal(true) }

  return (
    <div>
      <PageHeader title="가계부" desc="모아보고, 카테고리로 나눠보고, 합계를 봐요" />

      {/* 월 이동 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {/* 모아보기 토글 */}
      <div className="flex bg-canvas rounded-[10px] p-1 mb-4 w-fit">
        {([['all', '전체'], ['expense', '지출'], ['income', '수입']] as [View, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => { setView(v); setCat('전체') }}
            className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-colors ${view === v ? 'bg-surface shadow-sm text-ink' : 'text-sub'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <Card><CardLabel>지출 합계</CardLabel><div className="text-[19px] font-extrabold tnum text-expense">-{won(totals.expense)}</div></Card>
        <Card><CardLabel>수입 합계</CardLabel><div className="text-[19px] font-extrabold tnum text-income">+{won(totals.income)}</div></Card>
        <Card><CardLabel>순수익</CardLabel><div className="text-[19px] font-extrabold tnum">{signed(totals.net)}</div></Card>
      </div>

      {/* 지출 모아보기: 카테고리별 그룹 */}
      {view === 'expense' && catTotals.length > 0 && (
        <>
          <div className="flex gap-2 flex-wrap mb-3">
            <button onClick={() => setCat('전체')} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${cat === '전체' ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>전체</button>
            {catTotals.map(([c, v]) => (
              <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${cat === c ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>
                {c} <span className="opacity-70 tnum">{won(v)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 목록 */}
      <Card>
        {list.length === 0 ? (
          <Empty>거래가 없어요. 오른쪽 아래 ＋ 로 입력하세요.</Empty>
        ) : (
          list.map((t) => {
            const isSplit = t.splits.length > 1
            const owedDir = t.splits.find((s) => s.owedBy)?.owedDir ?? 'in'
            const hasOwed = t.splits.some((s) => s.owedBy)
            return (
              <div key={t.id} onClick={() => openEdit(t)} className="py-3 border-b border-line last:border-0 cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold">{t.merchant}</span>
                      {!isSplit && <span className="text-[11px] px-2 py-0.5 rounded-full bg-canvas text-sub">{t.splits[0].category}</span>}
                      {isSplit && <span className="text-[11px] px-2 py-0.5 rounded-full bg-mint-l text-mint-d font-bold">N분 {t.splits.length}건</span>}
                      {hasOwed && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${owedDir === 'out' ? 'bg-[#e7f0ff] text-income' : 'bg-[#fff1e0] text-[#c77700]'}`}>
                          {owedDir === 'out' ? '줄돈' : '받을돈'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-sub mt-0.5">
                      {t.date.slice(5).replace('-', '/')}{t.method ? ` · ${t.method}` : ''}{t.memo ? ` · ${t.memo}` : ''}
                    </div>
                  </div>
                  <span className={`text-[15px] font-bold tnum shrink-0 ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}{won(t.amount)}
                  </span>
                </div>

                {isSplit && (
                  <div className="mt-2 pl-3 border-l-2 border-line space-y-1">
                    {t.splits.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-sub">
                          {s.category}{s.note ? ` · ${s.note}` : ''}
                          {s.owedBy && <span className={s.owedDir === 'out' ? 'text-income font-semibold' : 'text-[#c77700] font-semibold'}> · {personName(s.owedBy)} {s.owedDir === 'out' ? '줄돈' : '받을돈'}</span>}
                        </span>
                        <span className="tnum">{won(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {t.betterCardNote && (
                  <div className="mt-2 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-1.5 border border-dashed border-mint">
                    💡 {t.betterCardNote}
                  </div>
                )}
              </div>
            )
          })
        )}
      </Card>

      <Fab onClick={openAdd} label="거래 추가" />
      <TransactionModal open={modal} onClose={() => setModal(false)} edit={edit} />
    </div>
  )
}
