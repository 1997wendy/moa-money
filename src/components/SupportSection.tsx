// 가족에게 받은 돈 (엄마·아빠 지원금) — 총자산엔 포함되지만 '내 돈만'과 구분해서 관리
//  · 매달 받는 것: 월 금액 × 받은 개월수로 누적액·회차 자동 계산
//  · 일시금(증여·펀드): 금액 그대로
//  · '돌려줘야 할 수도 있음'을 켠 항목만 '내 돈만'에서 차감 (증여·연금보험처럼 안 갚아도 되는 건 이미 내 돈)
import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { won, thisMonth } from '../lib/format'
import { providerLabel, supportMonths, supportTotal, repayableTotal } from '../lib/assets'
import { Card, CardLabel, Button, Modal, Field, inputCls } from './ui'
import AmountInput from './AmountInput'
import MonthInput from './MonthInput'
import type { Support } from '../db/types'

export default function SupportSection({ profileId, supports }: { profileId: string; supports: Support[] }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Support | undefined>()

  const received = supports.reduce((s, x) => s + supportTotal(x), 0) // 받은 돈 총액
  const repayable = repayableTotal(supports) // 돌려줘야 하는 금액

  const openEdit = (s?: Support) => { setEdit(s); setOpen(true) }
  const del = async (s: Support) => { if (confirm(`'${s.label}' 기록을 삭제할까요?`)) await repo.deleteSupport(s.id) }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between">
        <CardLabel>👨‍👩‍👧 가족에게 받은 돈</CardLabel>
        <button onClick={() => openEdit(undefined)} className="text-[12px] font-bold text-mint-d flex items-center gap-1"><Plus size={13} /> 추가</button>
      </div>

      {supports.length === 0 ? (
        <p className="text-[12px] text-sub leading-relaxed mt-1">
          엄마·아빠에게 받은 돈을 따로 기록해요. 총자산엔 포함되지만, <b className="text-ink">돌려줘야 하는 돈</b>은 ‘내 돈만’에서 빠져요.<br />
          <span className="text-mint-d">＋ 추가</span>로 매달 받는 돈·증여·받은 펀드 등을 넣어보세요.
        </p>
      ) : (
        <>
          <div className="mt-1">
            {supports.map((s) => {
              const months = supportMonths(s)
              return (
                <div key={s.id} className="flex items-center gap-2 py-2.5 border-b border-line last:border-0">
                  <div onClick={() => openEdit(s)} className="flex-1 min-w-0 flex items-center justify-between cursor-pointer hover:bg-canvas -ml-2 pl-2 rounded-lg">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-semibold truncate">{s.label}</span>
                      </div>
                      <div className="text-[11px] text-sub truncate">
                        {[
                          providerLabel(s),
                          s.kind === 'monthly'
                            ? `월 ₩${won(s.monthlyAmount || 0)} · ${months}회차${s.startMonth ? ` (${s.startMonth.slice(2)}~${s.endMonth ? s.endMonth.slice(2) : '계속'})` : ''}`
                            : '일시금',
                          s.note || null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="text-[14px] font-bold tnum shrink-0">₩{won(supportTotal(s))}</div>
                  </div>
                  <button onClick={() => del(s)} className="text-sub hover:text-expense p-1 shrink-0" title="삭제"><X size={16} /></button>
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 bg-canvas rounded-lg px-3 py-2 text-[12.5px]">
            받은 돈 합계 <b className="tnum">₩{won(received)}</b>
            {repayable > 0 && <span className="text-sub"> · 그중 돌려줘야 하는 돈 <b className="text-[#b7791f] tnum">₩{won(repayable)}</b> (‘내 돈만’에서 제외)</span>}
          </div>
        </>
      )}

      <SupportModal open={open} onClose={() => setOpen(false)} edit={edit} profileId={profileId} count={supports.length} />
    </Card>
  )
}

function SupportModal({ open, onClose, edit, profileId, count }: { open: boolean; onClose: () => void; edit?: Support; profileId: string; count: number }) {
  const [who, setWho] = useState('') // 준 사람 (직접 입력)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<'monthly' | 'lump'>('monthly')
  const [amount, setAmount] = useState<number | null>(null)
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null)
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [repay, setRepay] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    if (edit) {
      setWho(providerLabel(edit)); setLabel(edit.label)
      setKind(edit.kind); setAmount(edit.amount ?? null); setMonthlyAmount(edit.monthlyAmount ?? null)
      setStartMonth(edit.startMonth ?? ''); setEndMonth(edit.endMonth ?? ''); setRepay(edit.repay); setNote(edit.note ?? '')
    } else {
      setWho(''); setLabel(''); setKind('monthly'); setAmount(null)
      setMonthlyAmount(null); setStartMonth(''); setEndMonth(''); setRepay(false); setNote('')
    }
  }, [open, edit])

  // 매달 받은 개월수 미리보기
  const months = kind === 'monthly' && startMonth
    ? (() => {
        const end = endMonth || thisMonth()
        const [sy, sm] = startMonth.split('-').map(Number)
        const [ey, em] = end.split('-').map(Number)
        return Math.max(0, (ey - sy) * 12 + (em - sm) + 1)
      })()
    : 0
  const preview = kind === 'monthly' ? (monthlyAmount || 0) * months : (amount || 0)

  async function save() {
    if (!label.trim()) return
    const s: Support = {
      id: edit?.id ?? uid(), profileId,
      provider: 'other', providerName: who.trim() || '가족',
      label: label.trim(), kind,
      amount: kind === 'lump' ? (amount ?? 0) : undefined,
      monthlyAmount: kind === 'monthly' ? (monthlyAmount ?? 0) : undefined,
      startMonth: kind === 'monthly' ? (startMonth || undefined) : undefined,
      endMonth: kind === 'monthly' ? (endMonth || undefined) : undefined,
      repay, note: note.trim() || undefined,
      order: edit?.order ?? count,
      createdAt: edit?.createdAt ?? new Date().toISOString(),
    }
    await repo.upsertSupport(s)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '받은 돈 수정' : '받은 돈 추가'}>
      <Field label="누구에게 받았나요"><input value={who} onChange={(e) => setWho(e.target.value)} placeholder="예: 엄마, 아빠, 할머니" className={inputCls} /></Field>

      <Field label="항목명"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 매달 받는 생활비 / 증여 / 씨티은행 펀드" className={inputCls} /></Field>

      <Field label="유형">
        <div className="flex gap-1.5">
          {([['monthly', '매달 받음'], ['lump', '일시금(한 번)']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`flex-1 py-2 rounded-[10px] text-[12.5px] font-bold border ${kind === k ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{l}</button>
          ))}
        </div>
      </Field>

      {kind === 'monthly' ? (
        <>
          <Field label="매달 받는 금액"><AmountInput value={monthlyAmount} onChange={setMonthlyAmount} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="받기 시작한 달"><MonthInput value={startMonth} onChange={setStartMonth} /></Field>
            <Field label="마지막 받은 달 (계속 받으면 비움)"><MonthInput value={endMonth} onChange={setEndMonth} /></Field>
          </div>
        </>
      ) : (
        <Field label="받은 금액"><AmountInput value={amount} onChange={setAmount} /></Field>
      )}

      {preview > 0 && (
        <div className="text-[12.5px] bg-canvas rounded-lg px-3 py-2 mb-2">
          누적 받은 금액 <b className="tnum">₩{won(preview)}</b>{kind === 'monthly' && <span className="text-sub"> · {months}회차 (월 ₩{won(monthlyAmount || 0)} × {months})</span>}
        </div>
      )}

      <label className="flex items-start gap-2 text-[12.5px] mt-1 mb-1 cursor-pointer">
        <input type="checkbox" checked={repay} onChange={(e) => setRepay(e.target.checked)} className="mt-0.5" />
        <span>돌려줘야 할 수도 있는 돈이에요 <span className="text-sub">(체크하면 ‘내 돈만’ 총액에서 빠져요. 증여처럼 안 갚아도 되는 건 체크 마세요)</span></span>
      </label>

      <Field label="비고 (선택)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 20.1~22.12 받음 / 돌려줘야 할 수도" className={inputCls} /></Field>

      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteSupport(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
