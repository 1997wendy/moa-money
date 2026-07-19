import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X, Plus, ChevronDown, Check } from 'lucide-react'
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
import { won, money, curSymbol, smallPrice, todayISO } from '../lib/format'
import {
  SUBTYPES, BANKS, SECURITIES, EXCHANGES, PENSION_KINDS, PENSION_PROVIDERS, CURRENCIES, TAX_LABELS, TAX_RATES, subOf, groupOf, krwValue, investPnl, expectedInterest, repayableTotal,
} from '../lib/assets'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import Autocomplete from '../components/Autocomplete'
import DateInput from '../components/DateInput'
import DecimalInput from '../components/DecimalInput'
import SupportSection from '../components/SupportSection'
import type { Asset, Holding, ExtraBalance } from '../db/types'

// ===== 표시용 그룹 (투자는 주식·ETF / 코인 / 금 별도 블럭으로 쪼갬) =====
interface DGroup { key: string; label: string; emoji: string; color: string }
const DGROUPS: DGroup[] = [
  { key: 'cash', label: '입출금·현금', emoji: '💵', color: '#14b8a6' }, // teal
  { key: 'saving', label: '예적금', emoji: '🏦', color: '#3b82f6' }, // blue
  { key: 'invest_stock', label: '주식·ETF', emoji: '📈', color: '#8b5cf6' }, // violet
  { key: 'invest_coin', label: '코인', emoji: '🪙', color: '#ec4899' }, // pink
  { key: 'invest_gold', label: '금', emoji: '🥇', color: '#f59e0b' }, // amber
  { key: 'pension', label: '연금', emoji: '🛡️', color: '#10b981' }, // green
  { key: 'etc', label: '기타·포인트', emoji: '📦', color: '#94a3b8' }, // slate
]
// 주식·ETF 블럭 안 소분류 순서 (국내주식→해외주식→국내ETF→해외ETF)
const STOCK_SUB_ORDER = ['kr_stock', 'us_stock', 'kr_etf', 'us_etf']
const stockSub = (a: Asset) => `${a.market === 'us' ? 'us' : 'kr'}_${a.type === 'etf' ? 'etf' : 'stock'}`
const stockSubLabel = (sub: string) => ({ kr_stock: '국내주식', us_stock: '해외주식', kr_etf: '국내 ETF', us_etf: '해외 ETF' } as Record<string, string>)[sub] ?? sub

// 자산 → 표시 그룹 키
function dgroupOf(a: Asset): string {
  const g = groupOf(a.type)
  if (g !== 'invest') return g
  if (a.type === 'coin') return 'invest_coin'
  if (a.type === 'gold') return 'invest_gold'
  return 'invest_stock' // 주식·ETF
}

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

const PENSION_INVEST = ['IRP', '연금저축펀드', '퇴직연금']

// 아주 작은 수(0.00000035)를 지수표기(3.5e-7)가 아닌 일반 소수 문자열로
const numStr = (n: number): string => {
  if (!n) return n === 0 ? '0' : ''
  const s = String(n)
  return s.includes('e') ? n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') : s
}

const COLLAPSE_KEY = 'moa.assets.collapsed'
const UPDATED_KEY = 'moa.assets.updated'

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

  // 업데이트 모드: '업데이트 시작'을 눌러야 체크박스가 나타남. 은행앱 대조하며 갱신한 항목을 체크 → '업데이트 완료'로 숨김.
  // 체크 상태·모드는 이 기기에만 저장(동기화 안 함).
  const updatedKey = `${UPDATED_KEY}.${profileId}`
  const modeKey = `${UPDATED_KEY}.mode.${profileId}`
  const [updated, setUpdated] = useState<Set<string>>(new Set())
  const [updateMode, setUpdateMode] = useState(false)
  useEffect(() => {
    try { setUpdated(new Set(JSON.parse(localStorage.getItem(updatedKey) || '[]'))) } catch { setUpdated(new Set()) }
    setUpdateMode(localStorage.getItem(modeKey) === '1')
  }, [updatedKey, modeKey])
  const mutateUpdated = (fn: (s: Set<string>) => void) => setUpdated((prev) => { const s = new Set(prev); fn(s); try { localStorage.setItem(updatedKey, JSON.stringify([...s])) } catch { /* noop */ } return s })
  const toggleUpdated = (id: string) => mutateUpdated((s) => { s.has(id) ? s.delete(id) : s.add(id) })
  const markUpdated = (id: string) => { if (updateMode) mutateUpdated((s) => { s.add(id) }) } // 업데이트 모드일 때만 저장 시 자동 체크
  const startUpdate = () => { mutateUpdated((s) => s.clear()); setUpdateMode(true); try { localStorage.setItem(modeKey, '1') } catch { /* noop */ } }
  const finishUpdate = () => { mutateUpdated((s) => s.clear()); setUpdateMode(false); try { localStorage.setItem(modeKey, '0') } catch { /* noop */ } }

  const supports = useLiveQuery(() => (profileId ? repo.listSupports(profileId) : []), [profileId], [])
  const total = assets.filter(countsToTotal).reduce((s, a) => s + krwValue(a), 0)
  const repayable = repayableTotal(supports) // 돌려줘야 하는 지원금
  const myMoney = total - repayable // '온전한 내 돈'

  // 만기 임박 먼저(임박순), 그다음 금액 큰 순
  const sortItems = (a: Asset, b: Asset) => {
    const sa = isMaturingSoon(a), sb = isMaturingSoon(b)
    if (sa !== sb) return sa ? -1 : 1
    if (sa && sb) return daysToMaturity(a)! - daysToMaturity(b)!
    return krwValue(b) - krwValue(a)
  }
  // 입출금·현금은 금리 높은 순으로 (금리 같으면 금액 순)
  const sortCash = (a: Asset, b: Asset) => ((b.rate ?? 0) - (a.rate ?? 0)) || (krwValue(b) - krwValue(a))

  // 한 표시그룹의 소분류(subGroups) 만들기
  const buildSubs = (gkey: string, vis: Asset[]) => {
    const sorter = gkey === 'cash' ? sortCash : sortItems
    const mk = (key: string, label: string, items: Asset[]) => {
      let prin = 0, prof = 0
      for (const a of items.filter(countsToTotal)) { const p = investPnl(a); if (p) { prin += p.principal; prof += p.profit } }
      return { key, label, items: [...items].sort(sorter), pnl: prin > 0 ? { profit: prof, pct: (prof / prin) * 100 } : null }
    }
    if (gkey === 'invest_stock') {
      // 국내주식/해외주식/국내ETF/해외ETF 소제목 분리
      return STOCK_SUB_ORDER
        .map((sub) => ({ sub, items: vis.filter((a) => stockSub(a) === sub) }))
        .filter((x) => x.items.length > 0)
        .map((x) => mk(x.sub, stockSubLabel(x.sub), x.items))
    }
    return [mk(gkey, '', vis)] // 단일 소분류
  }

  const byGroup = DGROUPS.map((g) => {
    const all = assets.filter((a) => dgroupOf(a) === g.key)
    const vis = all.filter((a) => !isHidden(a))
    // 입출금은 숨김(0원)도 금리순, 나머지는 금액순
    const hidden = all.filter(isHidden).sort(g.key === 'cash' ? sortCash : (a, b) => krwValue(b) - krwValue(a))
    const subGroups = buildSubs(g.key, vis)
    const sum = all.filter(countsToTotal).reduce((s, a) => s + krwValue(a), 0)
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
    const isUpd = updateMode && updated.has(a.id)
    return (
      <div key={a.id} className={`py-2.5 border-b border-line last:border-0 ${muted ? 'opacity-60' : ''} ${isUpd ? 'bg-mint-l/50 -mx-1 px-1 rounded-lg' : ''}`}>
        <div className="flex items-center gap-2">
          {updateMode && (
            <button onClick={() => toggleUpdated(a.id)} title={isUpd ? '체크 해제' : '업데이트했다고 체크'} className={`shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-colors ${isUpd ? 'bg-mint border-mint text-white' : 'border-line text-transparent hover:border-mint'}`}><Check size={11} strokeWidth={3} /></button>
          )}
          <div onClick={() => openEdit(a)} className="flex-1 min-w-0 flex items-center justify-between cursor-pointer hover:bg-canvas -ml-2 pl-2 rounded-lg">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13.5px] font-semibold truncate">{a.name}</span>
                {assetBadge(a) && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-canvas text-sub">{assetBadge(a)}</span>}
                {a.manual && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#eef2ff] text-[#6366f1]">수동</span>}
                {soon && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fef2df] text-[#b7791f]">만기 {dday === 0 ? '오늘' : `D-${dday}`}</span>}
                {expired && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fdecec] text-expense">만료</span>}
                {a.archived && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#fdecec] text-expense">상폐</span>}
              </div>
              <div className="text-[11px] text-sub truncate">
                {[
                  subOf(a.type).pension && a.subLabel ? a.subLabel : null,
                  a.institution || null,
                  a.ticker || null,
                  a.holdings && a.holdings.length ? `${a.holdings.length}종목` : null,
                  a.rate ? `연 ${a.rate}%${a.maturity ? ` · ~${a.maturity.slice(2)}` : ' 무기한'}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
              {interest && <div className="text-[11px] text-mint-d">💰 {interest.toMaturityNet != null ? `만기까지 세후 ₩${won(interest.toMaturityNet)}` : `세후 ₩${won(interest.annualNet)}/년`}</div>}
              {pnl && <div className={`text-[11px] ${pnl.profit >= 0 ? 'text-up' : 'text-down'}`}>{pnl.profit >= 0 ? '▲' : '▼'} {pnl.pct >= 0 ? '+' : ''}{pnl.pct.toFixed(2)}% (₩{won(Math.abs(pnl.profit))})</div>}
            </div>
            <div className="text-right shrink-0">
              {a.extraBalances && a.extraBalances.length > 0 ? (
                <>
                  <div className="text-[14px] font-bold tnum">₩{won(krwValue(a))}</div>
                  <div className="text-[11px] text-sub tnum">₩{won(a.amount)} + {a.extraBalances.map((b) => `${curSymbol(b.currency)}${money(b.amount, b.currency)}`).join(' + ')}</div>
                </>
              ) : foreign ? (
                <>
                  <div className="text-[14px] font-bold tnum">{curSymbol(a.currency)}{money(a.amount, a.currency)}</div>
                  <div className="text-[11px] text-sub tnum">≈ ₩{won(krwValue(a))}</div>
                </>
              ) : (
                <div className="text-[14px] font-bold tnum">{won(a.amount)}</div>
              )}
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

      {updateMode ? (
        <div className="flex items-center justify-between gap-2 bg-mint-l text-mint-d rounded-[10px] px-3 py-2 mb-3 text-[12.5px] font-semibold">
          <span>🔄 업데이트 중 · {updated.size}개 체크됨 <span className="font-normal text-sub">· 갱신한 항목 왼쪽 동그라미를 눌러 체크</span></span>
          <button onClick={finishUpdate} className="shrink-0 bg-mint text-white rounded-lg px-3 py-1.5 text-[12px] font-bold hover:opacity-90">업데이트 완료</button>
        </div>
      ) : (
        <div className="flex justify-end mb-2">
          <button onClick={startUpdate} className="text-[12px] font-bold text-mint-d border border-line rounded-lg px-3 py-1.5 hover:bg-canvas flex items-center gap-1"><Check size={13} /> 업데이트 시작</button>
        </div>
      )}

      <Card>
        {repayable > 0 ? (
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[11px] text-sub">받은 돈 포함 총자산</div>
              <div className="text-[19px] font-extrabold tnum">₩{won(total)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-mint-d font-semibold">내 돈만 (받은 돈 제외)</div>
              <div className="text-[19px] font-extrabold tnum text-mint-d">₩{won(myMoney)}</div>
            </div>
          </div>
        ) : (
          <CardLabel>자산 구성 · 총 ₩{won(total)}</CardLabel>
        )}
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

      {/* 가족에게 받은 돈 (엄마·아빠 지원금) — 총자산엔 포함되지만 '내 돈만'과 구분 */}
      <SupportSection profileId={profileId} supports={supports} />

      <Fab onClick={() => openEdit(undefined)} label="자산 추가" />
      <AssetModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} onSaved={markUpdated} />
    </div>
  )
}

interface Hit { display: string; store: string; name: string; sub: string }

// 평가액 = 수량 × 현재가 (없으면 매입금액). 원 미만 내림. 매입금액(principal)은 직접 입력
const holdingValue = (qty: number, unit: number | undefined, buy: number) => (unit != null ? Math.floor(qty * unit) : buy)

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
    const r = await getKrStockPrice(hit.store)
    const price = r?.price ?? null
    // 6자리 코드로 검색했으면 조회된 실제 종목명을 이름으로 (없으면 코드 그대로 — 나중에 직접 수정 가능)
    const nm = /^\d{6}$/.test(hit.name) ? (r?.name || hit.name) : hit.name
    const qty = Number(h.quantity) || 0, buy = Number(h.principal) || 0
    onChange({ name: nm, ticker: hit.store, live: 'stock', unitPrice: price ?? undefined, value: holdingValue(qty, price ?? undefined, buy) })
  }

  const qty = Number(h.quantity) || 0
  const setQty = (v: string) => onChange({ quantity: v === '' ? undefined : Number(v), value: holdingValue(Number(v) || 0, h.unitPrice, Number(h.principal) || 0) })
  const setBuy = (v: string) => onChange({ principal: v === '' ? 0 : Number(v), value: holdingValue(qty, h.unitPrice, Number(v) || 0) })
  const profit = (h.value || 0) - (h.principal || 0)
  const pct = (h.principal || 0) > 0 ? (profit / (h.principal || 1)) * 100 : 0

  return (
    <div className="border border-line rounded-[10px] p-2 mb-2">
      {searched ? (
        <div className="mb-1.5">
          <div className="flex items-center gap-1.5">
            {/* 코드로 저장돼도 이름을 알아보기 쉽게 바꿀 수 있게 (예: 360750 → TIGER 미국S&P500) */}
            <input value={h.name ?? ''} onChange={(e) => onChange({ name: e.target.value })} placeholder="종목 이름 (직접 수정 가능)" className={inputCls + ' !py-1.5 flex-1 min-w-0'} />
            <button onClick={() => onChange({ ticker: undefined, live: undefined, unitPrice: undefined })} className="text-[11px] text-sub px-1.5 hover:text-ink shrink-0">변경</button>
            <button onClick={onRemove} className="text-sub hover:text-expense p-1 shrink-0"><X size={15} /></button>
          </div>
          <div className="text-[11px] text-mint-d mt-1">{h.ticker} · 현재가 ₩{won(h.unitPrice ?? 0)}{h.unitPrice == null ? ' (조회 중)' : ''}</div>
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

function AssetModal({ open, onClose, edit, profileId, onSaved }: { open: boolean; onClose: () => void; edit?: Asset; profileId: string; onSaved?: (id: string) => void }) {
  const [type, setType] = useState('checking')
  const [name, setName] = useState('')
  const [inst, setInst] = useState('')
  const [market, setMarket] = useState<'kr' | 'us'>('kr')
  const [currency, setCurrency] = useState('KRW')
  const [fxRate, setFxRate] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [principal, setPrincipal] = useState('') // 매입금액(총 투자금)
  const [principalCcy, setPrincipalCcy] = useState('KRW') // 매입금액 통화 (원/달러 선택 — 해외주식·코인)
  const [manual, setManual] = useState(false) // 시세연동 없이 직접입력(검색 안 되는 펀드 등)
  const [extraBalances, setExtraBalances] = useState<ExtraBalance[]>([]) // 입출금 계좌 안 외화(원화+달러 동시)
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
  const [priceLoading, setPriceLoading] = useState(false) // 현재가 불러오는 중

  const [pFxRate, setPFxRate] = useState('') // 매입금액 통화(달러)의 환율 — 코인을 달러로 산 경우 등
  const sub = subOf(type)
  const pensionInvest = !!sub.pension && PENSION_INVEST.includes(subLabel)
  const isInvest = !!sub.qty || pensionInvest
  // 매입금액 통화를 원/달러로 고를 수 있는 자산 (해외주식·코인)
  const canPickPrincipalCcy = !pensionInvest && (sub.live === 'coin' || (sub.live === 'stock' && market === 'us'))
  const showSearch = !manual && (sub.live === 'coin' || (sub.live === 'stock' && (market === 'us' || market === 'kr')))
  const foreign = currency !== 'KRW'

  useEffect(() => {
    if (!open) return
    // 기존 자산은 마지막 저장된 시세로 먼저 채움 → 시세 조회 일시 실패해도 값 유지(수동모드로 안 빠짐)
    setQ(''); setHits([]); setLivePrice(edit?.unitPrice ?? null)
    if (edit) {
      setType(edit.type); setName(edit.name); setInst(edit.institution ?? '')
      setMarket(edit.market ?? 'kr'); setCurrency(edit.currency ?? 'KRW'); setFxRate(edit.fxRate ? String(edit.fxRate) : '')
      setAmount(edit.amount); setTicker(edit.ticker ?? '')
      // 매입금액 = 저장된 principal, 없으면 구버전(수량×평단가)에서 환산
      setPrincipal(edit.principal != null ? numStr(edit.principal) : (edit.quantity && edit.avgPrice ? String(Math.round(edit.quantity * edit.avgPrice)) : ''))
      setPrincipalCcy(edit.principalCurrency ?? (edit.currency && edit.currency !== 'KRW' ? edit.currency : 'KRW'))
      setManual(!!edit.manual)
      setExtraBalances(edit.extraBalances ?? [])
      setQuantity(edit.quantity != null ? numStr(edit.quantity) : '')
      setRate(edit.rate != null ? String(edit.rate) : ''); setTaxType(edit.taxType ?? 'normal'); setStartDate(edit.startDate ?? ''); setMaturity(edit.maturity ?? ''); setNoMaturity(!edit.maturity && !!edit.rate)
      setCashKind(edit.type === 'checking' && edit.subLabel === '현금' ? 'cash' : 'bank')
      setSavingKind(edit.savingKind ?? 'deposit'); setSubLabel(edit.subLabel ?? '연금보험'); setHoldings(edit.holdings ?? []); setCash(edit.cash ?? null); setArchived(!!edit.archived)
    } else {
      setType('checking'); setName(''); setInst(''); setMarket('kr')
      setCurrency('KRW'); setFxRate(''); setAmount(null); setTicker('')
      setPrincipal(''); setPrincipalCcy('KRW'); setManual(false); setExtraBalances([]); setQuantity('')
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

  // 매입금액 통화(달러 등) 환율 — 코인을 달러로 산 경우처럼 자산 통화와 다를 때
  useEffect(() => {
    if (!open || principalCcy === 'KRW' || principalCcy === currency) return
    let cancel = false
    fetchFxRate(principalCcy).then((r) => { if (!cancel && r) setPFxRate(String(Math.round(r * 100) / 100)) })
    return () => { cancel = true }
  }, [principalCcy, currency, open])

  // 저장한 종목을 수정으로 다시 열 때: 티커로 현재가 자동 재조회 (검색 안 해도 시세 반영)
  useEffect(() => {
    if (!open || !edit || !edit.ticker) return
    const s = subOf(edit.type)
    if (!s.live || s.live === 'gold') return
    let cancel = false
    setPriceLoading(true)
    ;(async () => {
      let p: number | null = null
      if (s.live === 'coin') p = await getCoinPriceKRW(edit.ticker!)
      else if (edit.market === 'us') p = await getStockPrice(edit.ticker!)
      else { const r = await getKrStockPrice(edit.ticker!); p = r ? r.price : null }
      if (!cancel) { if (p != null) setLivePrice(p); setPriceLoading(false) }
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
    setName(h.name); setTicker(h.store); setQ(''); setHits([]); setPriceLoading(true)
    try {
      if (sub.live === 'coin') { setCurrency('KRW'); setLivePrice(await getCoinPriceKRW(h.store)) }
      else if (market === 'kr') { setCurrency('KRW'); const r = await getKrStockPrice(h.store); setLivePrice(r ? r.price : null); if (r?.name && /^\d{6}$/.test(h.name)) setName(r.name) }
      else { setMarket('us'); setCurrency('USD'); setLivePrice(await getStockPrice(h.store)) }
    } finally { setPriceLoading(false) }
  }

  // 해외주식: 검색에 없는 종목을 티커로 직접 추가 (BRK.B 등). 시세 못 불러오면 평가금액 직접입력으로 전환
  async function pickUsTicker(raw: string) {
    const sym = raw.trim().toUpperCase()
    if (!sym) return
    setTicker(sym); if (!name.trim()) setName(sym); setQ(''); setHits([])
    setMarket('us'); setCurrency('USD'); setPriceLoading(true)
    try { setLivePrice(await getStockPrice(sym)) } finally { setPriceLoading(false) }
  }

  const instList = sub.inst === 'bank' ? BANKS : sub.inst === 'securities' ? SECURITIES : sub.inst === 'exchange' ? EXCHANGES : sub.inst === 'both' ? [...BANKS, ...SECURITIES] : sub.pension ? PENSION_PROVIDERS : null

  // 해외/국내 '주식'인데 현재가를 못 불러온 경우(BRK.B·펀드 등)만 평가금액 직접입력으로 전환.
  // 코인은 CoinGecko 일시 실패(레이트리밋)를 상폐로 오인하면 안 되므로 자동전환 제외.
  const priceUnavailable = !manual && sub.live === 'stock' && !!ticker.trim() && livePrice == null && !priceLoading
  const manualEntry = manual || priceUnavailable // 직접 평가금액 입력 모드
  // 투자 계산 — 손익은 모두 '원화' 기준. 평가액은 자산 통화(달러 등) 소수 유지.
  const useLive = !!sub.live && !manualEntry
  const qtyNum = Number(quantity) || 0
  const principalNum = Number(String(principal).replace(/,/g, '')) || 0
  const fxNum = Number(fxRate) || 0
  const round2 = (n: number) => (currency === 'USD' ? Math.floor(n * 100) / 100 : Math.floor(n))
  const toKrwLocal = (v: number, ccy: string, fx: number) => (ccy && ccy !== 'KRW' ? Math.floor(v * fx) : v)
  // 직접입력 모드에선 원금·평가금액을 '자산 통화(currency)'로 취급 (달러 펀드도 가능)
  const effPrincipalCcy = manualEntry ? currency : principalCcy
  // 평가액 (자산 통화). 직접입력이면 입력한 평가금액, 아니면 수량×현재가
  const investValueNative = manualEntry ? (amount ?? 0) : (useLive && livePrice != null ? round2(qtyNum * livePrice) : 0)
  const investValueKrw = toKrwLocal(investValueNative, currency, fxNum)
  // 매입금액 → 원화 (매입 통화 기준)
  const pFxNum = effPrincipalCcy === currency ? fxNum : (Number(pFxRate) || 0)
  const principalKrwVal = toKrwLocal(principalNum, effPrincipalCcy, pFxNum)
  const investProfit = investValueKrw - principalKrwVal // 원화 손익
  const investPct = principalKrwVal > 0 ? (investProfit / principalKrwVal) * 100 : 0

  // 계좌형(IRP·연금저축펀드) 개별 종목
  const addHolding = () => setHoldings((h) => [...h, { id: uid(), name: '', principal: 0, value: 0 }])
  const updHolding = (id: string, patch: Partial<Holding>) => setHoldings((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const delHolding = (id: string) => setHoldings((h) => h.filter((x) => x.id !== id))

  // 계좌 안 추가 외화 잔액 (원화+달러 동시)
  const updExtra = (id: string, patch: Partial<ExtraBalance>) => setExtraBalances((x) => x.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const delExtra = (id: string) => setExtraBalances((x) => x.filter((b) => b.id !== id))
  const changeExtraCcy = (id: string, ccy: string) => {
    updExtra(id, { currency: ccy, fxRate: undefined })
    fetchFxRate(ccy).then((r) => { if (r) updExtra(id, { fxRate: Math.round(r * 100) / 100 }) })
  }
  const addExtra = () => {
    const id = uid()
    setExtraBalances((x) => [...x, { id, currency: 'USD', amount: 0 }])
    fetchFxRate('USD').then((r) => { if (r) updExtra(id, { fxRate: Math.round(r * 100) / 100 }) })
  }
  const hSumPrincipal = holdings.reduce((s, h) => s + (Number(h.principal) || 0), 0)
  const hSumValue = holdings.reduce((s, h) => s + (Number(h.value) || 0), 0)
  const hProfit = hSumValue - hSumPrincipal
  const hPct = hSumPrincipal > 0 ? (hProfit / hSumPrincipal) * 100 : 0

  const krwPreview = foreign && amount && fxNum ? Math.floor(amount * fxNum) : null
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
    const amt = pensionInvest ? (hSumValue + (cash ?? 0)) : (useLive ? investValueNative : (amount ?? 0))
    const liveQty = !pensionInvest && useLive && qtyNum > 0
    // 매입금액은 '입력한 통화 그대로' 저장 (달러 매수는 달러로) + 원화 환산용 환율(principalFx)만 별도 저장
    const principalToStore = pensionInvest ? (hSumPrincipal || undefined) : (isInvest && principalNum > 0 ? principalNum : undefined)
    // 자산 통화 (직접입력 펀드도 달러 등 가능)
    const assetCurrency = currency !== 'KRW' ? currency : undefined
    const extras = type === 'checking' ? extraBalances.filter((b) => b.currency && (Number(b.amount) || 0) > 0) : []
    const a: Asset = {
      id: edit?.id ?? uid(), profileId, type, name: finalName,
      amount: amt,
      currency: assetCurrency,
      fxRate: assetCurrency && fxNum ? fxNum : undefined,
      institution: inst.trim() || undefined,
      market: sub.live === 'stock' ? market : undefined,
      principal: principalToStore,
      principalCurrency: principalToStore != null && !pensionInvest ? effPrincipalCcy : undefined,
      principalFx: principalToStore != null && !pensionInvest && effPrincipalCcy !== 'KRW' && effPrincipalCcy !== assetCurrency ? (pFxNum || undefined) : undefined,
      manual: manualEntry && isInvest && !pensionInvest ? true : undefined,
      extraBalances: extras.length ? extras : undefined,
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
    onSaved?.(a.id)
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sub.live === 'coin' ? 'BTC, ETH, bitcoin … (영문)' : market === 'kr' ? '삼성전자, 069500 …' : 'apple, AAPL, BRK.B …'} className={inputCls} />
            {q.trim() && (
              <div className="mt-1 bg-surface border border-line rounded-[10px] shadow-sm max-h-56 overflow-auto">
                {searching && <div className="px-3 py-2 text-[12px] text-sub">검색 중…</div>}
                {!searching && hits.map((h) => (
                  <button key={h.store} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-line last:border-0">
                    <div className="text-[13px] font-semibold">{h.display}</div>
                    <div className="text-[11px] text-sub truncate">{h.sub}</div>
                  </button>
                ))}
                {/* 해외주식: 검색에 없어도 티커를 그대로 입력해 추가 (BRK.B 등) */}
                {!searching && sub.live === 'stock' && market === 'us' && (
                  <button onClick={() => pickUsTicker(q)} className="w-full text-left px-3 py-2 hover:bg-canvas border-t border-line bg-mint-l/40">
                    <div className="text-[13px] font-semibold text-mint-d">＋ ‘{q.trim().toUpperCase()}’ 티커로 바로 추가</div>
                    <div className="text-[11px] text-sub">검색에 안 나오는 종목은 티커(BRK.B 등)를 그대로 넣으세요</div>
                  </button>
                )}
                {!searching && hits.length === 0 && sub.live !== 'stock' && <div className="px-3 py-2 text-[12px] text-sub">결과 없음</div>}
              </div>
            )}
          </div>
          {livePrice != null && <div className="text-[12px] text-mint-d mt-1">✓ {ticker} 현재가 {sub.live === 'coin' || market === 'kr' ? `₩${smallPrice(livePrice)}` : `$${livePrice}`}</div>}
          {sub.live === 'coin' && <div className="text-[11px] text-sub mt-1">※ 영문 이름·티커로 검색 (한글 미지원). 예: BTC, ETH, SOL</div>}
          {market === 'kr' && <div className="text-[11px] text-sub mt-1">※ 인기 종목은 이름으로, 나머지는 6자리 종목코드로 검색하세요.</div>}
        </Field>
      )}

      {/* 검색이 안 되는 펀드·종목은 직접 입력 (시세연동 없이 평가액 수동) */}
      {sub.live === 'stock' && (
        <label className="flex items-center gap-2 text-[12.5px] text-sub -mt-1 mb-2 cursor-pointer">
          <input type="checkbox" checked={manual} onChange={(e) => { const on = e.target.checked; setManual(on); if (on) { setTicker(''); setLivePrice(null); setQ(''); if (market === 'us') setCurrency('USD') } }} />
          검색이 안 되는 펀드·종목이에요 (이름·평가액 직접 입력)
        </label>
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
        <Field label={sub.inst === 'bank' ? '은행' : sub.inst === 'securities' ? '증권사' : sub.inst === 'exchange' ? '거래소' : sub.pension ? '가입 기관 (증권사·보험사·은행)' : '기관 (선택)'}>
          <Autocomplete value={inst} onChange={setInst} options={instList} placeholder={sub.pension ? '예: 삼성생명, 한국투자증권' : '검색해서 선택 (없으면 그냥 입력)'} />
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
          {useLive ? (
            <>
              {sub.key === 'gold' && (
                <div className="text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2 mb-2">
                  🥇 현재 금 시세 {livePrice != null ? <b>₩{won(livePrice)}/g</b> : <span className="text-sub">불러오는 중…</span>}
                  <span className="text-[11px] text-sub"> · KRX 국내 금값</span>
                </div>
              )}
              {/* 매입금액 통화 선택 (해외주식·코인: 원/달러) */}
              {canPickPrincipalCcy && (
                <Field label="매입금액 통화">
                  <div className="flex gap-1.5">
                    {(['KRW', 'USD'] as const).map((c) => (
                      <button key={c} onClick={() => setPrincipalCcy(c)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${principalCcy === c ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{c === 'KRW' ? '원 (₩)' : '달러 ($)'}</button>
                    ))}
                  </div>
                  <div className="text-[11px] text-sub mt-1">{principalCcy === 'KRW' ? '실제로 낸 원화 금액을 넣으세요 (예: 토스로 40만원 매수)' : '달러로 매수했다면 달러 금액 (예: 바이낸스)'}</div>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={sub.key === 'gold' ? '보유 수량 (g)' : '보유 수량'}><DecimalInput value={quantity} onChange={setQuantity} placeholder={sub.key === 'gold' ? '예: 3.75' : '예: 10'} /></Field>
                <Field label={`매입금액 (${principalCcy === 'KRW' ? '원' : principalCcy})`}><DecimalInput value={principal} onChange={setPrincipal} placeholder="총 투자한 금액" /></Field>
              </div>
              {qtyNum > 0 && principalNum > 0 && (
                <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
                  평가 <b>₩{won(investValueKrw)}</b>{foreign && livePrice != null && <span className="text-sub"> ({curSymbol(currency)}{money(investValueNative, currency)})</span>} · 매입 ₩{won(principalKrwVal)}
                  <span className={investProfit >= 0 ? ' text-up' : ' text-down'}> · 수익 {investProfit >= 0 ? '+' : ''}₩{won(investProfit)} ({investPct >= 0 ? '+' : ''}{investPct.toFixed(2)}%)</span>
                  {livePrice == null && <div className="text-[11px] text-sub mt-0.5">※ 현재가 불러오는 중 — 위에서 종목을 검색해 선택하면 시세가 반영돼요{sub.key === 'gold' ? ' (금은 자동)' : ''}</div>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[12px] text-sub bg-mint-l/40 rounded-lg px-3 py-2 mb-2">
                {priceUnavailable
                  ? <>ℹ️ ‘{ticker}’ 현재가를 자동으로 불러올 수 없어요. <b className="text-ink">원금·평가금액을 직접 넣으면</b> 그대로 반영하고 <b className="text-ink">수동</b> 표시를 달아둘게요.</>
                  : <>✍️ 직접 입력 모드 — 시세 자동연동 없이 원금·평가금액을 직접 넣어요 (펀드 등). <b className="text-ink">수동</b>으로 표시돼요.</>}
              </div>
              <Field label="통화">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </Field>
              <Field label={`원금 (투자한 금액, ${foreign ? currency : '원'})`}>
                {foreign
                  ? <DecimalInput value={principal} onChange={setPrincipal} placeholder="총 투자한 금액" />
                  : <AmountInput value={principal === '' ? null : Number(principal)} onChange={(v) => setPrincipal(v == null ? '' : String(v))} />}
              </Field>
              <Field label={`현재 평가금액 (${foreign ? currency : '원'})`}>
                {foreign
                  ? <DecimalInput value={amount == null ? '' : numStr(amount)} onChange={(v) => setAmount(v === '' ? null : Number(v))} placeholder="현재 평가금액" />
                  : <AmountInput value={amount} onChange={setAmount} />}
              </Field>
              {foreign && (
                <div className="text-[12px] text-mint-d -mt-1 mb-2">💱 평가 ≈ ₩{won(investValueKrw)} <span className="text-sub">(환율 자동{fxRate ? ` ${fxRate}` : ''})</span></div>
              )}
              {(principalNum > 0 || (amount ?? 0) > 0) && (
                <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
                  {foreign && <>평가 <b>₩{won(investValueKrw)}</b> · 매입 ₩{won(principalKrwVal)} · </>}수익 <b className={investProfit >= 0 ? 'text-up' : 'text-down'}>{investProfit >= 0 ? '+' : ''}₩{won(investProfit)} ({investPct >= 0 ? '+' : ''}{investPct.toFixed(2)}%)</b>
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
            <Field label={sub.rate ? '현재 잔액 (원)' : `금액 (${foreign ? currency : '원'})`}>
              {foreign
                ? <DecimalInput value={amount == null ? '' : String(amount)} onChange={(v) => setAmount(v === '' ? null : Number(v))} placeholder="소수점까지 (예: 20.50)" />
                : <AmountInput value={amount} onChange={setAmount} />}
            </Field>
          </div>
          {foreign && (
            <div className="text-[12px] text-mint-d -mt-1 mb-2">💱 원화 환산 ≈ ₩{krwPreview != null ? won(krwPreview) : '…'} <span className="text-sub">(환율 자동{fxRate ? ` ${fxRate}` : ''})</span></div>
          )}
          {/* 한 계좌에 원화 + 외화가 함께 있을 때 (예: 토스증권 100원 + 20달러) — 금리보다 위 */}
          {type === 'checking' && (
            <div className="mt-1 mb-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-semibold text-sub">외화도 함께 있어요 (선택)</span>
                <button onClick={addExtra} className="text-[12px] font-bold text-mint-d flex items-center gap-1"><Plus size={13} /> 외화 추가</button>
              </div>
              {extraBalances.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5 mb-1.5">
                  <select value={b.currency} onChange={(e) => changeExtraCcy(b.id, e.target.value)} className={inputCls + ' !w-24 !py-1.5'}>
                    {CURRENCIES.filter((c) => c.code !== 'KRW').map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                  <div className="flex-1"><DecimalInput value={b.amount ? String(b.amount) : ''} onChange={(v) => updExtra(b.id, { amount: v === '' ? 0 : Number(v) })} placeholder="외화 금액" /></div>
                  <span className="text-[11px] text-sub tnum w-24 text-right shrink-0">≈ ₩{won(Math.floor((b.fxRate ?? 0) * (Number(b.amount) || 0)))}</span>
                  <button onClick={() => delExtra(b.id)} className="text-sub hover:text-expense p-1 shrink-0"><X size={15} /></button>
                </div>
              ))}
            </div>
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
