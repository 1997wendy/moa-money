import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, signed, thisMonth, addMonth } from '../lib/format'
import { groupOf, krwValue } from '../lib/assets'
import { detectFixed } from '../lib/fixedCost'
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
const monthNet = (txs: Transaction[], ym: string) => {
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

  useEffect(() => { setAlloc(profile?.targetAlloc ?? DEFAULT_ALLOC) }, [profile?.id, profile?.targetAlloc])

  const sums = useMemo(() => {
    const m: Record<string, number> = { cash: 0, stock: 0, coin: 0, gold: 0 }
    for (const a of assets) { const b = bucketOf(a); if (b) m[b] += krwValue(a) }
    return m
  }, [assets])
  const total = BUCKETS.reduce((s, b) => s + sums[b.key], 0)
  const allocSum = BUCKETS.reduce((s, b) => s + (Number(alloc[b.key]) || 0), 0)

  // 주식·ETF 국내/해외 분해
  const krStock = assets.filter((a) => (a.type === 'stock' || a.type === 'etf') && a.market !== 'us').reduce((s, a) => s + krwValue(a), 0)
  const usStock = sums.stock - krStock

  // 투자 여력
  const now = thisMonth()
  const avgNet = Array.from({ length: 6 }, (_, i) => monthNet(txs, addMonth(now, -i))).reduce((a, b) => a + b, 0) / 6
  const thisNet = monthNet(txs, now)
  const fixedTotal = detectFixed(txs).reduce((s, f) => s + f.monthly, 0)
  const capacity = Math.max(0, Math.round(avgNet * 0.7))

  // 리밸런싱: 부족/초과
  const diffs = BUCKETS.map((b) => ({ ...b, cur: sums[b.key], diff: total * (Number(alloc[b.key]) || 0) / 100 - sums[b.key] }))
  const under = diffs.filter((d) => d.diff > total * 0.02).sort((a, b) => b.diff - a.diff)
  const over = diffs.filter((d) => d.diff < -total * 0.02).sort((a, b) => a.diff - b.diff)
  const buyTarget = under[0]?.label ?? '부족한 자산군'

  const dynamic =
    thisNet < avgNet * 0.6
      ? '⚠️ 이번 달은 지출(카드값 등)이 커서, 이번 회차는 금액을 줄이거나 한 번 쉬는 것도 좋아요.'
      : thisNet > avgNet * 1.2
        ? '👍 이번 달은 여유가 있어요. 평소보다 조금 더 담아도 괜찮아요.'
        : ''

  async function saveAlloc() {
    if (!profile) return
    await repo.upsertProfile({ ...profile, targetAlloc: alloc })
    setMsg('목표 비중을 저장했어요.')
  }
  async function setTargetPrice(a: Asset, v: number | undefined) {
    await repo.upsertAsset({ ...a, targetPrice: v })
  }

  const holdings = assets.filter((a) => (a.type === 'stock' || a.type === 'etf' || a.type === 'coin' || a.type === 'gold') && a.quantity)

  return (
    <div>
      <PageHeader title="투자" desc="자산 배분·리밸런싱·매수/매도 판단" />

      {/* 현재 배분 */}
      <Card>
        <CardLabel>현재 자산 배분 · 총 ₩{won(total)}</CardLabel>
        {total === 0 ? <Empty>투자·현금 자산을 추가하면 배분이 보여요.</Empty> : (
          <>
            <div className="flex h-7 rounded-lg overflow-hidden mt-1">
              {BUCKETS.map((b) => (
                <div key={b.key} style={{ width: `${(sums[b.key] / total) * 100}%`, background: b.color }} className="flex items-center justify-center text-white text-[11px] font-bold">
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
            {sums.stock > 0 && (
              <div className="text-[11.5px] text-sub mt-2">주식·ETF 중 · 국내 ₩{won(krStock)} ({Math.round((krStock / sums.stock) * 100)}%) / 해외 ₩{won(usStock)} ({Math.round((usStock / sums.stock) * 100)}%)</div>
            )}
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
          <thead><tr className="text-sub text-left border-b border-line"><th className="py-1.5">자산군</th><th className="text-right">현재</th><th className="text-right">목표%</th><th className="text-right">조정</th></tr></thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.key} className="border-b border-line">
                <td className="py-2 font-semibold">{d.label}<div className="text-[11px] text-sub font-normal tnum">{won(d.cur)}</div></td>
                <td className="text-right tnum">{total ? Math.round((d.cur / total) * 100) : 0}%</td>
                <td className="text-right"><input type="number" value={alloc[d.key] ?? 0} onChange={(e) => setAlloc({ ...alloc, [d.key]: Number(e.target.value) })} className={inputCls + ' w-[64px] text-right tnum py-1'} /></td>
                <td className={`text-right tnum font-bold ${Math.abs(d.diff) < total * 0.02 ? 'text-sub' : d.diff > 0 ? 'text-income' : 'text-expense'}`}>{Math.abs(d.diff) < total * 0.02 ? '적정' : d.diff > 0 ? `+${won(d.diff)}` : won(d.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11.5px] text-sub">＋ 더 담기 / － 덜기(매도 검토)</span>
          <Button onClick={saveAlloc}>목표 저장</Button>
        </div>
      </Card>

      {/* 투자 여력 코칭 */}
      <Card className="mt-3.5">
        <CardLabel>💪 투자 여력 코칭</CardLabel>
        <div className="text-[13px] text-sub">월 평균 순수익 <b className="text-ink tnum">{signed(Math.round(avgNet))}</b> · 이번 달 <b className="text-ink tnum">{signed(thisNet)}</b>{fixedTotal > 0 ? <> · 고정지출 <b className="text-ink tnum">₩{won(fixedTotal)}</b>/월</> : null}</div>
        {capacity > 0 ? (
          <div className="mt-2 text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2.5 border border-dashed border-mint space-y-1">
            <div>• 매달 <b>약 ₩{won(capacity)}</b> 투자 여력 (순수익의 70%, 비상금 30% 남김)</div>
            <div>• 주간 <b>₩{won(Math.round(capacity / 4))}</b>씩 분할 매수 추천</div>
            <div>• 무엇을? → 목표보다 부족한 <b>{buyTarget}</b>부터 채우세요{under[0] ? ` (약 ₩${won(under[0].diff)} 부족)` : ''}.</div>
            {dynamic && <div className="pt-1">{dynamic}</div>}
          </div>
        ) : (
          <div className="mt-2 text-[12px] bg-[#fff8ee] text-[#b9770a] rounded-lg px-3 py-2 border border-dashed border-warn">최근 순수익이 마이너스예요. 신규 투자보다 지출 점검·현금 확보를 먼저 권해요.</div>
        )}
      </Card>

      {/* 보유 종목 & 목표가 */}
      <Card className="mt-3.5">
        <CardLabel>보유 종목 & 목표가</CardLabel>
        {holdings.length === 0 ? <Empty>수량이 있는 투자 종목이 없어요.</Empty> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-sub text-left border-b border-line"><th className="py-1.5">종목</th><th className="text-right">현재가</th><th className="text-right">내 목표가</th><th className="text-right">상태</th></tr></thead>
            <tbody>
              {holdings.map((a) => {
                const reached = a.unitPrice && a.targetPrice ? a.unitPrice >= a.targetPrice : false
                return (
                  <tr key={a.id} className="border-b border-line">
                    <td className="py-2 font-semibold">{a.name} <span className="text-[11px] text-sub font-normal">{a.market ? (a.market === 'us' ? '해외' : '국내') : ''} {a.ticker ?? ''}</span></td>
                    <td className="text-right tnum">{a.unitPrice ? won(a.unitPrice) : '-'}</td>
                    <td className="text-right"><input type="number" defaultValue={a.targetPrice ?? ''} onBlur={(e) => setTargetPrice(a, e.target.value ? Number(e.target.value) : undefined)} placeholder="입력" className={inputCls + ' w-[90px] text-right tnum py-1'} /></td>
                    <td className={`text-right text-[12px] font-bold ${reached ? 'text-income' : 'text-sub'}`}>{a.targetPrice ? (reached ? '도달 🎯' : '보유') : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="mt-3 text-[12px] bg-canvas rounded-lg px-3 py-2.5 text-sub">
          🤖 <b className="text-ink">뉴스 기반 AI 추천 목표가·매도/보유 추천(근거 첨부)</b>은 실시간 뉴스·시세 수집 + AI 분석이 필요해, <b className="text-ink">클라우드 + AI 단계</b>에서 붙일 예정이에요. (지금은 목표가를 직접 입력해 참고)
          {over.length > 0 && <div className="mt-1.5 text-[#b9770a]">현재 규칙 기반 참고: <b>{over[0].label}</b>이 목표보다 많아요 → 일부 정리(매도) 검토 대상.</div>}
        </div>
      </Card>

      {msg && <div className="mt-4 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}
    </div>
  )
}
