import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, thisMonth, addMonth } from '../lib/format'
import { groupOf, krwValue } from '../lib/assets'
import { fetchCoinPricesKRW, isSupportedCoin } from '../lib/coingecko'
import { Card, CardLabel, PageHeader, Button, Empty, inputCls } from '../components/ui'
import type { Asset, Transaction } from '../db/types'

const BUCKETS = [
  { key: 'cash', label: '현금성', color: '#12b8a6' },
  { key: 'stock', label: '주식·ETF', color: '#5b8def' },
  { key: 'coin', label: '코인', color: '#9b8afb' },
  { key: 'gold', label: '금', color: '#f5a524' },
]
const DEFAULT_ALLOC: Record<string, number> = { cash: 40, stock: 40, coin: 15, gold: 5 }

function bucketOf(a: Asset): string | null {
  if (a.type === 'stock' || a.type === 'etf') return 'stock'
  if (a.type === 'coin') return 'coin'
  if (a.type === 'gold') return 'gold'
  const g = groupOf(a.type)
  return g === 'bank' || g === 'cash' ? 'cash' : null
}

function monthNet(txs: Transaction[], ym: string) {
  let inc = 0, exp = 0
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue
    if (t.type === 'income') inc += t.amount
    else exp += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
  }
  return inc - exp
}

export default function Investment() {
  const { profileId, profile } = useProfile()
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const [alloc, setAlloc] = useState<Record<string, number>>(DEFAULT_ALLOC)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { setAlloc(profile?.targetAlloc ?? DEFAULT_ALLOC) }, [profile?.id, profile?.targetAlloc])

  const sums = useMemo(() => {
    const m: Record<string, number> = { cash: 0, stock: 0, coin: 0, gold: 0 }
    for (const a of assets) { const b = bucketOf(a); if (b) m[b] += krwValue(a) }
    return m
  }, [assets])
  const total = BUCKETS.reduce((s, b) => s + sums[b.key], 0)
  const allocSum = BUCKETS.reduce((s, b) => s + (Number(alloc[b.key]) || 0), 0)

  // 투자 여력 (최근 6개월 평균 순수익)
  const now = thisMonth()
  const avgNet = Array.from({ length: 6 }, (_, i) => monthNet(txs, addMonth(now, -i))).reduce((a, b) => a + b, 0) / 6

  const coinAssets = assets.filter((a) => a.type === 'coin' && a.quantity && isSupportedCoin(a.ticker))

  async function refreshCoins() {
    if (coinAssets.length === 0) { setMsg('갱신할 코인이 없어요. (지원 티커: BTC/ETH 등, 수량 입력 필요)'); return }
    setLoading(true)
    try {
      const prices = await fetchCoinPricesKRW(coinAssets.map((a) => a.ticker!))
      let n = 0
      for (const a of coinAssets) {
        const p = prices[a.ticker!.toUpperCase()]
        if (p) { await repo.upsertAsset({ ...a, unitPrice: p, amount: Math.round(a.quantity! * p), updatedAt: new Date().toISOString() }); n++ }
      }
      setMsg(`${n}개 코인 시세를 갱신했어요.`)
    } catch { setMsg('⚠️ 시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.') }
    setLoading(false)
  }

  async function saveAlloc() {
    if (!profile) return
    await repo.upsertProfile({ ...profile, targetAlloc: alloc })
    setMsg('목표 비중을 저장했어요.')
  }

  return (
    <div>
      <PageHeader title="투자" desc="자산 배분·리밸런싱·투자 여력" />

      {/* 현재 배분 */}
      <Card>
        <CardLabel>현재 자산 배분 · 총 ₩{won(total)}</CardLabel>
        {total === 0 ? (
          <Empty>투자·현금 자산을 추가하면 배분이 보여요.</Empty>
        ) : (
          <>
            <div className="flex h-7 rounded-lg overflow-hidden mt-1">
              {BUCKETS.map((b) => (
                <div key={b.key} style={{ width: `${(sums[b.key] / total) * 100}%`, background: b.color }} className="flex items-center justify-center text-white text-[11px] font-bold" title={`${b.label} ${won(sums[b.key])}`}>
                  {sums[b.key] / total > 0.08 ? `${Math.round((sums[b.key] / total) * 100)}%` : ''}
                </div>
              ))}
            </div>
            <div className="flex gap-3 flex-wrap mt-2.5">
              {BUCKETS.map((b) => (
                <span key={b.key} className="text-[11.5px] text-sub flex items-center gap-1">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: b.color }} />{b.label} {Math.round((sums[b.key] / total) * 100)}%
                </span>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* 리밸런싱 */}
      <Card className="mt-3.5">
        <div className="flex items-center justify-between mb-2">
          <CardLabel>목표 비중 & 리밸런싱</CardLabel>
          <span className={`text-[12px] font-bold ${allocSum === 100 ? 'text-sub' : 'text-warn'}`}>합계 {allocSum}%</span>
        </div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-sub text-left border-b border-line">
            <th className="py-1.5">자산군</th><th className="text-right">현재</th><th className="text-right">목표%</th><th className="text-right">조정</th>
          </tr></thead>
          <tbody>
            {BUCKETS.map((b) => {
              const cur = sums[b.key]
              const curPct = total ? (cur / total) * 100 : 0
              const targetAmt = total * (Number(alloc[b.key]) || 0) / 100
              const diff = targetAmt - cur
              return (
                <tr key={b.key} className="border-b border-line">
                  <td className="py-2 font-semibold">{b.label}<div className="text-[11px] text-sub font-normal tnum">{won(cur)} · {Math.round(curPct)}%</div></td>
                  <td className="text-right tnum">{Math.round(curPct)}%</td>
                  <td className="text-right">
                    <input type="number" value={alloc[b.key] ?? 0} onChange={(e) => setAlloc({ ...alloc, [b.key]: Number(e.target.value) })} className={inputCls + ' w-[64px] text-right tnum py-1'} />
                  </td>
                  <td className={`text-right tnum font-bold ${Math.abs(diff) < total * 0.02 ? 'text-sub' : diff > 0 ? 'text-income' : 'text-expense'}`}>
                    {Math.abs(diff) < total * 0.02 ? '적정' : diff > 0 ? `+${won(diff)}` : `${won(diff)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11.5px] text-sub">＋는 더 담기, －는 덜기(매도 검토)</span>
          <Button onClick={saveAlloc}>목표 저장</Button>
        </div>
      </Card>

      {/* 투자 여력 코칭 */}
      <Card className="mt-3.5">
        <CardLabel>💪 투자 여력 코칭</CardLabel>
        <div className="text-[13px] text-sub">최근 6개월 월 평균 순수익 <b className="text-ink tnum">{signed(Math.round(avgNet))}</b></div>
        {avgNet > 0 ? (
          <div className="mt-2 text-[12px] bg-mint-l text-mint-d rounded-lg px-3 py-2 border border-dashed border-mint">
            이 흐름이면 매달 <b>약 ₩{won(Math.round(avgNet * 0.7))}</b> 투자 여력이 있어요 (순수익의 70%, 비상금 30% 남김). 주간 <b>₩{won(Math.round(avgNet * 0.7 / 4))}</b>씩 분할 매수를 추천해요.
          </div>
        ) : (
          <div className="mt-2 text-[12px] bg-[#fff8ee] text-[#b9770a] rounded-lg px-3 py-2 border border-dashed border-warn">
            최근 순수익이 마이너스예요. 신규 투자보다 지출 점검·현금 확보를 먼저 권해요.
          </div>
        )}
      </Card>

      {/* 코인 실시간 시세 */}
      <Card className="mt-3.5">
        <div className="flex items-center justify-between">
          <CardLabel>코인 실시간 시세 (CoinGecko)</CardLabel>
          <button onClick={refreshCoins} disabled={loading} className="text-[12px] font-bold text-mint-d flex items-center gap-1 border border-line rounded-lg px-2.5 py-1.5 hover:bg-canvas disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 시세 갱신
          </button>
        </div>
        {coinAssets.length === 0 ? (
          <div className="text-[12px] text-sub mt-2">코인 자산에 <b>수량</b>과 지원 <b>티커</b>(BTC·ETH·SOL 등)를 입력하면 시세로 자동 평가돼요.</div>
        ) : (
          coinAssets.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-line last:border-0 text-[13px]">
              <span className="font-semibold">{a.name} <span className="text-[11px] text-sub">{a.quantity} {a.ticker}</span></span>
              <span className="tnum">{won(krwValue(a))}{a.unitPrice ? <span className="text-[11px] text-sub"> · @{won(a.unitPrice)}</span> : null}</span>
            </div>
          ))
        )}
        <div className="text-[11px] text-sub mt-2">※ 국내/해외 주식 실시간 시세는 무료여도 인증·백엔드가 필요해 클라우드 단계에서 붙일 예정.</div>
      </Card>

      {msg && <div className="mt-4 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}
    </div>
  )
}
