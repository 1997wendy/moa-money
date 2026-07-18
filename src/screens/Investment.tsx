import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { History, Trash2 } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { useCoinSync } from '../hooks/useCoinSync'
import { useStockSync } from '../hooks/useStockSync'
import { useKrStockSync } from '../hooks/useKrStockSync'
import { useGoldSync } from '../hooks/useGoldSync'
import { won, signed, thisMonth, todayISO } from '../lib/format'
import { groupOf, krwValue } from '../lib/assets'
import { detectFixed } from '../lib/fixedCost'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, inputCls } from '../components/ui'
import type { Asset, CoachNote, Transaction } from '../db/types'

const BUCKETS = [
  { key: 'cash', label: '현금성', color: '#12b8a6' },
  { key: 'stock_kr', label: '국내주식', color: '#2f6fed' },
  { key: 'stock_us', label: '해외주식', color: '#5b8def' },
  { key: 'coin', label: '코인', color: '#c084fc' },
  { key: 'gold', label: '금', color: '#f5a524' },
  { key: 'etc', label: '기타(연금보험)', color: '#8b96a3' },
]
const DEFAULT_ALLOC: Record<string, number> = { cash: 20, stock_kr: 30, stock_us: 30, coin: 15, gold: 5, etc: 0 }

// 주식·ETF 국내/해외 → 국내주식/해외주식(ETF 합침). 코인·금 별도. 연금보험 등 인출 어려운 연금 → 기타. 나머지(현금·예적금·포인트·기타)는 현금성
function bucketOf(a: Asset): string {
  if (a.type === 'stock' || a.type === 'etf') return a.market === 'us' ? 'stock_us' : 'stock_kr'
  if (a.type === 'coin') return 'coin'
  if (a.type === 'gold') return 'gold'
  if (groupOf(a.type) === 'pension') return 'etc' // 연금보험 등 (계좌형 IRP·연금저축은 위에서 종목·예수금으로 분해됨)
  return 'cash'
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
  useStockSync(profileId)
  useKrStockSync(profileId)
  useGoldSync(profileId)
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId) : []), [profileId], [])
  const notes = useLiveQuery(() => (profileId ? repo.listCoachNotes(profileId) : []), [profileId])
  const noteList = notes ?? []
  const [alloc, setAlloc] = useState<Record<string, number>>(DEFAULT_ALLOC)
  const [histOpen, setHistOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiSaved, setAiSaved] = useState(false)

  useEffect(() => { setAlloc(profile?.targetAlloc ?? DEFAULT_ALLOC) }, [profile?.id, profile?.targetAlloc])

  const sums = useMemo(() => {
    const m: Record<string, number> = {}
    BUCKETS.forEach((b) => (m[b.key] = 0))
    for (const a of assets) {
      // 계좌형(IRP·연금저축펀드): 종목은 국내주식, 예수금은 현금성으로 분해
      if ((a.holdings && a.holdings.length) || a.cash) {
        for (const h of a.holdings ?? []) m.stock_kr += (h.value || 0)
        m.cash += a.cash || 0
        continue
      }
      m[bucketOf(a)] += krwValue(a)
    }
    return m
  }, [assets])
  const total = BUCKETS.reduce((s, b) => s + sums[b.key], 0)
  // 목표 비중은 연금보험(기타) 제외한 투자 자산만 대상
  const ALLOC = BUCKETS.filter((b) => b.key !== 'etc')
  const investTotal = ALLOC.reduce((s, b) => s + sums[b.key], 0)
  // 마지막 남은 빈 칸 하나는 100%가 되도록 자동 채움
  const emptyKeys = ALLOC.filter((b) => !(Number(alloc[b.key]) > 0))
  const autoKey = emptyKeys.length === 1 ? emptyKeys[0].key : null
  const enteredSum = ALLOC.reduce((s, b) => s + (b.key === autoKey ? 0 : Number(alloc[b.key]) || 0), 0)
  const autoVal = autoKey ? Math.max(0, 100 - enteredSum) : 0
  const effAlloc = (key: string) => (key === autoKey ? autoVal : Number(alloc[key]) || 0)
  const allocSum = ALLOC.reduce((s, b) => s + effAlloc(b.key), 0)

  const now = thisMonth()
  // 순수익 평균은 '완료된 달' 중 실제 거래가 있는 달만 대상 (진행 중인 이번 달 제외 → 왜곡 방지)
  const dataMonths = useMemo(
    () => Array.from(new Set(txs.map((t) => t.date.slice(0, 7)))).filter((m) => m < now).sort(),
    [txs, now],
  )
  const avgMonths = dataMonths.length
  const avgNet = avgMonths ? dataMonths.reduce((s, m) => s + monthNet(txs, m), 0) / avgMonths : 0
  const thisNet = monthNet(txs, now)
  const fixedTotal = detectFixed(txs).reduce((s, f) => s + f.monthly, 0)
  const capacity = Math.max(0, Math.round(avgNet * 0.7))
  const holdingList = assets.filter((a) => (a.type === 'stock' || a.type === 'etf' || a.type === 'coin' || a.type === 'gold') && a.quantity)
  const [copied, setCopied] = useState(false)

  const diffs = ALLOC.map((b) => ({ ...b, cur: sums[b.key], diff: investTotal * effAlloc(b.key) / 100 - sums[b.key] }))
  // 이번 달 지출이 평소보다 크면/작으면 매수 페이스 조절 안내 (완료 월 데이터가 있을 때만)
  const dynamic =
    avgMonths === 0 ? ''
      : thisNet < avgNet * 0.6 ? '이번 달은 지출(카드값 등)이 평소보다 커요. 이번 회차 매수액을 줄이거나 한 번 쉬어도 좋아요.'
        : thisNet > avgNet * 1.2 ? '이번 달은 평소보다 여유가 있어요. 여력 범위 안에서 조금 더 담아도 괜찮아요.'
          : ''

  // 앱이 계산할 수 있는 건 '현금흐름상 투자 여력'뿐. 무엇을 사고팔지는 뉴스·주가가 필요하므로 AI 코칭에 맡긴다.
  const coachLines = useMemo(() => {
    const L: string[] = []
    if (avgMonths === 0) {
      L.push('완료된 달의 가계부 데이터가 아직 없어요. 한 달이 지나면 투자 여력을 계산해 드려요.')
      return L
    }
    if (capacity > 0) {
      L.push(`이번 달 투자 여력은 약 ₩${won(capacity)}예요. (최근 ${avgMonths}개월 평균 순수익 ${signed(Math.round(avgNet))}의 70%, 나머지 30%는 비상금으로 남긴 값)`)
      L.push(`한 번에 넣기보다 나눠서 담는다면 매주 약 ₩${won(Math.round(capacity / 4))} 페이스예요.`)
    } else {
      L.push(`최근 ${avgMonths}개월 평균 순수익이 마이너스예요. 새로 매수하기보다 지출 점검·현금 확보를 먼저 권해요.`)
    }
    if (fixedTotal > 0) L.push(`매달 고정지출 약 ₩${won(fixedTotal)}을 빼고 남는 돈 기준으로 잡은 금액이에요.`)
    if (dynamic) L.push(dynamic)
    return L
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity, avgNet, avgMonths, fixedTotal, dynamic])

  // 오늘 저장해 둔 AI 답변을 텍스트박스에 불러오기 (하루 1건, 이어서 수정 가능)
  // 오늘자로 한 번만 초기화 → 저장 후에도 입력 내용이 유지되고, 날짜가 바뀌면 빈 박스로 새로 시작
  const today = todayISO()
  const initRef = useRef('')
  useEffect(() => {
    if (!profileId || notes === undefined) return
    const key = `${profileId}-${today}`
    if (initRef.current === key) return
    initRef.current = key
    setAiText(notes.find((n) => n.id === `coach-${profileId}-${today}`)?.content ?? '')
  }, [profileId, today, notes])

  async function saveAlloc() {
    if (!profile) return
    const filled = { ...alloc }
    if (autoKey) filled[autoKey] = autoVal
    await repo.upsertProfile({ ...profile, targetAlloc: filled })
  }
  async function saveContext(v: string) {
    if (profile) await repo.upsertProfile({ ...profile, investContext: v.trim() || undefined })
  }

  // AI(클로드·챗지피티)에 붙여넣을 코칭 프롬프트 생성
  function buildPrompt(): string {
    const L: string[] = ['나는 개인 투자자야. 아래 내 투자 현황을 보고, 최근 경제 뉴스와 주가 흐름을 반영해 목표 비중과 구체적인 리밸런싱·매매를 추천해줘.', '']
    L.push(`[현재 자산 배분] 총 ₩${won(total)}`)
    for (const b of BUCKETS) if (sums[b.key] > 0) L.push(`- ${b.label}: ₩${won(sums[b.key])} (${((sums[b.key] / total) * 100).toFixed(1)}%)`)
    L.push('', '[목표 비중 추천 요청] 아래 자산군별로 목표 비중(%)을 추천해줘. (연금보험 제외, 합계 100%)')
    for (const b of ALLOC) L.push(`- ${b.label} (현재 ${investTotal ? ((sums[b.key] / investTotal) * 100).toFixed(1) : '0.0'}%)`)
    if (holdingList.length) {
      L.push('', '[보유 종목]')
      for (const a of holdingList) {
        const roi = a.principal && a.principal > 0 ? ((krwValue(a) - a.principal) / a.principal) * 100 : null
        L.push(`- ${a.name}${a.market === 'us' ? '(해외)' : a.market === 'kr' ? '(국내)' : ''}: 평가 ₩${won(krwValue(a))}${roi != null ? `, 수익률 ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%` : ''}`)
      }
    }
    if (capacity > 0) L.push('', `[월 투자 여력] 약 ₩${won(capacity)} (최근 순수익의 70%)`)
    if (profile?.investContext?.trim()) L.push('', `[내 투자 성향] ${profile.investContext.trim()}`)
    L.push('', '요청:', '1. 먼저 위 자산군별 목표 비중(%)을 추천하고, 그 근거를 설명해줘. (내가 앱의 목표% 칸에 그대로 입력해서 쓸 거야)', '2. 그 목표에 맞추려면 지금 무엇을 얼마 팔고 무엇을 얼마 사야 하는지 구체적 금액으로.', '3. 요즘 주목받는 종목·섹터가 있으면 소액 편입 아이디어를 근거(최근 뉴스·실적)와 함께.', '4. 보유 종목별 보유/추가매수/매도 의견과 대략적인 매수·매도 목표가 구간.', '5. 최종 결정은 내가 하니, 각 추천에 근거를 붙여 명확하고 자세하게.')
    return L.join('\n')
  }
  function copyPrompt() {
    navigator.clipboard.writeText(buildPrompt()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  // 오늘 날짜 기록 1건으로 저장/업데이트 — 저장 후에도 입력 내용은 박스에 그대로 유지
  async function saveAiNote() {
    if (!profileId) return
    const d = todayISO()
    const id = `coach-${profileId}-${d}`
    const t = aiText.trim()
    if (!t) { await repo.deleteCoachNote(id) } // 비우고 저장하면 오늘 기록 삭제
    else await repo.upsertCoachNote({ id, profileId, date: d, createdAt: new Date().toISOString(), content: t, source: 'ai' })
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 2000)
  }

  return (
    <div>
      <PageHeader title="투자" />

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
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: b.color }} />{b.label} {((sums[b.key] / total) * 100).toFixed(1)}%
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
                <td className="text-right tnum">{investTotal ? ((d.cur / investTotal) * 100).toFixed(1) : '0.0'}%</td>
                <td className="text-right"><input type="number" value={alloc[d.key] || ''} onChange={(e) => setAlloc({ ...alloc, [d.key]: Number(e.target.value) })} onWheel={(e) => e.currentTarget.blur()} placeholder={autoKey === d.key ? String(autoVal) : '0'} className={`w-[64px] text-right tnum border rounded-lg px-2 py-1 text-[13px] bg-surface outline-none focus:border-mint ${autoKey === d.key ? 'border-mint text-mint-d placeholder:text-mint-d' : 'border-line'}`} /></td>
                <td className={`text-right tnum font-bold ${Math.abs(d.diff) < investTotal * 0.02 ? 'text-sub' : d.diff > 0 ? 'text-income' : 'text-expense'}`}>{Math.abs(d.diff) < investTotal * 0.02 ? '적정' : d.diff > 0 ? `+${won(d.diff)}` : won(d.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end mt-3"><Button onClick={saveAlloc}>목표 저장</Button></div>
      </Card>

      {/* 코칭 */}
      <Card className="mt-3.5">
        <div className="flex items-center justify-between mb-1">
          <CardLabel>💡 투자 코칭</CardLabel>
          <button onClick={() => setHistOpen(true)} className="text-[12px] font-bold text-mint-d flex items-center gap-1 border border-line rounded-lg px-2.5 py-1.5 hover:bg-canvas"><History size={13} /> 기록 보기</button>
        </div>
        <ul className="space-y-1.5">
          {coachLines.map((l, i) => <li key={i} className="text-[13px] flex gap-2"><span className="text-mint-d">•</span><span>{l}</span></li>)}
        </ul>
        <div className="mt-3">
          <div className="text-[12px] font-semibold text-sub mb-1">내 투자 성향/메모</div>
          <textarea defaultValue={profile?.investContext ?? ''} onBlur={(e) => saveContext(e.target.value)} placeholder="예: 매달 적립식으로 꾸준히 / 공격적이진 않게 / 관심: 반도체 ETF, 배당주" className={inputCls + ' h-16 resize-none leading-snug'} />
        </div>
        <div className="mt-3 bg-mint-l rounded-xl px-3.5 py-3">
          <div className="text-[12.5px] text-mint-d leading-relaxed mb-2">🤖 <b>무엇을 사고팔지</b>는 최근 뉴스·주가 흐름이 필요해 앱이 임의로 추천하지 않아요. 아래 버튼으로 <b>내 투자 현황(성향/메모 포함) 프롬프트를 복사</b>해 Claude나 ChatGPT에 붙여넣으면, 근거와 함께 추천을 받을 수 있어요.</div>
          <Button onClick={copyPrompt} className="w-full">{copied ? '✓ 복사됐어요! Claude/ChatGPT에 붙여넣으세요' : '📋 AI 코칭 프롬프트 복사'}</Button>
        </div>

        {/* AI가 준 답변 저장 — 하루 1건. 오늘 저장한 내용은 박스에 그대로 남고, 날짜가 바뀌면 빈 박스로 새로 시작 */}
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[12px] font-semibold text-sub">📝 AI 답변 기록 ({today})</div>
          </div>
          <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Claude·ChatGPT가 준 코칭 답변을 여기에 붙여넣으세요. 오늘 날짜로 저장되고, 저장 후에도 이 칸에 남아 이어서 수정할 수 있어요. (내일이면 빈 칸으로 새로 시작)" className={inputCls + ' h-28 resize-none leading-snug'} />
          <div className="flex justify-end mt-2"><Button onClick={saveAiNote}>{aiSaved ? '✓ 저장됐어요' : '오늘 기록에 저장'}</Button></div>
        </div>
      </Card>

      <CoachHistoryModal open={histOpen} onClose={() => setHistOpen(false)} notes={noteList} />
    </div>
  )
}

function CoachHistoryModal({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: CoachNote[] }) {
  const [q, setQ] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const filtered = notes.filter((n) => !q || n.date.includes(q) || n.content.includes(q))
  const toggle = (id: string) => setOpenIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <Modal open={open} onClose={onClose} title={`코칭 기록 (${notes.length}건)`}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="날짜(예: 2026-07) 또는 내용 검색" className={inputCls + ' mb-3'} />
      {filtered.length === 0 ? (
        <div className="text-center text-sub text-[13px] py-6">기록이 없어요.</div>
      ) : (
        filtered.map((n) => {
          const isOpen = openIds.has(n.id)
          return (
            <div key={n.id} className="border-b border-line last:border-0">
              <div className="flex items-center gap-2 py-2.5">
                <button onClick={() => toggle(n.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-[12px] font-bold text-sub">{n.date}{n.source === 'ai' ? ' · AI' : ''}</div>
                  <div className={`text-[12.5px] mt-0.5 ${isOpen ? 'whitespace-pre-line' : 'truncate'}`}>{isOpen ? n.content : n.content.split('\n')[0]}</div>
                </button>
                <button onClick={() => repo.deleteCoachNote(n.id)} className="text-sub hover:text-expense shrink-0 p-1"><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })
      )}
    </Modal>
  )
}
