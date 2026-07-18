import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, addMonth } from '../lib/format'
import { ruleMatches, pickTier, ruleTiers, isExcluded, activeSpecialCap, evalRuleMonth, cardSpend } from '../lib/cardAdvisor'
import { Card as Box, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { BenefitRule, BenefitTier, Card, Transaction } from '../db/types'

// 활성 구간의 적립률/액 라벨 (구간 없으면 조건 미달)
const rateLabel = (kind: 'rate' | 'fixed', tier?: BenefitTier | null) =>
  !tier ? '조건 미달' : kind === 'rate' ? `${tier.value}%` : `건당 ${won(tier.value)}원`
// 활성 구간의 조건/횟수 요약
function tierCond(tier?: BenefitTier | null): string {
  if (!tier) return ''
  return [tier.minSpend ? `건당 ${won(tier.minSpend)}↑` : '', tier.maxCount ? `월${tier.maxCount}회` : ''].filter(Boolean).join(' · ')
}

// 한도 대비 남은 적립 + (정률이면) 얼마 더 쓰면 소진되는지
function Remain({ cap, used, kind, value }: { cap: number; used: number; kind: 'rate' | 'fixed'; value?: number }) {
  const left = Math.max(0, cap - used)
  if (left <= 0) return <div className="text-[11px] text-expense mt-0.5">한도 소진! 이 혜택은 다른 카드로.</div>
  const spend = kind === 'rate' && value ? ` · 약 ₩${won(Math.round(left / (value / 100)))} 더 쓰면 소진` : ''
  return <div className="text-[11px] text-sub mt-0.5">남은 적립 ₩{won(left)}{spend}</div>
}

// 제외 가맹점 목록 (평소 접혀 있고 눌러서 펼침)
function ExcludeRow({ icon, label, items }: { icon: string; label: string; items: string[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <div className="mt-1.5 text-[11px]">
      <button onClick={() => setOpen((o) => !o)} className="text-sub flex items-center gap-1 hover:text-ink"><span className="inline-block w-2">{open ? '▾' : '▸'}</span>{icon} {label}</button>
      {open && <div className="text-sub mt-1 leading-relaxed pl-3">{items.join(', ')}</div>}
    </div>
  )
}

export default function Cards() {
  const { profileId, profile } = useProfile()
  const month = thisMonth()
  const prevMonth = addMonth(month, -1)
  const year = month.slice(0, 4)
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])
  const monthTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const prevTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month: prevMonth }) : []), [profileId, prevMonth], [])
  const allTxs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Card | undefined>()

  return (
    <div>
      <PageHeader title="카드혜택" />

      {cards.length === 0 && <Empty>오른쪽 아래 ＋ 로 카드·혜택 규칙을 등록하세요.</Empty>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {cards.map((c) => {
          const spend = cardSpend(monthTxs, c) // 이번 달 누적 (다음 달 등급 대비)
          const prevSpend = cardSpend(prevTxs, c) // 전월 실적 (이번 달 혜택 등급 결정)
          const req = c.requiredSpend ?? 0
          const reqPct = req ? Math.min(100, (spend / req) * 100) : 0
          const activeByReq = req === 0 || prevSpend >= req // 전월 실적 충족 → 이번 달 혜택 적용
          const cardMonthTxs = [...monthTxs].filter((t) => t.type === 'expense' && t.cardId === c.id).sort((a, b) => a.date.localeCompare(b.date))
          const base = c.baseBenefit
          const specials = c.benefits ?? []
          // 거래를 '혜택제외 → 특별적립(조건 충족) → 기본적립'으로 분류 (실적 미달이면 혜택 전부 0)
          const baseTxs: Transaction[] = []
          const spTxs: Record<string, Transaction[]> = {}
          if (activeByReq) {
            for (const t of cardMonthTxs) {
              if (isExcluded(c, t.merchant)) continue
              const sp = specials.find((r) => ruleMatches(r, t.merchant) && pickTier(r, { amount: t.amount, prevSpend, thisSpend: spend }))
              if (sp) (spTxs[sp.id] ??= []).push(t)
              else if (base) baseTxs.push(t)
            }
          }
          const specialUsed = specials.map((r) => ({ r, ...evalRuleMonth(r, spTxs[r.id] ?? [], prevSpend, spend) }))
          const baseEval = base ? evalRuleMonth(base, baseTxs, prevSpend, spend) : null
          const baseUsed = baseEval?.used ?? 0
          // 특별적립 통합 한도 (전월실적별) — 기본적립엔 미적용
          const specialRawTotal = specialUsed.reduce((a, x) => a + x.used, 0)
          const spCap = activeSpecialCap(c, prevSpend)
          const specialTotal = spCap > 0 ? Math.min(specialRawTotal, spCap) : specialRawTotal
          const spFull = spCap > 0 && specialTotal >= spCap
          const excl = c.excludeMerchants ?? []
          return (
            <Box key={c.id}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-[15px] flex items-center gap-1.5">
                  {c.name}
                  {c.type && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${c.type === 'credit' ? 'bg-[#e7f0ff] text-income' : 'bg-mint-l text-mint-d'}`}>{c.type === 'credit' ? '신용' : '체크'}</span>}
                </div>
                <button onClick={() => { setEdit(c); setModal(true) }} className="text-[12px] text-sub hover:text-ink">수정</button>
              </div>

              {/* 전월 실적 → 이번 달 혜택 등급 */}
              {req > 0 && (
                <div className={`mt-2.5 text-[11.5px] rounded-lg px-2.5 py-1.5 ${activeByReq ? 'bg-mint-l text-mint-d' : 'bg-[#fdeaea] text-expense'}`}>
                  전월 실적 <b className="tnum">{won(prevSpend)}</b> / 조건 {won(req)}
                  {activeByReq ? ' · 이번 달 혜택 적용 ✔' : ' · 실적 미달로 이번 달 혜택 제외'}
                </div>
              )}

              {/* 이번 달 실적 누적 (다음 달 등급 대비) */}
              {req > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[12px] text-sub"><span>이번 달 실적 (다음 달 등급)</span><span className="tnum">{won(spend)} / {won(req)}</span></div>
                  <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${reqPct}%`, background: spend >= req ? '#12b8a6' : '#f5a524' }} />
                  </div>
                  {spend < req && <div className="text-[11px] text-sub mt-1">다음 달 혜택까지 {won(req - spend)} 남음</div>}
                </div>
              )}

              {/* 기본 적립 */}
              {base && (
                <div className="mt-3">
                  <div className="flex justify-between text-[12px]">
                    <span className="font-semibold">기본 적립 <span className="text-sub font-normal">모든 가맹점</span> <span className={`font-normal ${activeByReq && baseEval?.tier ? 'text-mint-d' : 'text-expense/60 line-through'}`}>{rateLabel(base.kind, baseEval?.tier)}{ruleTiers(base).length > 1 ? ' (구간별)' : ''}</span></span>
                    <span className="tnum text-sub">{won(baseUsed)}{baseEval?.cap != null ? ` / ${won(baseEval.cap)}` : ''}</span>
                  </div>
                  {baseEval?.cap != null && (
                    <>
                      <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, baseEval.cap ? (baseUsed / baseEval.cap) * 100 : 0)}%`, background: baseUsed >= baseEval.cap ? '#e5484d' : '#12b8a6' }} />
                      </div>
                      <Remain cap={baseEval.cap} used={baseUsed} kind={base.kind} value={baseEval.tier?.value} />
                    </>
                  )}
                </div>
              )}

              {/* 특별 적립 (영역별 한도) */}
              {specialUsed.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="text-[11px] font-semibold text-sub">특별 적립 <span className="font-normal">(해당 가맹점은 기본적립 대신 적용)</span></div>
                  {specialUsed.map(({ r, used, cap, tier }) => {
                    const full = cap != null ? used >= cap : false
                    const cond = tierCond(tier)
                    return (
                      <div key={r.id}>
                        <div className="flex justify-between text-[12px]">
                          <span className="font-semibold">{r.area} <span className={`font-normal ${activeByReq && tier ? 'text-sub' : 'text-expense/60 line-through'}`}>{rateLabel(r.kind, tier)}{ruleTiers(r).length > 1 ? ' (구간별)' : ''}</span>{cond ? <span className="text-[11px] text-sub font-normal"> · {cond}</span> : null}</span>
                          <span className="tnum text-sub">{won(used)}{cap != null ? ` / ${won(cap)}` : ''}</span>
                        </div>
                        {cap != null ? (
                          <>
                            <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, cap ? (used / cap) * 100 : 0)}%`, background: full ? '#e5484d' : '#12b8a6' }} />
                            </div>
                            {tier && <Remain cap={cap} used={used} kind={r.kind} value={tier.value} />}
                          </>
                        ) : null}
                      </div>
                    )
                  })}
                  {/* 특별적립 통합 한도 (전월실적별) */}
                  {spCap > 0 && (
                    <div className="pt-1">
                      <div className="flex justify-between text-[11.5px]"><span className="text-sub">특별적립 통합</span><span className="tnum">{won(specialTotal)} / {won(spCap)}</span></div>
                      <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (specialTotal / spCap) * 100)}%`, background: spFull ? '#e5484d' : '#12b8a6' }} />
                      </div>
                      {spFull && <div className="text-[11px] text-expense mt-0.5">특별적립 통합 한도 소진!</div>}
                    </div>
                  )}
                </div>
              )}

              {!base && specialUsed.length === 0 && <div className="mt-3 text-[12px] text-sub">등록된 혜택이 없어요.</div>}

              {/* 제외 가맹점 (접기/펼치기) */}
              <ExcludeRow icon="🚫" label="혜택 제외" items={excl} />
              <ExcludeRow icon="📊" label="실적 제외" items={c.excludeFromSpend ?? []} />
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
type DraftTier = { minSpend: number | null; minPrev: number | null; minThisMonth: number | null; value: string; maxCount: string; cap: number | null }
type DraftRule = { id: string; area: string; merchants: string; kind: 'rate' | 'fixed'; tiers: DraftTier[] }

const newTier = (): DraftTier => ({ minSpend: null, minPrev: null, minThisMonth: null, value: '', maxCount: '', cap: null })
const newRule = (): DraftRule => ({ id: uid(), area: '', merchants: '', kind: 'rate', tiers: [newTier()] })
const toDraft = (r: BenefitRule): DraftRule => ({
  id: r.id, area: r.area, merchants: r.merchants.join(', '), kind: r.kind,
  tiers: ruleTiers(r).map((t) => ({
    minSpend: t.minSpend ?? null, minPrev: t.minPrev ?? null, minThisMonth: t.minThisMonth ?? null,
    value: String(t.value ?? ''), maxCount: t.maxCount ? String(t.maxCount) : '', cap: t.cap ?? null,
  })),
})
// draft → BenefitRule (혜택값 있는 구간만; 하나도 없으면 null)
function buildRule(r: DraftRule, area: string, merchants: string[]): BenefitRule | null {
  const tiers: BenefitTier[] = r.tiers
    .map((t) => ({
      minSpend: t.minSpend || undefined, minPrev: t.minPrev || undefined, minThisMonth: t.minThisMonth || undefined,
      value: Number(t.value) || 0, maxCount: Number(t.maxCount) || undefined, cap: t.cap || undefined,
    }))
    .filter((t) => t.value > 0)
    .sort((a, b) => (a.minPrev ?? 0) - (b.minPrev ?? 0) || (a.minSpend ?? 0) - (b.minSpend ?? 0))
  if (!tiers.length) return null
  return { id: r.id, area, merchants, kind: r.kind, tiers, value: tiers[tiers.length - 1].value }
}

// 폭 충돌 없는 입력 박스(inputCls의 w-full 제외) + 세그먼트 버튼
const boxCls = 'border border-line rounded-[10px] px-3 py-2 text-[14px] bg-surface outline-none focus:border-mint transition-colors'
const seg = (on: boolean) => `flex-1 py-2 rounded-[9px] text-[12px] font-bold border transition-colors ${on ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`

// 작은 라벨 + 금액 입력
function Amt({ label, v, on }: { label: string; v: number | null; on: (v: number | null) => void }) {
  return <div><div className="text-[10px] text-sub mb-0.5">{label}</div><AmountInput value={v} onChange={on} placeholder="-" /></div>
}

// 혜택 편집기 (기본적립·특별적립 공용): 비율/정액 + 조건·혜택·한도 구간표
function EarnEditor({ d, patch, capHint }: { d: DraftRule; patch: (p: Partial<DraftRule>) => void; capHint: string }) {
  const set = (i: number, p: Partial<DraftTier>) => patch({ tiers: d.tiers.map((t, ti) => (ti === i ? { ...t, ...p } : t)) })
  const unit = d.kind === 'rate' ? '%' : '원'
  return (
    <>
      <div className="flex gap-1.5 mb-2">
        <button onClick={() => patch({ kind: 'rate' })} className={seg(d.kind === 'rate')}>비율 (%)</button>
        <button onClick={() => patch({ kind: 'fixed' })} className={seg(d.kind === 'fixed')}>정액 (원/건)</button>
      </div>
      <div className="space-y-2">
        {d.tiers.map((t, i) => (
          <div key={i} className="bg-canvas rounded-[10px] p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-sub">구간 {i + 1}</span>
              {d.tiers.length > 1 && <button onClick={() => patch({ tiers: d.tiers.filter((_, ti) => ti !== i) })} className="text-sub hover:text-expense"><Trash2 size={13} /></button>}
            </div>
            {/* 혜택 */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[11px] text-sub w-9 shrink-0 font-semibold">혜택</span>
              <input type="number" value={t.value} onChange={(e) => set(i, { value: e.target.value })} onWheel={(e) => e.currentTarget.blur()} placeholder="0" className={boxCls + ' flex-1 min-w-0 text-right tnum'} />
              <span className="text-[12.5px] font-semibold w-5 shrink-0">{unit}</span>
            </div>
            {/* 조건 */}
            <div className="flex items-start gap-1.5 mb-2">
              <span className="text-[11px] text-sub w-9 shrink-0 font-semibold pt-4">조건</span>
              <div className="flex-1 grid grid-cols-3 gap-1.5 min-w-0">
                <Amt label="건당↑" v={t.minSpend} on={(v) => set(i, { minSpend: v })} />
                <Amt label="전월실적↑" v={t.minPrev} on={(v) => set(i, { minPrev: v })} />
                <Amt label="당월실적↑" v={t.minThisMonth} on={(v) => set(i, { minThisMonth: v })} />
              </div>
            </div>
            {/* 한도 */}
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] text-sub w-9 shrink-0 font-semibold pt-4">한도</span>
              <div className="flex-1 grid grid-cols-2 gap-1.5 min-w-0">
                <div><div className="text-[10px] text-sub mb-0.5">월 횟수</div><input type="number" value={t.maxCount} onChange={(e) => set(i, { maxCount: e.target.value })} onWheel={(e) => e.currentTarget.blur()} placeholder="무제한" className={boxCls + ' w-full text-right tnum'} /></div>
                <div><div className="text-[10px] text-sub mb-0.5">월 최대금액</div><AmountInput value={t.cap} onChange={(v) => set(i, { cap: v })} placeholder={capHint} /></div>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => patch({ tiers: [...d.tiers, newTier()] })} className="text-[11.5px] font-bold text-mint-d flex items-center gap-1"><Plus size={12} /> 구간 추가</button>
        {capHint !== '무제한' && <div className="text-[10.5px] text-sub">월 최대금액을 비워두면 아래 <b>특별적립 통합 한도</b>가 이 혜택들에 합쳐서 적용돼요.</div>}
      </div>
    </>
  )
}

// 특별적립 통합 한도 구간 (전월실적별)
type DraftCapTier = { minPrev: number | null; cap: number | null }
const newCapTier = (): DraftCapTier => ({ minPrev: null, cap: null })

function CardModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Card; profileId: string }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'credit' | 'check'>('credit')
  const [req, setReq] = useState<number | null>(null)
  const [capTiers, setCapTiers] = useState<DraftCapTier[]>([newCapTier()])
  const [base, setBase] = useState<DraftRule>(newRule())
  const [rules, setRules] = useState<DraftRule[]>([])
  const [exclude, setExclude] = useState('')
  const [excludeSpend, setExcludeSpend] = useState('')

  useEffect(() => {
    if (!open) return
    if (edit) {
      setName(edit.name); setType(edit.type ?? 'credit'); setReq(edit.requiredSpend ?? null)
      const ct = edit.specialCapTiers?.length ? edit.specialCapTiers : edit.pointCap ? [{ minPrev: undefined, cap: edit.pointCap }] : []
      setCapTiers(ct.length ? ct.map((t) => ({ minPrev: t.minPrev ?? null, cap: t.cap })) : [newCapTier()])
      setBase(edit.baseBenefit ? toDraft(edit.baseBenefit) : newRule())
      setRules((edit.benefits ?? []).map(toDraft))
      setExclude((edit.excludeMerchants ?? []).join(', '))
      setExcludeSpend((edit.excludeFromSpend ?? []).join(', '))
    } else {
      setName(''); setType('credit'); setReq(null); setCapTiers([newCapTier()])
      setBase(newRule()); setRules([]); setExclude(''); setExcludeSpend('')
    }
  }, [open, edit])

  const setRule = (id: string, patch: Partial<DraftRule>) => setRules((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addRule = () => setRules((p) => [...p, newRule()])
  const removeRule = (id: string) => setRules((p) => p.filter((r) => r.id !== id))
  const setCap = (i: number, p: Partial<DraftCapTier>) => setCapTiers((c) => c.map((t, ti) => (ti === i ? { ...t, ...p } : t)))
  const hasCap = capTiers.some((t) => Number(t.cap) > 0)
  const specialCapHint = hasCap ? '통합 한도' : '무제한'

  async function save() {
    if (!name.trim()) return
    const baseRule = buildRule(base, '기본적립', [])
    const benefits = rules
      .map((r) => buildRule(r, r.area.trim(), r.merchants.split(',').map((s) => s.trim()).filter(Boolean)))
      .filter((r): r is BenefitRule => !!r && !!r.area)
    const specialCapTiers = capTiers
      .filter((t) => Number(t.cap) > 0)
      .map((t) => ({ minPrev: t.minPrev || undefined, cap: Number(t.cap) }))
      .sort((a, b) => (a.minPrev ?? 0) - (b.minPrev ?? 0))
    const c: Card = {
      id: edit?.id ?? uid(), profileId, name: name.trim(), type,
      requiredSpend: req || undefined, specialCapTiers: specialCapTiers.length ? specialCapTiers : undefined,
      baseBenefit: baseRule ?? undefined, benefits,
      excludeMerchants: exclude.split(',').map((s) => s.trim()).filter(Boolean),
      excludeFromSpend: excludeSpend.split(',').map((s) => s.trim()).filter(Boolean),
      cycle: 'prev-month',
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
        <Field label="전월 실적 조건 (원)"><AmountInput value={req} onChange={setReq} placeholder="예: 300,000" /></Field>
      </div>
      <div className="text-[11px] text-sub -mt-2 mb-2 leading-relaxed bg-canvas rounded-lg px-2.5 py-2">💡 <b>지난달</b>에 이 금액 이상 써야 이번 달 혜택이 나와요. 조건이 없거나, 아래 <b>구간</b>에 전월실적 조건을 직접 넣는 카드면 비워두세요.</div>

      <div className="text-[11px] text-sub mb-2.5 leading-relaxed bg-mint-l text-mint-d rounded-lg px-2.5 py-2">📋 각 혜택은 은행 앱의 <b>‘조건 → 혜택 → 한도’ 표</b> 그대로예요. 간단한 혜택이면 <b>혜택값만</b> 넣고 조건·한도는 비워두세요. 조건이 여러 줄(예: 1만↑ 1% / 30만↑ 2%)이면 <b>구간 추가</b>로 줄을 늘리면 돼요.</div>

      {/* 기본 적립 */}
      <div className="border border-line rounded-[12px] p-3 mb-2.5">
        <div className="text-[13px] font-bold mb-1">기본 적립 <span className="text-[11px] text-sub font-normal">· 모든 가맹점</span></div>
        <div className="text-[11px] text-sub mb-2">특별 적립·제외 가맹점을 뺀 <b>모든 결제</b>에 붙는 적립이에요. 예) 하나 Wide = 비율%, 구간1 전월실적↑40만·혜택2%, 구간2 혜택1%. 두 구간이 <b>합쳐서</b> 월 10만이면 각 구간 ‘월 최대금액’에 100,000을 넣으세요(월엔 한 구간만 적용돼요). (기본 적립이 없으면 비워두세요)</div>
        <EarnEditor d={base} patch={(p) => setBase((b) => ({ ...b, ...p }))} capHint="무제한" />
      </div>

      {/* 특별 적립 */}
      <div className="flex items-center justify-between mt-1 mb-2">
        <div>
          <span className="text-[13px] font-bold">특별 적립 {rules.length > 0 && <span className="text-mint-d">{rules.length}개</span>}</span>
          <div className="text-[11px] text-sub">특정 가맹점에 더 주는 혜택. 그 가맹점은 기본적립 대신 이게 적용돼요.</div>
        </div>
        <button onClick={addRule} className="text-[12px] font-bold text-mint-d flex items-center gap-1 shrink-0"><Plus size={13} /> 영역 추가</button>
      </div>

      {rules.map((r, idx) => (
        <div key={r.id} className="border border-line rounded-[12px] p-3 mb-2.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-mint-d bg-mint-l rounded-full px-2 py-0.5 shrink-0">특별 {idx + 1}</span>
            <input value={r.area} onChange={(e) => setRule(r.id, { area: e.target.value })} placeholder="이름 (예: 편의점)" className={boxCls + ' flex-1 min-w-0'} />
            <button onClick={() => removeRule(r.id)} className="text-sub hover:text-expense px-0.5 shrink-0"><Trash2 size={16} /></button>
          </div>
          <div className="mb-2.5">
            <div className="text-[11.5px] text-sub mb-1">어떤 가맹점에서? <span className="text-sub/70">(쉼표로 구분 · 빼려면 !쿠팡이츠 처럼 앞에 !)</span></div>
            <input value={r.merchants} onChange={(e) => setRule(r.id, { merchants: e.target.value })} placeholder="예: 쿠팡, G마켓, !쿠팡이츠" className={boxCls + ' w-full'} />
          </div>
          <EarnEditor d={r} patch={(p) => setRule(r.id, p)} capHint={specialCapHint} />
        </div>
      ))}

      {/* 특별적립 통합 한도 (전월실적별) */}
      <div className="border border-line rounded-[12px] p-3 mb-2.5">
        <div className="text-[13px] font-bold mb-1">특별적립 통합 한도 <span className="text-[11px] text-sub font-normal">· 선택</span></div>
        <div className="text-[11px] text-sub mb-2">여러 <b>특별 적립</b>을 합쳐서 받는 월 상한이에요. 전월 실적에 따라 한도가 다르면 구간을 나눠 넣으세요. (기본 적립엔 적용 안 됨 · 없으면 비워두기)<br />예) BC 바로카드 = 전월 30만↑ 1만 / 70·100만↑ 2만 / 200만↑ 3만</div>
        <div className="space-y-1.5">
          {capTiers.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[12px] text-sub shrink-0">전월실적</span>
              <div className="flex-1 min-w-0"><AmountInput value={t.minPrev} onChange={(v) => setCap(i, { minPrev: v })} placeholder="0 (조건없음)" /></div>
              <span className="text-[12px] text-sub shrink-0">이상 →</span>
              <div className="w-[110px]"><AmountInput value={t.cap} onChange={(v) => setCap(i, { cap: v })} placeholder="한도" /></div>
              {capTiers.length > 1 && <button onClick={() => setCapTiers((c) => c.filter((_, ci) => ci !== i))} className="text-sub hover:text-expense shrink-0"><Trash2 size={13} /></button>}
            </div>
          ))}
          <button onClick={() => setCapTiers((c) => [...c, newCapTier()])} className="text-[11.5px] font-bold text-mint-d flex items-center gap-1"><Plus size={12} /> 구간 추가</button>
        </div>
      </div>

      {/* 혜택 제외 / 실적 제외 */}
      <Field label="혜택 제외 가맹점 (선택)"><input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="예: 상품권, 대학등록금 (쉼표로 구분)" className={inputCls} /></Field>
      <div className="text-[11px] text-sub -mt-2 mb-2 leading-relaxed">적립·할인이 전혀 안 되고, 실적에도 안 잡혀요.</div>
      <Field label="실적 제외 가맹점 (선택)"><input value={excludeSpend} onChange={(e) => setExcludeSpend(e.target.value)} placeholder="예: 아파트관리비, 공과금 (쉼표로 구분)" className={inputCls} /></Field>
      <div className="text-[11px] text-sub -mt-2 mb-2 leading-relaxed">혜택(적립·할인)은 <b>받지만</b> 실적에는 안 잡히는 가맹점이에요. (예: 바로카드 아파트 관리비)</div>

      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteCard(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
