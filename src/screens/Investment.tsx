import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Save, Trash2 } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { won, signed, thisMonth, addMonth, todayISO } from '../lib/format'
import { groupOf, krwValue } from '../lib/assets'
import { detectFixed } from '../lib/fixedCost'
import { Card, CardLabel, PageHeader, Button, Empty, inputCls } from '../components/ui'
import type { Asset, CoachNote, Transaction } from '../db/types'

const BUCKETS = [
  { key: 'cash', label: '현금성', color: '#12b8a6' },
  { key: 'stock_kr', label: '국내주식', color: '#2f6fed' },
  { key: 'stock_us', label: '해외주식', color: '#5b8def' },
  { key: 'etf_kr', label: '국내ETF', color: '#7c5cf0' },
  { key: 'etf_us', label: '해외ETF', color: '#9b8afb' },
  { key: 'coin', label: '코인', color: '#c084fc' },
  { key: 'gold', label: '금', color: '#f5a524' },
]
const DEFAULT_ALLOC: Record<string, number> = { cash: 20, stock_kr: 15, stock_us: 25, etf_kr: 5, etf_us: 15, coin: 15, gold: 5 }

function bucketOf(a: Asset): string | null {
  if (a.type === 'stock') return a.market === 'us' ? 'stock_us' : 'stock_kr'
  if (a.type === 'etf') return a.market === 'us' ? 'etf_us' : 'etf_kr'
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
  useCoinSync(profileId)
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const notes = useLiveQuery(() => (profileId ? repo.listCoachNotes(profileId) : []), [profileId], [])
  const [alloc, setAlloc] = useState<Record<string, number>>(DEFAULT_ALLOC)
  const [msg, setMsg] = useState('')

  useEffect(() => { setAlloc(profile?.targetAlloc ?? DEFAULT_ALLOC) }, [profile?.id, profile?.targetAlloc])

  const sums = useMemo(() => {
    const m: Record<string, number> = {}
    BUCKETS.forEach((b) => (m[b.key] = 0))
    for (const a of assets) { const b = bucketOf(a); if (b) m[b] += krwValue(a) }
    return m
  }, [assets])
  const total = BUCKETS.reduce((s, b) => s + sums[b.key], 0)
  const allocSum = BUCKETS.reduce((s, b) => s + (Number(alloc[b.key]) || 0), 0)

  const now = thisMonth()
  const avgNet = Array.from({ length: 6 }, (_, i) => monthNet(txs, addMonth(now, -i))).reduce((a, b) => a + b, 0) / 6
  const thisNet = monthNet(txs, now)
  const fixedTotal = detectFixed(txs).reduce((s, f) => s + f.monthly, 0)
  const capacity = Math.max(0, Math.round(avgNet * 0.7))

  const diffs = BUCKETS.map((b) => ({ ...b, cur: sums[b.key], diff: total * (Number(alloc[b.key]) || 0) / 100 - sums[b.key] }))
  const underInv = diffs.filter((d) => d.key !== 'cash' && d.diff > total * 0.02).sort((a, b) => b.diff - a.diff)
  const overInv = diffs.filter((d) => d.key !== 'cash' && d.diff < -total * 0.02).sort((a, b) => a.diff - b.diff)

  const dynamic =
    thisNet < avgNet * 0.6 ? '이번 달은 지출(카드값 등)이 커서, 이번 회차 매수액을 줄이거나 한 번 쉬는 것도 좋아요.'
      : thisNet > avgNet * 1.2 ? '이번 달은 평소보다 여유가 있어, 여력의 일부를 더 담아도 괜찮아요.'
        : ''

  // 규칙 기반 코칭 문장
  const coachLines = useMemo(() => {
    const L: string[] = []
    if (capacity > 0) {
      L.push(`투자 여력: 월 약 ₩${won(capacity)} (순수익 ${signed(Math.round(avgNet))}의 70%, 비상금 30% 유지). 주간 ₩${won(Math.round(capacity / 4))}씩 분할 매수 추천.`)
    } else {
      L.push('최근 순수익이 마이너스예요. 신규 매수보다 지출 점검·현금 확보를 먼저 권해요.')
    }
    if (underInv.length) L.push('더 담기(부족): ' + underInv.map((d) => `${d.label} +₩${won(d.diff)}`).join(' · '))
    else L.push('목표 비중은 대체로 충족 상태예요. 목표를 높이거나 적립식으로 유지하세요.')
    if (overInv.length) L.push('덜기 검토(초과·매도 후보): ' + overInv.map((d) => `${d.label} ₩${won(d.diff)}`).join(' · '))
    if (fixedTotal > 0) L.push(`고정지출 ₩${won(fixedTotal)}/월을 감안해 여력을 잡았어요.`)
    if (dynamic) L.push(dynamic)
    return L
  }, [capacity, avgNet, underInv, overInv, fixedTotal, dynamic])

  async function saveAlloc() {
    if (!profile) return
    await repo.upsertProfile({ ...profile, targetAlloc: alloc })
    setMsg('목표 비중을 저장했어요.')
  }
  async function saveCoach() {
    const note: CoachNote = { id: uid(), profileId, date: todayISO(), createdAt: new Date().toISOString(), content: coachLines.join('\n'), source: 'rule' }
    await repo.upsertCoachNote(note)
    setMsg('오늘 코칭을 기록에 저장했어요.')
  }
  async function setAvg(a: Asset, v: number | undefined) { await repo.upsertAsset({ ...a, avgPrice: v }) }

  const holdings = assets.filter((a) => (a.type === 'stock' || a.type === 'etf' || a.type === 'coin' || a.type === 'gold') && a.quantity)

  return (
    <div>
      <PageHeader title="투자" desc="자산 배분·리밸런싱·매수/매도 코칭" />

      {/* 현재 배분 */}
      <Card>
        <CardLabel>현재 자산 배분 · 총 ₩{won(total)}</CardLabel>
        {total === 0 ? <Empty>투자·현금 자산을 추가하면 배분이 보여요.</Empty> : (
          <>
            <div className="flex h-7 rounded-lg overflow-hidden mt-1">
              {BUCKETS.filter((b) => sums[b.key] > 0).map((b) => (
                <div key={b.key} style={{ width: `${(sums[b.key] / total) * 100}%`, background: b.color }} className="flex items-center justify-center text-white text-[10px] font-bold" title={`${b.label} ${won(sums[b.key])}`}>
                  {sums[b.key] / total > 0.08 ? `${Math.round((sums[b.key] / total) * 100)}%` : ''}
                </div>
              ))}
            </div>
            <div className="flex gap-x-3 gap-y-1 flex-wrap mt-2.5">
              {BUCKETS.filter((b) => sums[b.key] > 0).map((b) => (
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
          <thead><tr className="text-sub text-left border-b border-line"><th className="py-1.5">자산군</th><th className="text-right">현재</th><th className="text-right">목표%</th><th className="text-right">조정</th></tr></thead>
          <tbody>
            {diffs.map((d) => (
              <tr key={d.key} className="border-b border-line">
                <td className="py-2 font-semibold">{d.label}<div className="text-[11px] text-sub font-normal tnum">{won(d.cur)}</div></td>
                <td className="text-right tnum">{total ? Math.round((d.cur / total) * 100) : 0}%</td>
                <td className="text-right"><input type="number" value={alloc[d.key] ?? 0} onChange={(e) => setAlloc({ ...alloc, [d.key]: Number(e.target.value) })} className={inputCls + ' w-[58px] text-right tnum py-1'} /></td>
                <td className={`text-right tnum font-bold ${Math.abs(d.diff) < total * 0.02 ? 'text-sub' : d.diff > 0 ? 'text-income' : 'text-expense'}`}>{Math.abs(d.diff) < total * 0.02 ? '적정' : d.diff > 0 ? `+${won(d.diff)}` : won(d.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end mt-3"><Button onClick={saveAlloc}>목표 저장</Button></div>
      </Card>

      {/* 코칭 */}
      <Card className="mt-3.5">
        <div className="flex items-center justify-between mb-1">
          <CardLabel>💡 투자 코칭 (오늘)</CardLabel>
          <button onClick={saveCoach} className="text-[12px] font-bold text-mint-d flex items-center gap-1 border border-line rounded-lg px-2.5 py-1.5 hover:bg-canvas"><Save size={13} /> 기록 저장</button>
        </div>
        <ul className="space-y-1.5">
          {coachLines.map((l, i) => <li key={i} className="text-[13px] flex gap-2"><span className="text-mint-d">•</span><span>{l}</span></li>)}
        </ul>
        <div className="mt-3 text-[12px] bg-canvas rounded-lg px-3 py-2.5 text-sub">
          🤖 위 코칭은 <b className="text-ink">내 데이터(현금흐름·비중) 기반 규칙</b> 추천이에요. <b className="text-ink">최근 뉴스·주가 흐름을 반영한 AI 매수/매도 추천(근거 첨부)</b>은 <b className="text-ink">클라우드 + AI 단계</b>에서 이 코칭에 함께 담을 예정이에요.
        </div>
      </Card>

      {/* 코칭 히스토리 */}
      {notes.length > 0 && (
        <Card className="mt-3.5">
          <CardLabel>📜 코칭 기록</CardLabel>
          {notes.map((n) => (
            <div key={n.id} className="py-2.5 border-b border-line last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-sub">{n.date} {n.source === 'ai' ? '· AI' : ''}</span>
                <button onClick={() => repo.deleteCoachNote(n.id)} className="text-sub hover:text-expense"><Trash2 size={14} /></button>
              </div>
              <div className="text-[12.5px] whitespace-pre-line mt-1">{n.content}</div>
            </div>
          ))}
        </Card>
      )}

      {/* 보유 종목 & 수익률 */}
      <Card className="mt-3.5">
        <CardLabel>보유 종목 · 수익률</CardLabel>
        {holdings.length === 0 ? <Empty>수량이 있는 투자 종목이 없어요.</Empty> : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-sub text-left border-b border-line"><th className="py-1.5">종목</th><th className="text-right">평단가</th><th className="text-right">현재가</th><th className="text-right">수익률</th></tr></thead>
            <tbody>
              {holdings.map((a) => {
                const roi = a.unitPrice && a.avgPrice ? ((a.unitPrice - a.avgPrice) / a.avgPrice) * 100 : null
                return (
                  <tr key={a.id} className="border-b border-line">
                    <td className="py-2 font-semibold">{a.name} <span className="text-[11px] text-sub font-normal">{a.market ? (a.market === 'us' ? '해외' : '국내') : ''} {a.ticker ?? ''}</span></td>
                    <td className="text-right"><input type="number" defaultValue={a.avgPrice ?? ''} onBlur={(e) => setAvg(a, e.target.value ? Number(e.target.value) : undefined)} placeholder="입력" className={inputCls + ' w-[84px] text-right tnum py-1'} /></td>
                    <td className="text-right tnum">{a.unitPrice ? won(a.unitPrice) : '-'}</td>
                    <td className={`text-right tnum font-bold ${roi == null ? 'text-sub' : roi >= 0 ? 'text-mint-d' : 'text-expense'}`}>{roi == null ? '-' : `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="text-[11px] text-sub mt-2">코인은 업비트 실시간 시세로 현재가 자동 반영. 주식 실시간 시세는 클라우드(증권사 API) 단계에서 연결 예정.</div>
      </Card>

      {msg && <div className="mt-4 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}
    </div>
  )
}
