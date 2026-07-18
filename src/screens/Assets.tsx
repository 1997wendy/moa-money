import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Plus, ChevronDown } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { useStockSync } from '../hooks/useStockSync'
import { useFxSync } from '../hooks/useFxSync'
import { useKrStockSync } from '../hooks/useKrStockSync'
import { searchStocks, getStockPrice } from '../lib/stockApi'
import { searchCoins, getCoinPriceKRW } from '../lib/coinApi'
import { searchKrStocks, getKrStockPrice } from '../lib/krStock'
import { getGoldKrwPerGram } from '../lib/goldPrice'
import { useGoldSync } from '../hooks/useGoldSync'
import { useHoldingSync } from '../hooks/useHoldingSync'
import { fetchFxRate } from '../lib/fx'
import { won, todayISO } from '../lib/format'
import {
  SUBTYPES, GROUPS, BANKS, SECURITIES, EXCHANGES, PENSION_KINDS, CURRENCIES, TAX_LABELS, TAX_RATES, subOf, groupOf, krwValue, investPnl, expectedInterest,
} from '../lib/assets'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import Autocomplete from '../components/Autocomplete'
import DateInput from '../components/DateInput'
import DecimalInput from '../components/DecimalInput'
import type { Asset, Holding } from '../db/types'

// 목록에서 이름 옆에 붙일 뱃지 (예금/적금 · 주식/ETF/코인/금 · 현금)
function assetBadge(a: Asset): string | null {
  const s = subOf(a.type)
  if (a.savingKind) return a.savingKind === 'installment' ? '적금' : '예금'
  if (s.group === 'invest') return s.label // 주식/ETF/코인/금
  if (a.type === 'checking' && a.subLabel === '현금') return '현금'
  return null
}

// 예적금 만기 지남 여부
const isExpired = (a: Asset): boolean => a.maturity != null && a.maturity < todayISO()
// 만기까지 남은 일수 (만기 없으면 null)
const daysToMaturity = (a: Asset): number | null => {
  if (!a.maturity) return null
  const ms = new Date(a.maturity + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()
  return Math.round(ms / 86400000)
}
// 만기 임박(7일 이내, 아직 안 지남)
const isMaturingSoon = (a: Asset): boolean => { const d = daysToMaturity(a); return d != null && d >= 0 && d <= 7 }
// 기본으로 접어둘 항목: 0원(자동) · 만료 · 상폐(수동)
const isHidden = (a: Asset): boolean => !!a.archived || krwValue(a) === 0 || isExpired(a)
// 총액에 포함되는 자산: 상폐·만료는 제외(다른 곳으로 이동/정리될 돈)
const countsToTotal = (a: Asset): boolean => !a.archived && !isExpired(a)

const symbolOf = (code?: string) => CURRENCIES.find((c) => c.code === (code ?? 'KRW'))?.symbol ?? '₩'
const PENSION_INVEST = ['IRP', '연금저축펀드', '퇴직연금']

const COLLAPSE_KEY = 'moa.assets.collapsed'

// 화면이 넓은지(PC 2열) 감지
function useIsWide() {
  const [wide, setWide] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true)
  useEffect(() => {
    const h = () => setWide(window.innerWidth >= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return wide
}

export default function Assets() {
  const { profileId } = useProfile()
  useCoinSync(profileId)
  useStockSync(profileId)
  useKrStockSync(profileId)
  useGoldSync(profileId)
  useHoldingSync(profileId)
  useFxSync(profileId)
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Asset | undefined>()
  // 그룹 접힘 상태(브라우저 기억) · 그룹별 '숨김 펼치기'(세션)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') } catch { return {} }
  })
  const [openHidden, setOpenHidden] = useState<Record<string, boolean>>({})
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)) } catch { /* noop */ } }, [collapsed])
  const toggleCollapse = (k: string) => setCollapsed((c) => ({ ...c, [k]: !c[k] }))
  const toggleHidden = (k: string) => setOpenHidden((o) => ({ ...o, [k]: !o[k] }))
  const wide = useIsWide()

  const total = assets.filter(countsToTotal).reduce((s, a) => s + krwValue(a), 0)

  // 만기 임박 먼저(임박순), 그다음 금액 큰 순
  const sortItems = (a: Asset, b: Asset) => {
    const sa = isMaturingSoon(a), sb = isMaturingSoon(b)
    if (sa !== sb) return sa ? -1 : 1
    if (sa && sb) return daysToMaturity(a)! - daysToMaturity(b)!
    return krwValue(b) - krwValue(a)
  }

  const byGroup = GROUPS.map((g) => {
    const all = assets.filter((a) => groupOf(a.type) === g.key)
    const vis = all.filter((a) => !isHidden(a))
    const hidden = all.filter(isHidden).sort((a, b) => krwValue(b) - krwValue(a))
    const subGroups = SUBTYPES.filter((s) => vis.some((a) => subOf(a.type).key === s.key)).map((s) => {
      const items = vis.filter((a) => subOf(a.type).key === s.key).sort(sortItems)
      let prin = 0, prof = 0
      for (const a of items.filter(countsToTotal)) { const p = investPnl(a); if (p) { prin += p.principal; prof += p.profit } }
      return { key: s.key, label: s.label, items, pnl: prin > 0 ? { profit: prof, pct: (prof / prin) * 100 } : null }
    })
    const sum = all.filter(countsToTotal).reduce((s, a) => s + krwValue(a), 0)
    // 그룹 총 수익률 (투자·연금 등 투자성 자산) — 원금 대비 손익
    let gPrin = 0, gProf = 0
    for (const a of all.filter(countsToTotal)) { const p = investPnl(a); if (p) { gPrin += p.principal; gProf += p.profit } }
    const pnl = gPrin > 0 ? { profit: gProf, pct: (gProf / gPrin) * 100 } : null
    return { ...g, sum, vis, hidden, subGroups, multiSub: subGroups.length > 1, pnl }
  }).filter((g) => g.vis.length > 0 || g.hidden.length > 0)

  type G = typeof byGroup[number]
  // PC: 각 그룹을 '더 짧은 열'에 배치해 공백 최소화(기타 등이 왼쪽으로 갈 수 있음). 모바일: 1열.
  const columns: G[][] = wide ? [[], []] : [byGroup]
  if (wide) {
    const h = [0, 0]
    const estH = (g: G) => 46 + (collapsed[g.key] ? 0 : g.vis.reduce((s, a) => s + (a.holdings?.length ? 30 + a.holdings.length * 20 : 44), 0) + (g.hidden.length ? 24 : 0))
    for (const g of byGroup) { const i = h[0] <= h[1] ? 0 : 1; columns[i].push(g); h[i] += estH(g) }
  }

  function openEdit(a?: Asset) { setEdit(a); setModal(true) }
  async function del(a: Asset) { if (confirm(`'${a.name}' 자산을 삭제할까요?`)) await repo.deleteAsset(a.id) }

  // 자산 한 줄 렌더 (muted=숨김 항목)
  const renderRow = (a: Asset, muted = false) => {
    const foreign = a.currency && a.currency !== 'KRW'
    const pnl = investPnl(a)
    const interest = expectedInterest(a)
    const expired = isExpired(a)
    const soon = isMaturingSoon(a)
    const dday = daysToMaturity(a)
    return (
      <div key={a.id} className={`py-2.5 border-b border-line last:border-0 ${muted ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-2">
          <div onClick={() => openEdit(a)} className="flex-1 min-w-0 flex items-center justify-between cursor-pointer hover:bg-canvas -ml-2 pl-2 rounded-lg">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13.5px] font-semibold truncate">{a.name}</span>
                {assetBadge(a) && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-canvas text-sub">{assetBadge(a)}</span>}
                {soon && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fef2df] text-[#b7791f]">만기 {dday === 0 ? '오늘' : `D-${dday}`}</span>}
                {expired && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fdecec] text-expense">만료</span>}
                {a.archived && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fdecec] text-expense">상폐</span>}
              </div>
              <div className="text-[11px] text-sub truncate">
                {[
                  subOf(a.type).pension && a.subLabel ? a.subLabel : null,
                  a.institution && a.institution !== a.name ? a.institution : null,
                  a.ticker || null,
                  a.holdings && a.holdings.length ? `${a.holdings.length}종목` : null,
                  a.rate ? `연 ${a.rate}%${a.maturity ? ` · ~${a.maturity.slice(2)}` : ' 무기한'}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
              {interest && <div className="text-[11px] text-mint-d">💰 {interest.toMaturityNet != null ? `만기까지 세후 ₩${won(interest.toMaturityNet)}` : `세후 ₩${won(interest.annualNet)}/년`}</div>}
              {pnl && <div className={`text-[11px] ${pnl.profit >= 0 ? 'text-up' : 'text-down'}`}>{pnl.profit >= 0 ? '▲' : '▼'} {pnl.pct >= 0 ? '+' : ''}{pnl.pct.toFixed(2)}% ({symbolOf(a.currency)}{won(Math.abs(pnl.profit))})</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[14px] font-bold tnum">{foreign ? `${symbolOf(a.currency)}${won(a.amount)}` : won(a.amount)}</div>
              {foreign && <div className="text-[11px] text-sub tnum">≈ ₩{won(krwValue(a))}</div>}
            </div>
          </div>
          <button onClick={() => del(a)} className="text-sub hover:text-expense p-1 shrink-0" title="삭제"><X size={16} /></button>
        </div>
        {a.holdings && a.holdings.length > 0 && (
          <div className="mt-1.5 ml-1 pl-2.5 border-l-2 border-line space-y-1">
            {a.holdings.map((h) => {
              const hp = (h.value || 0) - (h.principal || 0)
              const hpct = h.principal > 0 ? (hp / h.principal) * 100 : 0
              return (
                <div key={h.id} className="flex items-center justify-between text-[11.5px]">
                  <span className="text-sub truncate pr-2">{h.name || '종목'}{h.ticker ? ` · ${h.ticker}` : ''}</span>
                  <span className="shrink-0 tnum">₩{won(h.value || 0)} <span className={hp >= 0 ? 'text-up' : 'text-down'}>({hp >= 0 ? '+' : ''}{hpct.toFixed(1)}%)</span></span>
                </div>
              )
            })}
            {a.cash ? <div className="flex items-center justify-between text-[11.5px]"><span className="text-sub">예수금(현금)</span><span className="shrink-0 tnum">₩{won(a.cash)}</span></div> : null}
          </div>
        )}
      </div>
    )
  }

  // 그룹 카드 (헤더에 총액·총수익률, 접기/펼치기, 숨김 폴드)
  const renderGroup = (g: G) => {
    const isCol = !!collapsed[g.key]
    const count = g.vis.length + g.hidden.length
    return (
      <div key={g.key} className="mb-3.5">
        <Card>
          <button onClick={() => toggleCollapse(g.key)} className="w-full flex items-center justify-between text-left cursor-pointer gap-2">
            <span className="text-[13px] font-bold text-ink flex items-center gap-1.5 min-w-0">
              <span className="truncate">{g.emoji} {g.label}</span>
              <span className="shrink-0 text-[11px] font-semibold text-sub bg-canvas rounded-full px-2 py-0.5">{count}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-right leading-tight">
                <span className="block text-[13px] font-bold tnum">₩{won(g.sum)}</span>
                {g.pnl && <span className={`block text-[10.5px] font-bold tnum ${g.pnl.profit >= 0 ? 'text-up' : 'text-down'}`}>{g.pnl.profit >= 0 ? '▲' : '▼'} {g.pnl.pct >= 0 ? '+' : ''}{g.pnl.pct.toFixed(1)}%</span>}
              </span>
              <ChevronDown size={17} className={`text-sub transition-transform ${isCol ? '-rotate-90' : ''}`} />
            </span>
          </button>
          {!isCol && (
            <div className="mt-1">
              {g.subGroups.map((sg, si) => (
                <div key={sg.key} className={g.multiSub && si > 0 ? 'border-t-2 border-[#dfe4e9] mt-1.5 pt-0.5' : ''}>
                  {g.multiSub && (
                    <div className="flex items-baseline gap-2 mt-2.5 mb-0.5">
                      <span className="text-[11px] font-bold text-sub">{sg.label}<span className="font-normal text-[10px] text-sub"> · {sg.items.length}</span></span>
                      {sg.pnl && <span className={`text-[11px] font-bold tnum ${sg.pnl.profit >= 0 ? 'text-up' : 'text-down'}`}>{sg.pnl.profit >= 0 ? '▲' : '▼'}{sg.pnl.pct >= 0 ? '+' : ''}{sg.pnl.pct.toFixed(1)}%</span>}
                    </div>
                  )}
                  {sg.items.map((a) => renderRow(a))}
                </div>
              ))}
              {g.hidden.length > 0 && (
                <>
                  <button onClick={() => toggleHidden(g.key)} className="w-full text-left text-[11.5px] text-sub mt-2 py-1 hover:text-ink flex items-center gap-1">
                    <ChevronDown size={13} className={`transition-transform ${openHidden[g.key] ? '' : '-rotate-90'}`} />
                    숨김 {g.hidden.length}개
                  </button>
                  {openHidden[g.key] && g.hidden.map((a) => renderRow(a, true))}
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="자산" />

      <Card>
        <CardLabel>자산 구성 · 총 ₩{won(total)}</CardLabel>
        <div className="flex h-7 rounded-lg overflow-hidden mt-1">
          {byGroup.map((g) => (
            <div key={g.key} style={{ width: `${total ? (g.sum / total) * 100 : 0}%`, background: g.color }} className="flex items-center justify-center text-white text-[11px] font-bold" title={`${g.label} ${won(g.sum)}`}>
              {total && g.sum / total > 0.08 ? `${Math.round((g.sum / total) * 100)}%` : ''}
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap mt-2.5">
          {byGroup.map((g) => (
            <span key={g.key} className="text-[11.5px] text-sub flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: g.color }} />{g.emoji} {g.label} {total ? ((g.sum / total) * 100).toFixed(1) : '0.0'}%
            </span>
          ))}
        </div>
      </Card>

      {/* 모바일 1열 · PC 2열(각 그룹을 더 짧은 열에 배치해 공백 최소화) */}
      {byGroup.length === 0 ? (
        <div className="mt-4"><Empty>오른쪽 아래 ＋ 로 자산을 추가하세요.</Empty></div>
      ) : (
        <div className="mt-4 flex gap-3.5 items-start">
          {columns.map((col, i) => (
            <div key={i} className="flex-1 min-w-0">
              {col.map(renderGroup)}
            </div>
          ))}
        </div>
      )}

      <Fab onClick={() => openEdit(undefined)} label="자산 추가" />
      <AssetModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} />
    </div>
  )
}

interface Hit { display: string; store: string; name: string; sub: string }

// 평가액 = 수량 × 현재가 (없으면 매입금액). 매입금액(principal)은 직접 입력
const holdingValue = (qty: number, unit: number | undefined, buy: number) => (unit != null ? Math.round(qty * unit) : buy)

// 계좌형(IRP·연금저축펀드) 개별 종목 편집기 — 검색(국내 주식/ETF)→수량·매입금액 자동, 또는 이름·평가액 직접입력
function HoldingEditor({ h, onChange, onRemove }: { h: Holding; onChange: (patch: Partial<Holding>) => void; onRemove: () => void }) {
  const searched = !!h.ticker
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)

  // 연금 계좌형 종목은 국내 주식/ETF만
  useEffect(() => {
    if (!q.trim()) { setHits([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      setHits(searchKrStocks(q).map((s) => ({ display: s.name, store: s.code, name: s.name, sub: `코드 ${s.code}` })))
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  async function pick(hit: Hit) {
    setQ(''); setHits([])
    const price = (await getKrStockPrice(hit.store))?.price ?? null
    const qty = Number(h.quantity) || 0, buy = Number(h.principal) || 0
    onChange({ name: hit.name, ticker: hit.store, live: 'stock', unitPrice: price ?? undefined, value: holdingValue(qty, price ?? undefined, buy) })
  }

  const qty = Number(h.quantity) || 0
  const setQty = (v: string) => onChange({ quantity: v === '' ? undefined : Number(v), value: holdingValue(Number(v) || 0, h.unitPrice, Number(h.principal) || 0) })
  const setBuy = (v: string) => onChange({ principal: v === '' ? 0 : Number(v), value: holdingValue(qty, h.unitPrice, Number(v) || 0) })
  const profit = (h.value || 0) - (h.principal || 0)
  const pct = (h.principal || 0) > 0 ? (profit / (h.principal || 1)) * 100 : 0

  return (
    <div className="border border-line rounded-[10px] p-2 mb-2">
      {searched ? (
        <div className="flex items-center justify-between mb-1.5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold truncate">{h.name} <span className="text-[10px] text-sub font-normal">{h.ticker}</span></div>
            <div className="text-[11px] text-mint-d">현재가 ₩{won(h.unitPrice ?? 0)}{h.unitPrice == null ? ' (조회 중)' : ''}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onChange({ ticker: undefined, live: undefined, unitPrice: undefined })} className="text-[11px] text-sub px-1.5 hover:text-ink">변경</button>
            <button onClick={onRemove} className="text-sub hover:text-expense p-1"><X size={15} /></button>
          </div>
        </div>
      ) : (
        <div className="mb-1.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="flex-1 min-w-0">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ETF·주식 검색 (국내)" className={inputCls + ' !py-1.5'} />
              {q.trim() && (
                <div className="mt-1 bg-surface border border-line rounded-[10px] shadow-sm max-h-44 overflow-auto">
                  {searching && <div className="px-3 py-2 text-[12px] text-sub">검색 중…</div>}
                  {!searching && hits.map((hit) => (
                    <button key={hit.store} onClick={() => pick(hit)} className="w-full text-left px-3 py-1.5 hover:bg-canvas border-b border-line last:border-0">
                      <div className="text-[12.5px] font-semibold">{hit.display}</div>
                      <div className="text-[10.5px] text-sub truncate">{hit.sub}</div>
                    </button>
                  ))}
                  {!searching && hits.length === 0 && <div className="px-3 py-2 text-[12px] text-sub">결과 없음</div>}
                </div>
              )}
            </div>
            <button onClick={onRemove} className="text-sub hover:text-expense p-1 shrink-0"><X size={15} /></button>
          </div>
          <input value={h.name ?? ''} onChange={(e) => onChange({ name: e.target.value })} placeholder="또는 이름 직접 입력 (검색 안 되는 펀드 등)" className={inputCls + ' !py-1.5 text-[12px]'} />
        </div>
      )}
      {searched ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <input type="number" value={h.quantity ?? ''} onChange={(e) => setQty(e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="수량" className={inputCls + ' text-right tnum !py-1.5'} />
            <DecimalInput value={h.principal ? String(h.principal) : ''} onChange={setBuy} placeholder="매입금액(원)" />
          </div>
          {(h.value || h.principal) ? <div className={`text-[11px] mt-1 ${profit >= 0 ? 'text-up' : 'text-down'}`}>평가 ₩{won(h.value || 0)} · 수익 {profit >= 0 ? '+' : ''}₩{won(profit)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</div> : null}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <AmountInput value={h.principal || null} onChange={(v) => onChange({ principal: v ?? 0 })} placeholder="원금" />
          <AmountInput value={h.value || null} onChange={(v) => onChange({ value: v ?? 0 })} placeholder="현재 평가액" />
        </div>
      )}
    </div>
  )
}

function AssetModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Asset; profileId: string }) {
  const [type, setType] = useState('checking')
  const [name, setName] = useState('')
  const [inst, setInst] = useState('')
  const [market, setMarket] = useState<'kr' | 'us'>('kr')
  const [currency, setCurrency] = useState('KRW')
  const [fxRate, setFxRate] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [principal, setPrincipal] = useState('') // 매입금액(총 투자금)
  const [quantity, setQuantity] = useState('')
  const [ticker, setTicker] = useState('')
  const [rate, setRate] = useState('')
  const [taxType, setTaxType] = useState<'normal' | 'preferential' | 'taxfree'>('normal')
  const [startDate, setStartDate] = useState('')
  const [maturity, setMaturity] = useState('')
  const [noMaturity, setNoMaturity] = useState(false)
  const [cashKind, setCashKind] = useState<'bank' | 'cash'>('bank') // 입출금 통장 / 현금
  const [savingKind, setSavingKind] = useState<'deposit' | 'installment'>('deposit')
  const [subLabel, setSubLabel] = useState('연금보험')
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [cash, setCash] = useState<number | null>(null)
  const [archived, setArchived] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [livePrice, setLivePrice] = useState<number | null>(null)

  const sub = subOf(type)
  const pensionInvest = !!sub.pension && PENSION_INVEST.includes(subLabel)
  const isInvest = !!sub.qty || pensionInvest
  const showSearch = sub.live === 'coin' || (sub.live === 'stock' && (market === 'us' || market === 'kr'))
  const foreign = currency !== 'KRW'

  useEffect(() => {
    if (!open) return
    setQ(''); setHits([]); setLivePrice(null)
    if (edit) {
      setType(edit.type); setName(edit.name); setInst(edit.institution ?? '')
      setMarket(edit.market ?? 'kr'); setCurrency(edit.currency ?? 'KRW'); setFxRate(edit.fxRate ? String(edit.fxRate) : '')
      setAmount(edit.amount); setTicker(edit.ticker ?? '')
      // 매입금액 = 저장된 principal, 없으면 구버전(수량×평단가)에서 환산
      setPrincipal(edit.principal != null ? String(edit.principal) : (edit.quantity && edit.avgPrice ? String(Math.round(edit.quantity * edit.avgPrice)) : ''))
      setQuantity(edit.quantity != null ? String(edit.quantity) : '')
      setRate(edit.rate != null ? String(edit.rate) : ''); setTaxType(edit.taxType ?? 'normal'); setStartDate(edit.startDate ?? ''); setMaturity(edit.maturity ?? ''); setNoMaturity(!edit.maturity && !!edit.rate)
      setCashKind(edit.type === 'checking' && edit.subLabel === '현금' ? 'cash' : 'bank')
      setSavingKind(edit.savingKind ?? 'deposit'); setSubLabel(edit.subLabel ?? '연금보험'); setHoldings(edit.holdings ?? []); setCash(edit.cash ?? null); setArchived(!!edit.archived)
    } else {
      setType('checking'); setName(''); setInst(''); setMarket('kr')
      setCurrency('KRW'); setFxRate(''); setAmount(null); setTicker('')
      setPrincipal(''); setQuantity('')
      setRate(''); setTaxType('normal'); setStartDate(''); setMaturity(''); setNoMaturity(false); setCashKind('bank'); setSavingKind('deposit'); setSubLabel('연금보험'); setHoldings([]); setCash(null); setArchived(false)
    }
  }, [open, edit])

  // 외화 자동 환율
  useEffect(() => {
    if (!open || currency === 'KRW') return
    let cancel = false
    fetchFxRate(currency).then((r) => { if (!cancel && r) setFxRate(String(Math.round(r * 100) / 100)) })
    return () => { cancel = true }
  }, [currency, open])

  // 저장한 종목을 수정으로 다시 열 때: 티커로 현재가 자동 재조회 (검색 안 해도 시세 반영)
  useEffect(() => {
    if (!open || !edit || !edit.ticker) return
    const s = subOf(edit.type)
    if (!s.live || s.live === 'gold') return
    let cancel = false
    ;(async () => {
      let p: number | null = null
      if (s.live === 'coin') p = await getCoinPriceKRW(edit.ticker!)
      else if (edit.market === 'us') p = await getStockPrice(edit.ticker!)
      else { const r = await getKrStockPrice(edit.ticker!); p = r ? r.price : null }
      if (!cancel && p != null) setLivePrice(p)
    })()
    return () => { cancel = true }
  }, [open, edit])

  // 금: 검색이 없으므로 열거나 금 분류 선택 시 KRX 금값(원/g) 자동 조회
  useEffect(() => {
    if (!open || sub.live !== 'gold') return
    let cancel = false
    getGoldKrwPerGram().then((p) => { if (!cancel && p) setLivePrice(p) })
    return () => { cancel = true }
  }, [open, type])

  // 검색 디바운스
  useEffect(() => {
    if (!showSearch || !q.trim()) { setHits([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res: Hit[] = sub.live === 'coin'
          ? (await searchCoins(q)).map((c) => ({ display: c.symbol, store: c.id, name: c.name, sub: c.name }))
          : market === 'kr'
            ? searchKrStocks(q).map((s) => ({ display: s.name, store: s.code, name: s.name, sub: `코드 ${s.code}` }))
            : (await searchStocks(q)).map((s) => ({ display: s.symbol, store: s.symbol, name: s.description, sub: s.description }))
        setHits(res)
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [q, showSearch, sub.live])

  async function pick(h: Hit) {
    setName(h.name); setTicker(h.store); setQ(''); setHits([])
    if (sub.live === 'coin') { setCurrency('KRW'); setLivePrice(await getCoinPriceKRW(h.store)) }
    else if (market === 'kr') { setCurrency('KRW'); const r = await getKrStockPrice(h.store); setLivePrice(r ? r.price : null); if (r?.name && /^\d{6}$/.test(h.name)) setName(r.name) }
    else { setMarket('us'); setCurrency('USD'); setLivePrice(await getStockPrice(h.store)) }
  }

  const instList = sub.inst === 'bank' ? BANKS : sub.inst === 'securities' ? SECURITIES : sub.inst === 'exchange' ? EXCHANGES : sub.inst === 'both' ? [...BANKS, ...SECURITIES] : null

  // 투자 계산
  // 시세연동 종목(주식/ETF/코인/금): 매입금액 입력 · 평가 = 수량×현재가 · 수익 = 평가−매입금액
  const useLive = !!sub.live
  const qtyNum = Number(quantity) || 0
  const principalNum = Number(String(principal).replace(/,/g, '')) || 0
  const investPrincipal = principalNum // 매입금액(총 투자금)
  const investValue = useLive ? (livePrice != null ? Math.round(qtyNum * livePrice) : principalNum) : (amount ?? 0)
  const investProfit = investValue - investPrincipal
  const investPct = investPrincipal > 0 ? (investProfit / investPrincipal) * 100 : 0
  const fxNum = Number(fxRate) || 0
  const investKrw = foreign && fxNum ? Math.round(investValue * fxNum) : investValue

  // 계좌형(IRP·연금저축펀드) 개별 종목
  const addHolding = () => setHoldings((h) => [...h, { id: uid(), name: '', principal: 0, value: 0 }])
  const updHolding = (id: string, patch: Partial<Holding>) => setHoldings((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const delHolding = (id: string) => setHoldings((h) => h.filter((x) => x.id !== id))
  const hSumPrincipal = holdings.reduce((s, h) => s + (Number(h.principal) || 0), 0)
  const hSumValue = holdings.reduce((s, h) => s + (Number(h.value) || 0), 0)
  const hProfit = hSumValue - hSumPrincipal
  const hPct = hSumPrincipal > 0 ? (hProfit / hSumPrincipal) * 100 : 0

  const krwPreview = foreign && amount && fxNum ? Math.round(amount * fxNum) : null
  const bankChecking = type === 'checking' && cashKind === 'bank'
  const showRate = !!sub.rate || bankChecking // 예적금 or 입출금(통장)
  const interestObj = showRate && Number(rate) > 0 && amount
    ? expectedInterest({
        amount, rate: Number(rate), taxType: sub.rate ? taxType : 'normal',
        currency: foreign ? currency : undefined, fxRate: foreign && fxNum ? fxNum : undefined,
        maturity: sub.rate && !noMaturity ? (maturity || undefined) : undefined, // 통장은 만기 없음
        startDate: sub.rate ? (startDate || undefined) : undefined,
      } as Asset)
    : null
  // 이자 결과 박스: 만기까지 낼 수 있으면 만기까지(세후·세전), 아니면 연(세후·세전) — 항상 2개만
  const toMat = interestObj?.toMaturityNet != null
  const taxPct = TAX_RATES[sub.rate ? taxType : 'normal'] * 100
  const taxNote = (sub.rate ? taxType : 'normal') === 'taxfree' ? '비과세 (세금 없음)' : `${TAX_LABELS[sub.rate ? taxType : 'normal']} ${Number.isInteger(taxPct) ? taxPct : taxPct.toFixed(1)}% 반영`
  const interestBox = interestObj ? (
    <div className="text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 mb-2">
      💰 {toMat ? '만기까지' : '연'} 예상 이자 · 세후 <b>₩{won(toMat ? interestObj.toMaturityNet! : interestObj.annualNet)}</b> · 세전 <b>₩{won(toMat ? interestObj.toMaturity! : interestObj.annual)}</b>
      <div className="text-[10.5px] text-sub mt-0.5">
        {taxNote}{toMat && interestObj.months != null ? ` · ${interestObj.months}개월 기준` : ''}{savingKind === 'installment' && sub.rate ? ' · 적금은 근사치예요' : ''}
        {sub.rate && !noMaturity && maturity && !startDate ? ' · 가입일을 넣으면 만기까지로 계산돼요' : ''}
      </div>
    </div>
  ) : null

  async function save() {
    // 금은 이름 생략 가능 — 증권사명 또는 '금'으로 대체
    const finalName = name.trim() || (sub.key === 'gold' ? (inst.trim() || '금') : '')
    if (!finalName) return
    const hs = pensionInvest
      ? holdings.filter((h) => h.name.trim() || h.value || h.principal || h.ticker).map((h) => ({
          id: h.id, name: h.name.trim(), principal: Number(h.principal) || 0, value: Number(h.value) || 0,
          ticker: h.ticker || undefined, live: h.live, quantity: h.quantity, unitPrice: h.unitPrice,
        }))
      : undefined
    const amt = pensionInvest ? (hSumValue + (cash ?? 0)) : (useLive ? investValue : (amount ?? 0))
    const liveQty = !pensionInvest && useLive && qtyNum > 0
    const a: Asset = {
      id: edit?.id ?? uid(), profileId, type, name: finalName,
      amount: amt,
      currency: currency === 'KRW' ? undefined : currency,
      fxRate: foreign && fxNum ? fxNum : undefined,
      institution: inst.trim() || undefined,
      market: sub.live === 'stock' ? market : undefined,
      principal: pensionInvest ? (hSumPrincipal || undefined) : (isInvest && principalNum > 0 ? principalNum : undefined),
      holdings: hs && hs.length ? hs : undefined,
      cash: pensionInvest && cash ? cash : undefined,
      quantity: liveQty ? qtyNum : undefined,
      unitPrice: liveQty && livePrice != null ? livePrice : undefined,
      ticker: !pensionInvest && sub.live && ticker.trim() ? ticker.trim() : undefined,
      rate: showRate && Number(rate) > 0 ? Number(rate) : undefined,
      taxType: sub.rate && taxType !== 'normal' ? taxType : undefined,
      startDate: sub.rate && startDate ? startDate : undefined,
      maturity: sub.rate && !noMaturity && maturity ? maturity : undefined,
      savingKind: sub.rate ? savingKind : undefined,
      subLabel: sub.pension ? subLabel : (type === 'checking' && cashKind === 'cash' ? '현금' : undefined),
      archived: archived || undefined,
      updatedAt: new Date().toISOString(),
    }
    await repo.upsertAsset(a)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '자산 수정' : '자산 추가'}>
      <div className="mb-3">
        <span className="text-[12px] font-semibold text-sub">분류</span>
        <div className="flex gap-1.5 flex-wrap mt-1.5">
          {SUBTYPES.map((s) => (
            <button key={s.key} onClick={() => { setType(s.key); setInst(''); setLivePrice(null); setCashKind('bank') }} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${sub.key === s.key ? 'bg-mint text-white border-mint' : 'bg-canvas text-sub border-line'}`}>{s.label}</button>
          ))}
        </div>
      </div>

      {sub.live === 'stock' && (
        <Field label="국내 / 해외">
          <div className="flex gap-1.5">
            {(['kr', 'us'] as const).map((mk) => (
              <button key={mk} onClick={() => setMarket(mk)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${market === mk ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{mk === 'kr' ? '국내' : '해외'}</button>
            ))}
          </div>
        </Field>
      )}

      {showSearch && (
        <Field label={sub.live === 'coin' ? '코인 검색' : market === 'kr' ? '종목 검색 (국내)' : '종목 검색 (해외)'}>
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sub.live === 'coin' ? 'BTC, ETH, bitcoin … (영문)' : market === 'kr' ? '삼성전자, 069500 …' : 'apple, AAPL …'} className={inputCls} />
            {q.trim() && (
              <div className="mt-1 bg-surface border border-line rounded-[10px] shadow-sm max-h-56 overflow-auto">
                {searching && <div className="px-3 py-2 text-[12px] text-sub">검색 중…</div>}
                {!searching && hits.map((h) => (
                  <button key={h.store} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-line last:border-0">
                    <div className="text-[13px] font-semibold">{h.display}</div>
                    <div className="text-[11px] text-sub truncate">{h.sub}</div>
                  </button>
                ))}
                {!searching && hits.length === 0 && <div className="px-3 py-2 text-[12px] text-sub">결과 없음</div>}
              </div>
            )}
          </div>
          {livePrice != null && <div className="text-[12px] text-mint-d mt-1">✓ {ticker} 현재가 {sub.live === 'coin' || market === 'kr' ? `₩${won(livePrice)}` : `$${livePrice}`}</div>}
          {sub.live === 'coin' && <div className="text-[11px] text-sub mt-1">※ 영문 이름·티커로 검색 (한글 미지원). 예: BTC, ETH, SOL</div>}
          {market === 'kr' && <div className="text-[11px] text-sub mt-1">※ 인기 종목은 이름으로, 나머지는 6자리 종목코드로 검색하세요.</div>}
        </Field>
      )}

      {sub.key !== 'gold' && (
        <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 주거래 통장 / 애플 / 비트코인" className={inputCls} /></Field>
      )}

      {type === 'checking' && (
        <Field label="종류">
          <div className="flex gap-1.5">
            {([['bank', '입출금(통장)'], ['cash', '현금']] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setCashKind(k); if (k === 'cash') { setRate(''); setInst('') } }} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${cashKind === k ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{l}</button>
            ))}
          </div>
        </Field>
      )}

      {sub.pension && (
        <Field label="종류">
          <select value={subLabel} onChange={(e) => setSubLabel(e.target.value)} className={inputCls}>
            {PENSION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      )}

      {sub.rate && (
        <Field label="종류">
          <div className="flex gap-1.5">
            {([['deposit', '예금(목돈)'], ['installment', '적금(매월)']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSavingKind(k)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${savingKind === k ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{l}</button>
            ))}
          </div>
        </Field>
      )}

      {instList && !(type === 'checking' && cashKind === 'cash') && (
        <Field label={sub.inst === 'bank' ? '은행' : sub.inst === 'securities' ? '증권사' : sub.inst === 'exchange' ? '거래소' : '기관 (선택)'}>
          <Autocomplete value={inst} onChange={setInst} options={instList} placeholder="검색해서 선택 (없으면 그냥 입력)" />
        </Field>
      )}

      {/* 계좌형(IRP·연금저축펀드): 개별 종목 여러 개 */}
      {pensionInvest ? (
        <>
          <div className="mb-1.5 mt-1 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-sub">보유 종목 (여러 개)</span>
            <button onClick={addHolding} className="text-[12px] font-bold text-mint-d flex items-center gap-1"><Plus size={13} /> 종목 추가</button>
          </div>
          {holdings.length === 0 && <div className="text-[12px] text-sub text-center py-3 border border-dashed border-line rounded-[10px] mb-2">‘종목 추가’로 계좌 안의 종목·펀드를 하나씩 넣으세요</div>}
          {holdings.map((h) => (
            <HoldingEditor key={h.id} h={h} onChange={(patch) => updHolding(h.id, patch)} onRemove={() => delHolding(h.id)} />
          ))}
          <Field label="예수금 (현금 · 선택)"><AmountInput value={cash} onChange={setCash} /></Field>
          {(holdings.length > 0 || cash) && (
            <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
              종목 원금 ₩{won(hSumPrincipal)} · 평가 ₩{won(hSumValue)} · 수익 <b className={hProfit >= 0 ? 'text-up' : 'text-down'}>{hProfit >= 0 ? '+' : ''}₩{won(hProfit)} ({hPct >= 0 ? '+' : ''}{hPct.toFixed(2)}%)</b>
              <div className="text-[11px] text-sub mt-0.5">+ 예수금 ₩{won(cash || 0)} = 총 ₩{won(hSumValue + (cash || 0))}</div>
            </div>
          )}
          <div className="text-[11px] text-sub -mt-1 mb-1">※ 종목을 검색해 수량·매입금액을 넣으면 현재가로 평가액이 자동 계산돼요. 검색 안 되는 펀드는 이름·평가액 직접 입력.</div>
        </>
      ) : isInvest ? (
        <>
          {sub.live === 'stock' && market === 'us' && (
            <Field label="통화">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
          )}
          {useLive ? (
            <>
              {sub.key === 'gold' && (
                <div className="text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2 mb-2">
                  🥇 현재 금 시세 {livePrice != null ? <b>₩{won(livePrice)}/g</b> : <span className="text-sub">불러오는 중…</span>}
                  <span className="text-[11px] text-sub"> · KRX 국내 금값</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={sub.key === 'gold' ? '보유 수량 (g)' : '보유 수량'}><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder={sub.key === 'gold' ? '예: 3.75' : '예: 10'} className={inputCls + ' text-right tnum'} /></Field>
                <Field label={`매입금액 (${foreign ? currency : '원'})`}><DecimalInput value={principal} onChange={setPrincipal} placeholder="총 투자한 금액" /></Field>
              </div>
              {qtyNum > 0 && principalNum > 0 && (
                <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
                  매입 {symbolOf(currency)}{won(investPrincipal)} → 평가 <b>{symbolOf(currency)}{won(investValue)}</b>{foreign && <span className="text-sub"> ≈ ₩{won(investKrw)}</span>}
                  <span className={investProfit >= 0 ? ' text-up' : ' text-down'}> · 수익 {investProfit >= 0 ? '+' : ''}{symbolOf(currency)}{won(investProfit)} ({investPct >= 0 ? '+' : ''}{investPct.toFixed(2)}%)</span>
                  {livePrice == null && <div className="text-[11px] text-sub mt-0.5">※ 현재가 불러오는 중 — 위에서 종목을 검색해 선택하면 시세가 반영돼요{sub.key === 'gold' ? ' (금은 자동)' : ''}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="원금 (투자한 금액)"><AmountInput value={principal === '' ? null : Number(principal)} onChange={(v) => setPrincipal(v == null ? '' : String(v))} /></Field>
              <Field label="현재 평가금액"><AmountInput value={amount} onChange={setAmount} /></Field>
              {(principalNum > 0 || (amount ?? 0) > 0) && (
                <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
                  수익 <b className={investProfit >= 0 ? 'text-up' : 'text-down'}>{investProfit >= 0 ? '+' : ''}₩{won(investProfit)} ({investPct >= 0 ? '+' : ''}{investPct.toFixed(2)}%)</b>
                </div>
              )}
            </>
          )}
          {sub.key === 'gold' && <div className="text-[11px] text-sub -mt-1 mb-1">※ 금 시세(원/g)는 KRX 국내 금값으로 자동 반영돼요. 보유 그램수와 매입금액(총 투자금)만 넣으세요.</div>}
        </>
      ) : (
        <>
          <div className={`grid ${sub.foreignOk ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            {sub.foreignOk && (
              <Field label="통화">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </Field>
            )}
            <Field label={sub.rate ? '현재 잔액 (원)' : `금액 (${foreign ? currency : '원'})`}><AmountInput value={amount} onChange={setAmount} /></Field>
          </div>
          {foreign && (
            <div className="text-[12px] text-mint-d -mt-1 mb-2">💱 원화 환산 ≈ ₩{krwPreview != null ? won(krwPreview) : '…'} <span className="text-sub">(환율 자동{fxRate ? ` ${fxRate}` : ''})</span></div>
          )}
          {bankChecking && (
            <>
              <Field label="금리 (연 %, 선택)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="예: 3.0 (파킹통장·CMA)" className={inputCls + ' text-right tnum'} /></Field>
              {interestBox}
            </>
          )}
        </>
      )}

      {sub.rate && (
        <>
          <Field label="금리 (연 %)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="예: 3.5" className={inputCls + ' text-right tnum'} /></Field>
          <Field label="과세 유형">
            <div className="flex gap-1.5">
              {(['normal', 'preferential', 'taxfree'] as const).map((k) => (
                <button key={k} onClick={() => setTaxType(k)} className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border ${taxType === k ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{TAX_LABELS[k]}</button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-[12.5px] text-sub -mt-1 mb-2 cursor-pointer">
            <input type="checkbox" checked={noMaturity} onChange={(e) => setNoMaturity(e.target.checked)} /> 만기 없음
          </label>
          {!noMaturity && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="가입일"><DateInput value={startDate} onChange={setStartDate} /></Field>
              <Field label="만기일"><DateInput value={maturity} onChange={setMaturity} /></Field>
            </div>
          )}
          {interestBox}
        </>
      )}

      {edit && (sub.live === 'stock' || sub.live === 'coin') && (
        <label className="flex items-center gap-2 text-[12.5px] text-sub mt-3 cursor-pointer">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> 상폐 처리 (목록 숨김 · 총액에서 제외)
        </label>
      )}

      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteAsset(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
