import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { Card, CardLabel, PageHeader, Button, Empty } from '../components/ui'
import TransactionModal from '../components/TransactionModal'
import type { Transaction } from '../db/types'

export default function Ledger() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [cat, setCat] = useState('전체')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Transaction | undefined>()

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const personName = (id?: string | null) => people.find((p) => p.id === id)?.name

  // 이번 달 등장한 카테고리 목록
  const catList = useMemo(() => {
    const set = new Set<string>()
    txs.forEach((t) => t.splits.forEach((s) => set.add(s.category)))
    return ['전체', ...Array.from(set)]
  }, [txs])

  // 필터 적용
  const filtered = useMemo(() => {
    if (cat === '전체') return txs
    return txs.filter((t) => t.splits.some((s) => s.category === cat))
  }, [txs, cat])

  // 합계 (받을돈 split 은 내 지출에서 제외)
  const totals = useMemo(() => {
    let income = 0, expense = 0
    for (const t of txs) {
      for (const s of t.splits) {
        if (cat !== '전체' && s.category !== cat) continue
        if (t.type === 'income') income += s.amount
        else if (!s.owedBy) expense += s.amount
      }
    }
    return { income, expense, net: income - expense }
  }, [txs, cat])

  function openAdd() {
    setEdit(undefined)
    setModal(true)
  }
  function openEdit(t: Transaction) {
    setEdit(t)
    setModal(true)
  }

  return (
    <div>
      <PageHeader
        title="가계부"
        desc="카테고리로 필터하고 합계를 봐요"
        right={<Button onClick={openAdd}><Plus size={15} className="inline -mt-0.5 mr-1" />추가</Button>}
      />

      {/* 월 이동 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub">
          <ChevronLeft size={18} />
        </button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 flex-wrap mb-4">
        {catList.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
              cat === c ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line hover:bg-canvas'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-3 gap-3.5 mb-4">
        <Card>
          <CardLabel>{cat === '전체' ? '지출 합계' : `${cat} 지출`}</CardLabel>
          <div className="text-[19px] font-extrabold tnum text-expense">-{won(totals.expense)}</div>
        </Card>
        <Card>
          <CardLabel>수입 합계</CardLabel>
          <div className="text-[19px] font-extrabold tnum text-income">+{won(totals.income)}</div>
        </Card>
        <Card>
          <CardLabel>순수익</CardLabel>
          <div className="text-[19px] font-extrabold tnum">{signed(totals.net)}</div>
        </Card>
      </div>

      {/* 거래 목록 */}
      <Card>
        {filtered.length === 0 ? (
          <Empty>거래가 없어요. 오른쪽 위 ‘추가’로 입력하세요.</Empty>
        ) : (
          filtered.map((t) => {
            const isSplit = t.splits.length > 1
            return (
              <div
                key={t.id}
                onClick={() => openEdit(t)}
                className="py-3 border-b border-line last:border-0 cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold">{t.merchant}</span>
                      {!isSplit && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-canvas text-sub">{t.splits[0].category}</span>
                      )}
                      {isSplit && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-mint-l text-mint-d font-bold">N분 {t.splits.length}건</span>
                      )}
                      {t.splits.some((s) => s.owedBy) && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#fff1e0] text-[#c77700] font-bold">받을돈</span>
                      )}
                    </div>
                    <div className="text-[11px] text-sub mt-0.5">
                      {t.date.slice(5).replace('-', '/')}{t.method ? ` · ${t.method}` : ''}
                    </div>
                  </div>
                  <span className={`text-[15px] font-bold tnum shrink-0 ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}{won(t.amount)}
                  </span>
                </div>

                {/* 분할 상세 */}
                {isSplit && (
                  <div className="mt-2 pl-3 border-l-2 border-line space-y-1">
                    {t.splits.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-sub">
                          {s.category}{s.note ? ` · ${s.note}` : ''}
                          {s.owedBy && <span className="text-[#c77700] font-semibold"> · {personName(s.owedBy)} 받을돈</span>}
                        </span>
                        <span className="tnum">{won(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* "다음엔 이 카드로" 회고 */}
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

      {/* 모바일용 FAB */}
      <button
        onClick={openAdd}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-mint text-white shadow-lg flex items-center justify-center hover:bg-mint-d transition-colors"
        aria-label="거래 추가"
      >
        <Plus size={26} />
      </button>

      <TransactionModal open={modal} onClose={() => setModal(false)} edit={edit} />
    </div>
  )
}
