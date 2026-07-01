import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, monthLabel } from '../lib/format'
import { ruleMatches, ruleSaving } from '../lib/cardAdvisor'
import { Card as Box, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { BenefitRule, Card, Transaction } from '../db/types'

export default function Cards() {
  const { profileId, profile } = useProfile()
  const month = thisMonth()
  const year = month.slice(0, 4)
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])
  const monthTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const allTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Card | undefined>()

  const spendByCard = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of monthTxs) {
      if (t.type !== 'expense' || !t.cardId) continue
      map[t.cardId] = (map[t.cardId] ?? 0) + t.amount
    }
    return map
  }, [monthTxs])

  return (
    <div>
      <PageHeader title="카드혜택" desc={`${monthLabel(month)} 실적·한도 진행률 · 규칙 직접 입력`} />

      {cards.length === 0 && <Empty>오른쪽 아래 ＋ 로 카드·혜택 규칙을 등록하세요.</Empty>}

      <div className="grid grid-cols-2 gap-3.5">
        {cards.map((c) => {
          const spend = spendByCard[c.id] ?? 0
          const req = c.requiredSpend ?? 0
          const reqPct = req ? Math.min(100, (spend / req) * 100) : 0
          const metReq = req > 0 && spend >= req
          const cardMonthTxs = monthTxs.filter((t) => t.type === 'expense' && t.cardId === c.id)
          return (
            <Box key={c.id}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-[15px] flex items-center gap-1.5">
                  {c.name}
                  {c.type && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${c.type === 'credit' ? 'bg-[#e7f0ff] text-income' : 'bg-mint-l text-mint-d'}`}>{c.type === 'credit' ? '신용' : '체크'}</span>}
                </div>
                <button onClick={() => { setEdit(c); setModal(true) }} className="text-[12px] text-sub hover:text-ink">수정</button>
              </div>

              {req > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[12.5px]"><span>월 실적</span><span className="tnum">{won(spend)} / {won(req)} {metReq && '✔'}</span></div>
                  <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${reqPct}%`, background: metReq ? '#12b8a6' : '#f5a524' }} />
                  </div>
                  {!metReq && <div className="text-[11px] text-sub mt-1">실적까지 {won(req - spend)} 남음</div>}
                </div>
              )}

              {/* 영역별 혜택 + 이번 달 소진 */}
              <div className="mt-3 space-y-2">
                {(c.benefits ?? []).length === 0 && <div className="text-[12px] text-sub">등록된 혜택 규칙이 없어요.</div>}
                {(c.benefits ?? []).map((r) => {
                  const used = cardMonthTxs.filter((t) => ruleMatches(r, t.merchant)).reduce((a, t) => a + ruleSaving(r, t.amount), 0)
                  const cappedUsed = r.cap ? Math.min(used, r.cap) : used
                  const full = r.cap ? cappedUsed >= r.cap : false
                  return (
                    <div key={r.id}>
                      <div className="flex justify-between text-[12px]">
                        <span className="font-semibold">{r.area} <span className="text-sub font-normal">{r.kind === 'rate' ? `${r.value}%` : `건당 ${won(r.value)}원`}</span></span>
                        <span className="tnum text-sub">{won(cappedUsed)}{r.cap ? ` / ${won(r.cap)}` : ''}</span>
                      </div>
                      {r.cap ? (
                        <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (cappedUsed / r.cap) * 100)}%`, background: full ? '#e5484d' : '#12b8a6' }} />
                        </div>
                      ) : null}
                      {full && <div className="text-[11px] text-expense mt-0.5">한도 소진! 이 영역은 다른 카드로.</div>}
                    </div>
                  )
                })}
              </div>
            </Box>
          )
        })}
      </div>

      <YearEndCard profile={profile} allTxs={allTxs} cards={cards} year={year} onSalary={async (v) => { if (profile) await repo.upsertProfile({ ...profile, salary: v ?? undefined }) }} />

      <Fab onClick={() => { setEdit(undefined); setModal(true) }} label="카드 추가" />
      <CardModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} />
    </div>
  )
}

function YearEndCard({
  profile, allTxs, cards, year, onSalary,
}: {
  profile?: { salary?: number }
  allTxs: Transaction[]
  cards: Card[]
  year: string
  onSalary: (v: number | null) => void
}) {
  const salary = profile?.salary ?? 0
  const threshold = salary * 0.25

  const { credit, checkCash } = useMemo(() => {
    let credit = 0, checkCash = 0
    const typeOf = (t: Transaction) => {
      if (!t.cardId) return 'cash'
      return cards.find((c) => c.id === t.cardId)?.type ?? 'credit'
    }
    for (const t of allTxs) {
      if (t.type !== 'expense' || !t.date.startsWith(year)) continue
      const myCost = t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
      if (typeOf(t) === 'credit') credit += myCost
      else checkCash += myCost
    }
    return { credit, checkCash }
  }, [allTxs, cards, year])

  const totalSpend = credit + checkCash
  const overThreshold = salary > 0 && totalSpend > threshold

  return (
    <Box className="mt-3.5">
      <CardLabel>🗓️ {year} 연말정산</CardLabel>
      <div className="flex items-end gap-3 mb-3">
        <Field label="연 총급여 (원)">
          <div className="w-[200px]"><AmountInput value={salary || null} onChange={onSalary} placeholder="예: 50,000,000" /></div>
        </Field>
      </div>
      {salary > 0 ? (
        <>
          <div className="text-[13px] text-sub mb-2">
            공제 문턱(총급여의 25%) = <b className="text-ink tnum">₩{won(threshold)}</b> · 올해 사용액 <b className="text-ink tnum">₩{won(totalSpend)}</b>
          </div>
          <div className="h-2 rounded-full bg-line overflow-hidden mb-2">
            <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(100, threshold ? (totalSpend / threshold) * 100 : 0)}%` }} />
          </div>
          <div className="flex gap-2 text-[12px] mb-2">
            <span className="bg-canvas rounded-full px-2.5 py-1">신용 <b className="tnum">{won(credit)}</b></span>
            <span className="bg-canvas rounded-full px-2.5 py-1">체크·현금 <b className="tnum">{won(checkCash)}</b></span>
          </div>
          <div className={`text-[12px] rounded-lg px-3 py-2 border border-dashed ${overThreshold ? 'bg-mint-l text-mint-d border-mint' : 'bg-[#fff8ee] text-[#b9770a] border-warn'}`}>
            {overThreshold
              ? '문턱을 넘었어요! 지금부터는 공제율 높은 체크카드/현금영수증(30%)이 유리해요.'
              : `문턱까지 ₩${won(Math.max(0, threshold - totalSpend))} 남음. 이 구간은 실적 채우기 좋은 신용카드도 무방해요.`}
          </div>
        </>
      ) : (
        <div className="text-[12px] text-sub">연 총급여를 입력하면 최적 결제수단을 계산해 드려요.</div>
      )}
    </Box>
  )
}

// ===== 카드 추가/수정 =====
type DraftRule = { id: string; area: string; merchants: string; kind: 'rate' | 'fixed'; value: string; cap: number | null }

function CardModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Card; profileId: string }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'credit' | 'check'>('credit')
  const [req, setReq] = useState<number | null>(null)
  const [rules, setRules] = useState<DraftRule[]>([])

  useEffect(() => {
    if (!open) return
    if (edit) {
      setName(edit.name); setType(edit.type ?? 'credit'); setReq(edit.requiredSpend ?? null)
      setRules((edit.benefits ?? []).map((r) => ({ id: r.id, area: r.area, merchants: r.merchants.join(', '), kind: r.kind, value: String(r.value), cap: r.cap ?? null })))
    } else {
      setName(''); setType('credit'); setReq(null)
      setRules([{ id: uid(), area: '', merchants: '', kind: 'rate', value: '', cap: null }])
    }
  }, [open, edit])

  const setRule = (id: string, patch: Partial<DraftRule>) => setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addRule = () => setRules((p) => [...p, { id: uid(), area: '', merchants: '', kind: 'rate', value: '', cap: null }])
  const removeRule = (id: string) => setRules((p) => p.filter((r) => r.id !== id))

  async function save() {
    if (!name.trim()) return
    const benefits: BenefitRule[] = rules
      .filter((r) => r.area.trim() && Number(r.value) > 0)
      .map((r) => ({
        id: r.id, area: r.area.trim(),
        merchants: r.merchants.split(',').map((s) => s.trim()).filter(Boolean),
        kind: r.kind, value: Number(r.value), cap: r.cap || undefined,
      }))
    const c: Card = {
      id: edit?.id ?? uid(), profileId, name: name.trim(), type,
      requiredSpend: req || undefined, benefits, cycle: 'prev-month',
    }
    await repo.upsertCard(c)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '카드 수정' : '카드 추가'}>
      <Field label="카드 이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 신한 딥드림" className={inputCls} /></Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="종류">
          <div className="flex gap-1.5">
            {(['credit', 'check'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${type === t ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{t === 'credit' ? '신용' : '체크'}</button>
            ))}
          </div>
        </Field>
        <Field label="월 실적 조건 (원)"><AmountInput value={req} onChange={setReq} /></Field>
      </div>

      <div className="flex items-center justify-between mt-1 mb-1">
        <span className="text-[12px] font-semibold text-sub">혜택 영역 {rules.length > 1 && <span className="text-mint-d">· {rules.length}개</span>}</span>
        <button onClick={addRule} className="text-[12px] font-bold text-mint-d flex items-center gap-1"><Plus size={13} /> 영역 추가</button>
      </div>

      {rules.map((r) => (
        <div key={r.id} className="border border-line rounded-[10px] p-2.5 mb-2 space-y-2">
          <div className="flex gap-2">
            <input value={r.area} onChange={(e) => setRule(r.id, { area: e.target.value })} placeholder="영역명 (예: 편의점)" className={inputCls + ' flex-1 min-w-0'} />
            {rules.length > 1 && <button onClick={() => removeRule(r.id)} className="text-sub hover:text-expense px-0.5"><Trash2 size={16} /></button>}
          </div>
          <input value={r.merchants} onChange={(e) => setRule(r.id, { merchants: e.target.value })} placeholder="가맹점 키워드 쉼표로 (예: GS25, CU, 세븐일레븐)" className={inputCls} />
          <div className="flex gap-2">
            <select value={r.kind} onChange={(e) => setRule(r.id, { kind: e.target.value as 'rate' | 'fixed' })} className={inputCls + ' w-[92px]'}>
              <option value="rate">정률 %</option>
              <option value="fixed">정액 원</option>
            </select>
            <input type="number" value={r.value} onChange={(e) => setRule(r.id, { value: e.target.value })} placeholder={r.kind === 'rate' ? '할인율' : '건당 금액'} className={inputCls + ' flex-1 text-right tnum'} />
            <div className="w-[120px]"><AmountInput value={r.cap} onChange={(v) => setRule(r.id, { cap: v })} placeholder="월 한도(선택)" /></div>
          </div>
        </div>
      ))}

      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteCard(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
