import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { useStockSync } from '../hooks/useStockSync'
import { searchStocks, getStockPrice } from '../lib/stockApi'
import { searchCoins, getCoinPrice } from '../lib/coinApi'
import { won } from '../lib/format'
import {
  SUBTYPES, GROUPS, BANKS, SECURITIES, PENSION_KINDS, CURRENCIES, subOf, groupOf, krwValue, investPnl, expectedInterest,
} from '../lib/assets'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Asset } from '../db/types'

const symbolOf = (code?: string) => CURRENCIES.find((c) => c.code === (code ?? 'KRW'))?.symbol ?? '₩'
const PENSION_INVEST = ['IRP', '연금저축펀드', '퇴직연금']

export default function Assets() {
  const { profileId } = useProfile()
  useCoinSync(profileId)
  useStockSync(profileId)
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Asset | undefined>()

  const total = assets.reduce((s, a) => s + krwValue(a), 0)
  const byGroup = GROUPS.map((g) => ({
    ...g,
    sum: assets.filter((a) => groupOf(a.type) === g.key).reduce((s, a) => s + krwValue(a), 0),
    items: assets.filter((a) => groupOf(a.type) === g.key),
  })).filter((g) => g.items.length > 0)

  function openEdit(a?: Asset) { setEdit(a); setModal(true) }
  async function del(a: Asset) { if (confirm(`'${a.name}' 자산을 삭제할까요?`)) await repo.deleteAsset(a.id) }

  return (
    <div>
      <PageHeader title="자산" desc="입출금·예적금·투자·연금 통합 · 코인/해외주식 실시간, 외화 자동 원화환산" />

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
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: g.color }} />{g.emoji} {g.label} {total ? Math.round((g.sum / total) * 100) : 0}%
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-3.5">
        {byGroup.length === 0 && <Empty>오른쪽 아래 ＋ 로 자산을 추가하세요.</Empty>}
        {byGroup.map((g) => (
          <Card key={g.key}>
            <CardLabel>{g.emoji} {g.label} · ₩{won(g.sum)}</CardLabel>
            {g.items.map((a) => {
              const foreign = a.currency && a.currency !== 'KRW'
              const pnl = investPnl(a)
              const interest = expectedInterest(a)
              return (
                <div key={a.id} className="flex items-center gap-2 py-2.5 border-b border-line last:border-0">
                  <div onClick={() => openEdit(a)} className="flex-1 min-w-0 flex items-center justify-between cursor-pointer hover:bg-canvas -ml-2 pl-2 rounded-lg">
                    <div className="min-w-0 pr-2">
                      <div className="text-[13.5px] font-semibold truncate">{a.name}</div>
                      <div className="text-[11px] text-sub truncate">
                        {a.subLabel || subOf(a.type).label}{a.institution ? ` · ${a.institution}` : ''}
                        {a.ticker ? ` · ${a.ticker}` : ''}
                        {a.rate ? ` · ${a.rate}%${a.maturity ? ` ~${a.maturity.slice(2)}` : ' 무기한'}` : ''}
                      </div>
                      {interest && <div className="text-[11px] text-mint-d">💰 세후이자 ≈ ₩{won(interest.annualNet)}/년{interest.toMaturityNet ? ` · 만기까지 ₩${won(interest.toMaturityNet)}` : ''}</div>}
                      {pnl && <div className={`text-[11px] ${pnl.profit >= 0 ? 'text-income' : 'text-expense'}`}>{pnl.profit >= 0 ? '▲' : '▼'} {pnl.pct >= 0 ? '+' : ''}{pnl.pct.toFixed(1)}% ({symbolOf(a.currency)}{won(Math.abs(pnl.profit))})</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-bold tnum">{foreign ? `${symbolOf(a.currency)}${won(a.amount)}` : won(a.amount)}</div>
                      {foreign && <div className="text-[11px] text-sub tnum">≈ ₩{won(krwValue(a))}</div>}
                    </div>
                  </div>
                  <button onClick={() => del(a)} className="text-sub hover:text-expense p-1 shrink-0" title="삭제"><X size={16} /></button>
                </div>
              )
            })}
          </Card>
        ))}
      </div>

      <Fab onClick={() => openEdit(undefined)} label="자산 추가" />
      <AssetModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} />
    </div>
  )
}

async function fetchFxRate(code: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${code}`)
    const data = await res.json()
    const r = data?.rates?.KRW
    return typeof r === 'number' ? r : null
  } catch { return null }
}

interface Hit { symbol: string; name: string }

function AssetModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Asset; profileId: string }) {
  const [type, setType] = useState('checking')
  const [name, setName] = useState('')
  const [inst, setInst] = useState('')
  const [instOpen, setInstOpen] = useState(false)
  const [market, setMarket] = useState<'kr' | 'us'>('kr')
  const [currency, setCurrency] = useState('KRW')
  const [fxRate, setFxRate] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [principal, setPrincipal] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [returnRate, setReturnRate] = useState('')
  const [ticker, setTicker] = useState('')
  const [rate, setRate] = useState('')
  const [maturity, setMaturity] = useState('')
  const [noMaturity, setNoMaturity] = useState(false)
  const [savingKind, setSavingKind] = useState<'deposit' | 'installment'>('deposit')
  const [subLabel, setSubLabel] = useState('연금보험')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [livePrice, setLivePrice] = useState<number | null>(null)

  const sub = subOf(type)
  const pensionInvest = !!sub.pension && PENSION_INVEST.includes(subLabel)
  const isInvest = !!sub.qty || pensionInvest
  const showSearch = (sub.live === 'stock' && market === 'us') || sub.live === 'coin'
  const foreign = currency !== 'KRW'

  useEffect(() => {
    if (!open) return
    setQ(''); setHits([]); setLivePrice(null); setInstOpen(false)
    if (edit) {
      setType(edit.type); setName(edit.name); setInst(edit.institution ?? '')
      setMarket(edit.market ?? 'kr'); setCurrency(edit.currency ?? 'KRW'); setFxRate(edit.fxRate ? String(edit.fxRate) : '')
      setAmount(edit.amount); setTicker(edit.ticker ?? '')
      setPrincipal(edit.principal != null ? String(edit.principal) : (edit.quantity && edit.avgPrice ? String(Math.round(edit.quantity * edit.avgPrice)) : ''))
      setAvgPrice(edit.avgPrice != null ? String(edit.avgPrice) : '')
      setReturnRate(edit.principal && !edit.avgPrice && edit.amount ? String(Math.round((edit.amount / edit.principal - 1) * 1000) / 10) : '')
      setRate(edit.rate != null ? String(edit.rate) : ''); setMaturity(edit.maturity ?? ''); setNoMaturity(!edit.maturity && !!edit.rate)
      setSavingKind(edit.savingKind ?? 'deposit'); setSubLabel(edit.subLabel ?? '연금보험')
    } else {
      setType('checking'); setName(''); setInst(''); setMarket('kr')
      setCurrency('KRW'); setFxRate(''); setAmount(null); setTicker('')
      setPrincipal(''); setAvgPrice(''); setReturnRate('')
      setRate(''); setMaturity(''); setNoMaturity(false); setSavingKind('deposit'); setSubLabel('연금보험')
    }
  }, [open, edit])

  // 외화 자동 환율
  useEffect(() => {
    if (!open || currency === 'KRW') return
    let cancel = false
    fetchFxRate(currency).then((r) => { if (!cancel && r) setFxRate(String(Math.round(r * 100) / 100)) })
    return () => { cancel = true }
  }, [currency, open])

  // 검색 디바운스
  useEffect(() => {
    if (!showSearch || !q.trim()) { setHits([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = sub.live === 'coin'
          ? (await searchCoins(q)).map((c) => ({ symbol: c.ticker, name: `${c.korean} (${c.ticker})` }))
          : (await searchStocks(q)).map((s) => ({ symbol: s.symbol, name: s.description }))
        setHits(res)
      } finally { setSearching(false) }
    }, 400)
    return () => clearTimeout(t)
  }, [q, showSearch, sub.live])

  async function pick(h: Hit) {
    setName(h.name); setTicker(h.symbol); setQ(''); setHits([])
    if (sub.live === 'coin') { setCurrency('KRW'); setLivePrice(await getCoinPrice(h.symbol)) }
    else { setMarket('us'); setCurrency('USD'); setLivePrice(await getStockPrice(h.symbol)) }
  }

  const instList = sub.inst === 'bank' ? BANKS : sub.inst === 'securities' ? SECURITIES : sub.inst === 'both' ? [...BANKS, ...SECURITIES] : null
  const instMatches = instList && inst.trim() ? instList.filter((x) => x.includes(inst.trim())).slice(0, 8) : []

  // 투자 평가금액(자산 통화) 계산
  const principalNum = Number(principal) || 0
  const avgNum = Number(avgPrice) || 0
  const rrNum = returnRate.trim() === '' ? null : Number(returnRate)
  let investValue = principalNum
  if (sub.live && livePrice && avgNum > 0 && principalNum > 0) investValue = Math.round((principalNum / avgNum) * livePrice)
  else if (rrNum != null && principalNum > 0) investValue = Math.round(principalNum * (1 + rrNum / 100))
  const investProfit = investValue - principalNum
  const investPct = principalNum > 0 ? (investProfit / principalNum) * 100 : 0
  const fxNum = Number(fxRate) || 0
  const investKrw = foreign && fxNum ? Math.round(investValue * fxNum) : investValue

  const krwPreview = foreign && amount && fxNum ? Math.round(amount * fxNum) : null
  const interestObj = sub.rate && Number(rate) > 0 && amount
    ? expectedInterest({ amount, rate: Number(rate), maturity: noMaturity ? undefined : (maturity || undefined) } as Asset)
    : null

  async function save() {
    if (!name.trim()) return
    const amt = isInvest ? investValue : (amount ?? 0)
    const qtyDerived = isInvest && avgNum > 0 && principalNum > 0 ? principalNum / avgNum : undefined
    const a: Asset = {
      id: edit?.id ?? uid(), profileId, type, name: name.trim(),
      amount: amt,
      currency: currency === 'KRW' ? undefined : currency,
      fxRate: foreign && fxNum ? fxNum : undefined,
      institution: inst.trim() || undefined,
      market: sub.live === 'stock' ? market : undefined,
      principal: isInvest && principalNum > 0 ? principalNum : undefined,
      quantity: qtyDerived,
      unitPrice: qtyDerived ? amt / qtyDerived : undefined,
      avgPrice: isInvest && avgNum > 0 ? avgNum : undefined,
      ticker: sub.live && ticker.trim() ? ticker.trim() : undefined,
      rate: sub.rate && Number(rate) > 0 ? Number(rate) : undefined,
      maturity: sub.rate && !noMaturity && maturity ? maturity : undefined,
      savingKind: sub.rate ? savingKind : undefined,
      subLabel: sub.pension ? subLabel : undefined,
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
            <button key={s.key} onClick={() => { setType(s.key); setInst(''); setLivePrice(null) }} className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border ${sub.key === s.key ? 'bg-mint text-white border-mint' : 'bg-canvas text-sub border-line'}`}>{s.label}</button>
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
        <Field label={sub.live === 'coin' ? '코인 검색' : '종목 검색 (해외)'}>
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sub.live === 'coin' ? '비트코인, BTC …' : 'apple, AAPL …'} className={inputCls} />
            {q.trim() && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-line rounded-[10px] shadow-lg max-h-56 overflow-auto">
                {searching && <div className="px-3 py-2 text-[12px] text-sub">검색 중…</div>}
                {!searching && hits.map((h) => (
                  <button key={h.symbol} onClick={() => pick(h)} className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-line last:border-0">
                    <div className="text-[13px] font-semibold">{h.symbol}</div>
                    <div className="text-[11px] text-sub truncate">{h.name}</div>
                  </button>
                ))}
                {!searching && hits.length === 0 && <div className="px-3 py-2 text-[12px] text-sub">결과 없음</div>}
              </div>
            )}
          </div>
          {livePrice != null && <div className="text-[12px] text-mint-d mt-1">✓ {ticker} 현재가 {sub.live === 'coin' ? `₩${won(livePrice)}` : `$${livePrice}`}</div>}
        </Field>
      )}

      <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 주거래 통장 / 애플 / 비트코인" className={inputCls} /></Field>

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

      {instList && (
        <Field label={sub.inst === 'bank' ? '은행' : sub.inst === 'securities' ? '증권사' : '기관 (선택)'}>
          <div className="relative">
            <input value={inst} onChange={(e) => { setInst(e.target.value); setInstOpen(true) }} onFocus={() => setInstOpen(true)} placeholder="검색 · 예: 우리 → 우리은행 (없으면 그냥 입력)" className={inputCls} />
            {instOpen && instMatches.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-line rounded-[10px] shadow-lg max-h-52 overflow-auto">
                {instMatches.map((m) => (
                  <button key={m} onClick={() => { setInst(m); setInstOpen(false) }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-canvas border-b border-line last:border-0">{m}</button>
                ))}
              </div>
            )}
          </div>
        </Field>
      )}

      {/* 투자자산: 원금·평단가·수익률 (수량 입력 없음) */}
      {isInvest ? (
        <>
          <Field label={`원금 (투자한 금액${foreign ? `, ${currency}` : ''})`}>
            <AmountInput value={principal === '' ? null : Number(principal)} onChange={(v) => setPrincipal(v == null ? '' : String(v))} />
          </Field>
          {sub.live && (
            <Field label={`평단가 (선택, ${foreign ? currency : '원'}) · 넣으면 현재시세로 자동평가`}>
              <input type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder="내가 산 가격" className={inputCls + ' text-right tnum'} />
            </Field>
          )}
          <Field label="수익률 (선택, %) · 시세 자동이 안 되면 직접 입력">
            <input type="number" value={returnRate} onChange={(e) => setReturnRate(e.target.value)} placeholder="예: 12.5 (마이너스도 가능)" className={inputCls + ' text-right tnum'} />
          </Field>
          {principalNum > 0 && (
            <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
              평가금액 <b>{symbolOf(currency)}{won(investValue)}</b>{foreign && <span className="text-sub"> ≈ ₩{won(investKrw)}</span>}
              <span className={investProfit >= 0 ? ' text-income' : ' text-expense'}> · 수익 {investProfit >= 0 ? '+' : ''}{symbolOf(currency)}{won(investProfit)} ({investPct >= 0 ? '+' : ''}{investPct.toFixed(1)}%)</span>
            </div>
          )}
          {sub.key === 'gold' && <div className="text-[11px] text-sub -mt-1 mb-1">※ 금은 실시간 시세 자동연동이 아직 없어요. 수익률을 직접 넣거나 원금만 입력하세요.</div>}
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
        </>
      )}

      {sub.rate && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="금리 (연 %)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="예: 3.5" className={inputCls + ' text-right tnum'} /></Field>
            <Field label="만기일"><input type="date" value={maturity} disabled={noMaturity} onChange={(e) => setMaturity(e.target.value)} className={inputCls + (noMaturity ? ' opacity-40' : '')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-sub -mt-1 mb-2 cursor-pointer">
            <input type="checkbox" checked={noMaturity} onChange={(e) => setNoMaturity(e.target.checked)} /> 만기 없음(무제한)
          </label>
          {interestObj && (
            <div className="text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 mb-2">
              💰 세후 예상이자 ≈ <b>₩{won(interestObj.annualNet)}/년</b>
              {interestObj.toMaturityNet != null && <> · 만기까지 <b>₩{won(interestObj.toMaturityNet)}</b></>}
              <div className="text-[10.5px] text-sub mt-0.5">세전 ₩{won(interestObj.annual)}/년 · 이자소득세 15.4% 반영{savingKind === 'installment' ? ' · 적금은 근사치예요' : ''}</div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteAsset(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
