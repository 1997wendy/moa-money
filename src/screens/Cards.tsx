import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, thisMonth, monthLabel } from '../lib/format'
import { Card as Box, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Card } from '../db/types'

export default function Cards() {
  const { profileId } = useProfile()
  const month = thisMonth()
  const cards = useLiveQuery(() => (profileId ? repo.listCards(profileId) : []), [profileId], [])
  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Card | undefined>()

  const spendByCard = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of txs) {
      if (t.type !== 'expense' || !t.cardId) continue
      map[t.cardId] = (map[t.cardId] ?? 0) + t.amount
    }
    return map
  }, [txs])

  return (
    <div>
      <PageHeader title="카드혜택" desc={`${monthLabel(month)} 실적·한도 진행률 · 규칙은 직접 입력`} />

      {cards.length === 0 && <Empty>카드가 없어요. ‘카드 추가’로 혜택 규칙을 입력하세요.</Empty>}

      <div className="grid grid-cols-2 gap-3.5">
        {cards.map((c) => {
          const spend = spendByCard[c.id] ?? 0
          const req = c.requiredSpend ?? 0
          const reqPct = req ? Math.min(100, (spend / req) * 100) : 0
          const metReq = req > 0 && spend >= req
          const estBenefit = Math.min(c.benefitCap ?? 0, Math.round((spend * (c.rate ?? 0)) / 100))
          const benefitPct = c.benefitCap ? Math.min(100, (estBenefit / c.benefitCap) * 100) : 0
          const capFull = c.benefitCap ? estBenefit >= c.benefitCap : false
          return (
            <Box key={c.id}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-[15px]">{c.name}</div>
                <button onClick={() => { setEdit(c); setModal(true) }} className="text-[12px] text-sub hover:text-ink">수정</button>
              </div>
              <div className="text-[11.5px] text-sub mt-0.5">
                {c.area ? `${c.area} · ` : ''}실적 {won(req)} · 한도 월 {won(c.benefitCap ?? 0)} · 적립 {c.rate ?? 0}%
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[12.5px]">
                  <span>실적</span>
                  <span className="tnum">{won(spend)} / {won(req)} {metReq && '✔'}</span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                  <div className="h-full rounded-full" style={{ width: `${reqPct}%`, background: metReq ? '#12b8a6' : '#f5a524' }} />
                </div>
              </div>

              <div className="mt-2.5">
                <div className="flex justify-between text-[12.5px]">
                  <span>혜택 소진(예상)</span>
                  <span className="tnum">{won(estBenefit)} / {won(c.benefitCap ?? 0)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden mt-1">
                  <div className="h-full rounded-full" style={{ width: `${benefitPct}%`, background: capFull ? '#e5484d' : '#12b8a6' }} />
                </div>
              </div>

              <div className={`mt-3 text-[12px] rounded-lg px-3 py-2 border border-dashed ${
                capFull ? 'bg-[#fdeaea] text-expense border-expense'
                  : metReq ? 'bg-mint-l text-mint-d border-mint'
                  : 'bg-[#fff8ee] text-[#b9770a] border-warn'
              }`}>
                {capFull ? '혜택 한도 소진 완료! 다음 결제는 다른 카드로.'
                  : metReq ? '실적 충족 완료. 혜택 한도까지 이 카드로 쓰세요.'
                  : `실적까지 ${won(Math.max(0, req - spend))} 남음.`}
              </div>
            </Box>
          )
        })}
      </div>

      {/* 연말정산 가이드 */}
      <Box className="mt-3.5">
        <CardLabel>🗓️ 연말정산 가이드</CardLabel>
        <p className="text-[13px] text-sub">
          신용카드 공제율 15%, 체크·현금영수증 30%. <b className="text-ink">총급여의 25% 초과분</b>부터 공제가 시작돼요.
          누적 사용액이 25% 문턱을 넘은 뒤부터는 공제율 높은 <b className="text-ink">체크카드/현금</b> 사용이 유리합니다.
        </p>
        <p className="text-[12px] text-sub mt-2">※ 총급여·카드 종류(신용/체크)를 입력하면 정확한 최적 결제 추천을 계산할 수 있어요. (다음 단계)</p>
      </Box>

      <Fab onClick={() => { setEdit(undefined); setModal(true) }} label="카드 추가" />
      <CardModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} />
    </div>
  )
}

function CardModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Card; profileId: string }) {
  const [name, setName] = useState('')
  const [req, setReq] = useState<number | null>(null)
  const [cap, setCap] = useState<number | null>(null)
  const [rate, setRate] = useState('')
  const [area, setArea] = useState('')
  useEffect(() => {
    if (!open) return
    if (edit) { setName(edit.name); setReq(edit.requiredSpend ?? null); setCap(edit.benefitCap ?? null); setRate(String(edit.rate ?? '')); setArea(edit.area ?? '') }
    else { setName(''); setReq(null); setCap(null); setRate(''); setArea('') }
  }, [open, edit])

  async function save() {
    if (!name.trim()) return
    const c: Card = {
      id: edit?.id ?? uid(), profileId, name: name.trim(),
      requiredSpend: req || undefined, benefitCap: cap || undefined,
      rate: Number(rate) || undefined, area: area.trim() || undefined, cycle: 'prev-month',
    }
    await repo.upsertCard(c)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '카드 수정' : '카드 추가'}>
      <Field label="카드 이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 국민 이지카드" className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="월 실적 조건 (원)"><AmountInput value={req} onChange={setReq} /></Field>
        <Field label="월 혜택 한도 (원)"><AmountInput value={cap} onChange={setCap} /></Field>
        <Field label="적립·할인율 (%)"><input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls + ' text-right tnum'} /></Field>
        <Field label="혜택 영역"><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="배달/카페 등" className={inputCls} /></Field>
      </div>
      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteCard(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
