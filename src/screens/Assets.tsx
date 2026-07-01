import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { won } from '../lib/format'
import {
  SUBTYPES, GROUPS, BANKS, SECURITIES, CURRENCIES, subOf, groupOf, krwValue,
} from '../lib/assets'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Asset } from '../db/types'

const symbolOf = (code?: string) => CURRENCIES.find((c) => c.code === (code ?? 'KRW'))?.symbol ?? '₩'

export default function Assets() {
  const { profileId } = useProfile()
  useCoinSync(profileId) // 진입 시 코인 시세 자동 갱신
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

  return (
    <div>
      <PageHeader title="자산" desc="은행·현금·투자·보험 통합 · 코인은 실시간, 외화는 원화 환산" />

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
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: g.color }} />{g.emoji} {g.label} {Math.round((g.sum / total) * 100)}%
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        {byGroup.length === 0 && <Empty>오른쪽 아래 ＋ 로 자산을 추가하세요.</Empty>}
        {byGroup.map((g) => (
          <Card key={g.key}>
            <CardLabel>{g.emoji} {g.label} · ₩{won(g.sum)}</CardLabel>
            {g.items.map((a) => {
              const foreign = a.currency && a.currency !== 'KRW'
              return (
                <div key={a.id} onClick={() => openEdit(a)} className="flex items-center justify-between py-2.5 border-b border-line last:border-0 cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{a.name}</div>
                    <div className="text-[11px] text-sub">
                      {subOf(a.type).label}{a.institution ? ` · ${a.institution}` : ''}
                      {a.quantity != null ? ` · ${a.quantity}${a.ticker ? ` ${a.ticker}` : ''}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[14px] font-bold tnum">{foreign ? `${symbolOf(a.currency)}${won(a.amount)}` : won(a.amount)}</div>
                    {foreign && <div className="text-[11px] text-sub tnum">≈ ₩{won(krwValue(a))}</div>}
                  </div>
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
    const res = await fetch(`https://api.exchangerate.host/latest?base=${code}&symbols=KRW`)
    const data = await res.json()
    const r = data?.rates?.KRW
    return typeof r === 'number' ? r : null
  } catch { return null }
}

function AssetModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Asset; profileId: string }) {
  const [type, setType] = useState('checking')
  const [name, setName] = useState('')
  const [inst, setInst] = useState('')
  const [instCustom, setInstCustom] = useState(false)
  const [market, setMarket] = useState<'kr' | 'us'>('kr')
  const [currency, setCurrency] = useState('KRW')
  const [fxRate, setFxRate] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [ticker, setTicker] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [loadingFx, setLoadingFx] = useState(false)

  const sub = subOf(type)
  const curGroup = sub.group
  const isStockEtf = sub.key === 'stock' || sub.key === 'etf'

  useEffect(() => {
    if (!open) return
    if (edit) {
      setType(edit.type); setName(edit.name); setInst(edit.institution ?? ''); setInstCustom(false)
      setMarket(edit.market ?? 'kr'); setCurrency(edit.currency ?? 'KRW'); setFxRate(edit.fxRate ? String(edit.fxRate) : '')
      setAmount(edit.amount); setQuantity(edit.quantity != null ? String(edit.quantity) : ''); setTicker(edit.ticker ?? '')
      setAvgPrice(edit.avgPrice != null ? String(edit.avgPrice) : '')
    } else {
      setType('checking'); setName(''); setInst(''); setInstCustom(false); setMarket('kr')
      setCurrency('KRW'); setFxRate(''); setAmount(null); setQuantity(''); setTicker(''); setAvgPrice('')
    }
  }, [open, edit])

  const instList = sub.inst === 'bank' ? BANKS : sub.inst === 'securities' ? SECURITIES : null
  const foreign = currency !== 'KRW'
  const krwPreview = foreign && amount && Number(fxRate) ? Math.round(amount * Number(fxRate)) : null

  function pickGroup(gk: string) {
    const first = SUBTYPES.find((s) => s.group === gk)
    if (first) { setType(first.key); setInst(''); setInstCustom(false) }
  }

  async function autoFx() {
    setLoadingFx(true)
    const r = await fetchFxRate(currency)
    setLoadingFx(false)
    if (r) setFxRate(String(Math.round(r * 100) / 100))
    else alert('환율을 불러오지 못했어요. 직접 입력해 주세요.')
  }

  async function save() {
    if (!name.trim() || !(Number(amount) > 0)) return
    const a: Asset = {
      id: edit?.id ?? uid(), profileId, type, name: name.trim(),
      amount: amount!,
      currency: currency === 'KRW' ? undefined : currency,
      fxRate: foreign && Number(fxRate) ? Number(fxRate) : undefined,
      institution: inst || undefined,
      market: isStockEtf ? market : undefined,
      quantity: sub.qty && quantity ? Number(quantity) : undefined,
      unitPrice: sub.qty && quantity && Number(quantity) > 0 ? amount! / Number(quantity) : undefined,
      avgPrice: sub.qty && avgPrice ? Number(avgPrice) : undefined,
      ticker: sub.qty && ticker.trim() ? ticker.trim() : undefined,
      updatedAt: new Date().toISOString(),
    }
    await repo.upsertAsset(a)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '자산 수정' : '자산 추가'}>
      {/* 분류: 그룹 칩 → 세부 칩 (셀렉트 대신) */}
      <div className="mb-3">
        <span className="text-[12px] font-semibold text-sub">분류</span>
        <div className="flex gap-1.5 flex-wrap mt-1.5">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => pickGroup(g.key)} className={`px-2.5 py-1.5 rounded-full text-[12.5px] font-bold border ${curGroup === g.key ? 'bg-ink text-white border-ink' : 'bg-surface text-sub border-line'}`}>{g.emoji} {g.label}</button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap mt-2">
          {SUBTYPES.filter((s) => s.group === curGroup).map((s) => (
            <button key={s.key} onClick={() => { setType(s.key); setInst(''); setInstCustom(false) }} className={`px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${type === s.key ? 'bg-mint text-white border-mint' : 'bg-canvas text-sub border-line'}`}>{s.label}</button>
          ))}
        </div>
      </div>

      <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 주거래 통장 / 애플" className={inputCls} /></Field>

      {isStockEtf && (
        <Field label="국내 / 해외">
          <div className="flex gap-1.5">
            {(['kr', 'us'] as const).map((mk) => (
              <button key={mk} onClick={() => setMarket(mk)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${market === mk ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{mk === 'kr' ? '국내' : '해외'}</button>
            ))}
          </div>
        </Field>
      )}

      {instList && (
        <Field label={sub.inst === 'bank' ? '은행' : '증권사'}>
          {instCustom ? (
            <div className="flex gap-2">
              <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="직접 입력" className={inputCls + ' flex-1'} autoFocus />
              <Button variant="line" onClick={() => { setInstCustom(false); setInst('') }}>목록</Button>
            </div>
          ) : (
            <select value={inst} onChange={(e) => { if (e.target.value === '__custom') { setInstCustom(true); setInst('') } else setInst(e.target.value) }} className={inputCls}>
              <option value="">선택</option>
              {instList.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__custom">기타(직접 입력)…</option>
            </select>
          )}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="통화">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
        <Field label={foreign ? `평가금액 (${currency})` : '평가금액 (원)'}><AmountInput value={amount} onChange={setAmount} /></Field>
      </div>

      {foreign && (
        <Field label="환율 (1 단위 → 원)">
          <div className="flex gap-2 items-center">
            <input type="number" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="예: 1350" className={inputCls + ' flex-1 text-right tnum'} />
            <button onClick={autoFx} disabled={loadingFx} className="text-[12px] font-bold text-mint-d flex items-center gap-1 border border-line rounded-lg px-2.5 py-2 hover:bg-canvas"><RefreshCw size={13} className={loadingFx ? 'animate-spin' : ''} /> 자동</button>
          </div>
          {krwPreview != null && <div className="text-[12px] text-sub mt-1 tnum">원화 환산 ≈ ₩{won(krwPreview)}</div>}
        </Field>
      )}

      {sub.qty && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="보유 수량"><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls + ' text-right tnum'} /></Field>
            <Field label="평단가 (선택)"><input type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} placeholder="수익률 계산" className={inputCls + ' text-right tnum'} /></Field>
          </div>
          <Field label={sub.tickerRequired ? '티커(필수 · 예 BTC)' : '티커(선택)'}><input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder={sub.tickerRequired ? 'BTC' : '선택'} className={inputCls} /></Field>
          {sub.key === 'coin' && <div className="text-[11px] text-sub -mt-1">티커·수량을 넣으면 업비트 시세로 평가액이 자동 계산돼요.</div>}
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
