import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Search, ArrowDownUp, Repeat, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, thisMonth, monthLabel, addMonth } from '../lib/format'
import { betterCardAdvice } from '../lib/cardAdvisor'
import { EXPENSE_CATS } from '../lib/categories'
import { Card, CardLabel, PageHeader, Empty, Fab, inputCls, Modal, Field, Button } from '../components/ui'
import AmountInput from '../components/AmountInput'
import TransactionModal from '../components/TransactionModal'
import type { Card as CardType, RecurringExpense, Transaction } from '../db/types'

type View = 'all' | 'expense' | 'income'

// 정기 지출 기능은 아직 노출 안 함 (나중에 요청 시 true 로)
const RECURRING_ENABLED = false

export default function Ledger() {
  const { profileId, profile } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [view, setView] = useState<View>('all')
  const [cat, setCat] = useState('전체')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Transaction | undefined>()
  const [recModal, setRecModal] = useState(false)

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const prevTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month: addMonth(month, -1) }) : []), [profileId, month], [])
  const people = useLiveQuery(() => (profileId ? repo.listPeople(profileId) : []), [profileId], [])
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])
  const allTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const personName = (id?: string | null) => people.find((p) => p.id === id)?.name

  // 연말정산 소득공제 안내 (올해 누적 · 문턱/예상 공제액/공제 한도)
  const tax = useMemo(() => {
    const salary = profile?.salary ?? 0
    const threshold = salary * 0.25
    if (salary <= 0 || threshold <= 0) return null
    const year = thisMonth().slice(0, 4)
    let credit = 0, checkCash = 0
    for (const t of allTxs) {
      if (t.type !== 'expense' || !t.date.startsWith(year)) continue
      const myCost = t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
      const card = cards.find((c) => c.id === t.cardId)
      if (card?.type === 'credit') credit += myCost
      else checkCash += myCost
    }
    const ytd = credit + checkCash
    if (ytd < threshold) return ytd >= threshold * 0.85 ? { state: 'near' as const, left: threshold - ytd } : null
    // 문턱 초과 → 예상 공제액 (문턱은 공제율 낮은 신용카드부터 차감되는 국세청 방식)
    const creditBase = Math.max(0, credit - threshold) // 신용카드 공제 대상(문턱 초과분)
    const checkBase = Math.max(0, checkCash - Math.max(0, threshold - credit)) // 체크/현금 공제 대상
    const deduction = Math.round(creditBase * 0.15 + checkBase * 0.3)
    const limit = salary <= 70_000_000 ? 3_000_000 : salary <= 120_000_000 ? 2_500_000 : 2_000_000 // 총급여별 기본 공제 한도
    return deduction >= limit
      ? { state: 'maxed' as const, deduction: limit, limit }
      : { state: 'over' as const, deduction, limit }
  }, [profile?.salary, allTxs, cards])

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

  // 목록 필터 (+ 검색)
  const list = useMemo(() => {
    let rows = txs
    if (view === 'expense') rows = rows.filter((t) => t.type === 'expense')
    if (view === 'income') rows = rows.filter((t) => t.type === 'income')
    if (view === 'expense' && cat !== '전체') rows = rows.filter((t) => t.splits.some((s) => s.category === cat))
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter((t) =>
      t.merchant.toLowerCase().includes(q) ||
      (t.memo ?? '').toLowerCase().includes(q) ||
      t.splits.some((s) => s.category.toLowerCase().includes(q)))
    return sort === 'old' ? [...rows].reverse() : rows
  }, [txs, view, cat, search, sort])

  function openAdd() { setEdit(undefined); setModal(true) }
  function openEdit(t: Transaction) { setEdit(t); setModal(true) }

  return (
    <div>
      <PageHeader title="가계부" />

      {/* 연말정산 소득공제 안내 배너 */}
      {tax?.state === 'over' && (
        <div className="mb-4 rounded-[12px] bg-mint-l text-mint-d px-4 py-3">
          <div className="text-[13.5px] font-bold">💳 소득공제 문턱을 넘었어요!</div>
          <div className="text-[12.5px] mt-0.5 leading-relaxed">지금부터는 <b>체크카드·현금영수증(공제 30%)</b>이 신용카드(15%)보다 유리해요.</div>
          <div className="text-[11.5px] mt-1 tnum opacity-80">예상 소득공제 {won(tax.deduction)} / 한도 {won(tax.limit)}</div>
          <div className="text-[11px] mt-1 opacity-80 leading-relaxed">💡 전통시장·대중교통·도서공연은 30~40% <b>추가공제</b>가 별도 한도로 더 있어요.</div>
        </div>
      )}
      {tax?.state === 'maxed' && (
        <div className="mb-4 rounded-[12px] bg-[#eef2f7] text-[#4a5666] border border-line px-4 py-3">
          <div className="text-[13.5px] font-bold">✅ 소득공제 한도({won(tax.limit)})를 다 채웠어요.</div>
          <div className="text-[12.5px] mt-0.5 leading-relaxed">이제 <b>어떤 결제수단으로 써도 소득공제는 더 안 늘어요.</b> 연말정산은 신경 끄고 <b>카드 적립·혜택</b> 위주로 결제하세요.</div>
          <div className="text-[11px] mt-1 opacity-80 leading-relaxed">💡 단, 전통시장·대중교통·도서공연은 별도 한도라 이걸론 더 받을 수 있어요.</div>
        </div>
      )}
      {tax?.state === 'near' && (
        <div className="mb-4 rounded-[12px] bg-[#fff8ee] text-[#b9770a] border border-warn/40 px-4 py-3">
          <div className="text-[13.5px] font-bold">⏳ 소득공제 문턱까지 {won(tax.left)} 남았어요.</div>
          <div className="text-[12.5px] mt-0.5 leading-relaxed">문턱(총급여 25%)을 넘으면 <b>체크·현금</b>이 더 유리해져요. 그 전까진 실적 채우기 좋은 신용카드도 무방해요.</div>
        </div>
      )}

      {/* 월 이동 */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      {/* 모아보기 토글 + 정렬 */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex bg-canvas rounded-[10px] p-1">
          {([['all', '전체'], ['expense', '지출'], ['income', '수입']] as [View, string][]).map(([v, label]) => (
            <button key={v} onClick={() => { setView(v); setCat('전체') }} className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-colors ${view === v ? 'bg-surface shadow-sm text-ink' : 'text-sub'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {RECURRING_ENABLED && (
            <button onClick={() => setRecModal(true)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-sub hover:text-ink px-2 py-1.5 rounded-lg hover:bg-canvas">
              <Repeat size={14} />정기 지출
            </button>
          )}
          <button onClick={() => setSort(sort === 'new' ? 'old' : 'new')} className="flex items-center gap-1.5 text-[12.5px] font-bold text-sub hover:text-ink px-2 py-1.5 rounded-lg hover:bg-canvas">
            <ArrowDownUp size={14} />{sort === 'new' ? '최신순' : '오래된순'}
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="가맹점·메모·카테고리 검색" className={inputCls + ' pl-9'} />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-sub hover:text-ink text-[16px]">×</button>}
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-3 gap-2 md:gap-3.5 mb-4">
        <Card><CardLabel>지출 합계</CardLabel><div className="text-[14px] md:text-[19px] font-extrabold tnum text-expense">-{won(totals.expense)}</div></Card>
        <Card><CardLabel>수입 합계</CardLabel><div className="text-[14px] md:text-[19px] font-extrabold tnum text-income">+{won(totals.income)}</div></Card>
        <Card><CardLabel>순수익</CardLabel><div className="text-[14px] md:text-[19px] font-extrabold tnum">{signed(totals.net)}</div></Card>
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
            const hasIn = t.splits.some((s) => s.owedBy && (s.owedDir ?? 'in') === 'in')
            const hasOut = t.splits.some((s) => s.owedBy && s.owedDir === 'out')
            const myCost = t.type === 'expense' ? t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0) : t.amount
            const hasOwed = hasIn || hasOut
            const advice = betterCardAdvice(t, cards, txs, prevTxs)
            return (
              <div key={t.id} onClick={() => openEdit(t)} className="py-3 border-b border-line last:border-0 cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[14px] font-semibold">{t.merchant}</span>
                      {!isSplit && <span className="text-[11px] px-2 py-0.5 rounded-full bg-canvas text-sub">{t.splits[0].category}</span>}
                      {isSplit && <span className="text-[11px] px-2 py-0.5 rounded-full bg-mint-l text-mint-d font-bold">N분 {t.splits.length}건</span>}
                      {hasIn && <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#fff1e0] text-[#c77700]">받을돈</span>}
                      {hasOut && <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#e7f0ff] text-income">줄돈</span>}
                    </div>
                    <div className="text-[11px] text-sub mt-0.5">
                      {t.date.slice(5).replace('-', '/')}{t.type === 'expense' ? ` · ${t.method ?? '현금/기타'}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[15px] font-bold tnum ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {t.type === 'income' ? '+' : '-'}{won(t.amount)}
                    </div>
                    {t.type === 'expense' && hasOwed && (
                      <div className="text-[11px] text-sub tnum">내 부담 {won(myCost)}</div>
                    )}
                  </div>
                </div>

                {isSplit && (
                  <div className="mt-2 pl-3 border-l-2 border-line space-y-1">
                    {t.splits.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-[12px]">
                        <span className="text-sub">
                          {s.category}
                          {s.owedBy && <span className={s.owedDir === 'out' ? 'text-income font-semibold' : 'text-[#c77700] font-semibold'}> · {personName(s.owedBy)} {s.owedDir === 'out' ? '줄돈' : '받을돈'}</span>}
                        </span>
                        <span className="tnum">{won(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {t.memo && (
                  <div className="mt-2 text-[12px] text-sub bg-canvas rounded-lg px-3 py-1.5">📝 {t.memo}</div>
                )}

                {advice && (
                  <div className="mt-2 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-1.5 border border-dashed border-mint">
                    💡 {advice}
                  </div>
                )}
              </div>
            )
          })
        )}
      </Card>

      <Fab onClick={openAdd} label="거래 추가" />
      <TransactionModal open={modal} onClose={() => setModal(false)} edit={edit} />
      {RECURRING_ENABLED && <RecurringModal open={recModal} onClose={() => setRecModal(false)} profileId={profileId} cards={cards} />}
    </div>
  )
}

// ===== 정기 지출 관리 =====
function RecurringModal({ open, onClose, profileId, cards }: { open: boolean; onClose: () => void; profileId: string; cards: CardType[] }) {
  const list = useLiveQuery(() => (profileId ? repo.listRecurringExpenses(profileId) : []), [profileId], []) ?? []
  const empty = () => ({ merchant: '', amount: null as number | null, category: EXPENSE_CATS[0], cardId: '', day: '1', memo: '' })
  const [f, setF] = useState(empty())
  const [editId, setEditId] = useState<string | null>(null)

  function reset() { setEditId(null); setF(empty()) }
  function startEdit(r: RecurringExpense) {
    setEditId(r.id)
    setF({ merchant: r.merchant, amount: r.amount, category: r.category, cardId: r.cardId ?? '', day: String(r.day), memo: r.memo ?? '' })
  }
  async function save() {
    if (!f.merchant.trim() || !(Number(f.amount) > 0)) return
    const prev = editId ? list.find((x) => x.id === editId) : undefined
    const r: RecurringExpense = {
      id: editId ?? uid(), profileId, merchant: f.merchant.trim(), amount: Number(f.amount),
      category: f.category, cardId: f.cardId || null,
      day: Math.min(31, Math.max(1, Number(f.day) || 1)),
      memo: f.memo.trim() || undefined, active: prev?.active ?? true,
      lastRun: prev?.lastRun, createdAt: prev?.createdAt ?? new Date().toISOString(),
    }
    await repo.upsertRecurringExpense(r)
    reset()
  }

  return (
    <Modal open={open} onClose={onClose} title="정기 지출">
      <div className="text-[12px] text-sub mb-3 leading-relaxed">구독·월세처럼 매달 반복되는 지출이에요. 지정한 날짜가 되면 <b>앱을 열 때 자동으로 가계부에 입력</b>돼요.</div>

      {list.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {list.map((r) => (
            <div key={r.id} className="flex items-center gap-2 border border-line rounded-[10px] px-3 py-2">
              <button onClick={() => repo.upsertRecurringExpense({ ...r, active: !r.active })} className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${r.active ? 'bg-mint' : 'bg-line'}`} title={r.active ? '켜짐' : '꺼짐'}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.active ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <button onClick={() => startEdit(r)} className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold truncate">{r.merchant} <span className="text-sub font-normal">매달 {r.day}일</span></div>
                <div className="text-[11.5px] text-sub tnum">₩{won(r.amount)} · {r.category}{r.cardId ? ` · ${cards.find((c) => c.id === r.cardId)?.name ?? '카드'}` : ' · 현금/기타'}</div>
              </button>
              <button onClick={() => repo.deleteRecurringExpense(r.id)} className="shrink-0 text-sub hover:text-expense p-1"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 폼 */}
      <div className="border-t border-line pt-3">
        <div className="text-[12px] font-bold mb-2">{editId ? '정기 지출 수정' : '정기 지출 추가'}</div>
        <Field label="이름 (가맹점)"><input value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} placeholder="예: 넷플릭스" className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="금액"><AmountInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} placeholder="예: 17,000" /></Field>
          <Field label="매달 며칠"><input type="number" min={1} max={31} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} onWheel={(e) => e.currentTarget.blur()} className={inputCls + ' text-right tnum'} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="카테고리">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inputCls}>
              {EXPENSE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="결제수단">
            <select value={f.cardId} onChange={(e) => setF({ ...f, cardId: e.target.value })} className={inputCls}>
              <option value="">현금/기타</option>
              {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="메모 (선택)"><input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="예: 프리미엄 요금제" className={inputCls} /></Field>
        <div className="flex gap-2 mt-1">
          {editId && <Button variant="line" onClick={reset}>취소</Button>}
          <div className="flex-1" />
          <Button onClick={save}>{editId ? '수정 저장' : '추가'}</Button>
        </div>
      </div>
    </Modal>
  )
}
