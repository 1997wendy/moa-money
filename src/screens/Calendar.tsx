import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { compact, thisMonth, monthLabel, addMonth } from '../lib/format'
import { PageHeader, Button, Modal, Field, inputCls } from '../components/ui'
import type { Schedule } from '../db/types'

export default function Calendar() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [modal, setModal] = useState(false)
  const [preset, setPreset] = useState<string>('')

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const schedules = useLiveQuery(() => (profileId ? repo.listSchedules(profileId) : []), [profileId], [])

  // 날짜별 집계
  const byDay = useMemo(() => {
    const map: Record<string, { income: number; expense: number; sch: Schedule[] }> = {}
    const get = (d: string) => (map[d] ??= { income: 0, expense: 0, sch: [] })
    for (const t of txs) {
      if (t.type === 'income') get(t.date).income += t.amount
      else get(t.date).expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
    }
    for (const s of schedules) if (s.date.startsWith(month)) get(s.date).sch.push(s)
    return map
  }, [txs, schedules, month])

  // 달력 격자 (일요일 시작)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const dateStr = (d: number) => `${month}-${String(d).padStart(2, '0')}`

  function addOn(d?: number) {
    setPreset(d ? dateStr(d) : `${month}-01`)
    setModal(true)
  }

  return (
    <div>
      <PageHeader
        title="캘린더"
        desc="날짜별 수입·지출과 일정을 한눈에"
        right={<Button onClick={() => addOn()}><Plus size={15} className="inline -mt-0.5 mr-1" />일정 추가</Button>}
      />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
      </div>

      <div className="bg-surface border border-line rounded-[12px] p-3">
        <div className="grid grid-cols-7 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`text-center text-[12px] py-1 ${i === 0 ? 'text-expense' : i === 6 ? 'text-income' : 'text-sub'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
          {cells.map((d, i) => {
            const info = d ? byDay[dateStr(d)] : undefined
            return (
              <div
                key={i}
                onClick={() => d && addOn(d)}
                className={`min-h-[86px] bg-surface p-1.5 ${d ? 'cursor-pointer hover:bg-canvas' : 'bg-canvas'}`}
              >
                {d && (
                  <>
                    <div className="text-[12px] text-sub">{d}</div>
                    {info?.expense ? <div className="text-[10.5px] font-bold text-expense tnum mt-0.5">-{compact(info.expense)}</div> : null}
                    {info?.income ? <div className="text-[10.5px] font-bold text-income tnum">+{compact(info.income)}</div> : null}
                    {info?.sch.map((s) => (
                      <div key={s.id} className="text-[10px] font-semibold mt-0.5 px-1 py-0.5 rounded bg-[#efeafe] text-[#6b46e5] truncate">
                        {s.title}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[12px] text-sub">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-expense inline-block" />지출</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-income inline-block" />수입</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#6b46e5] inline-block" />일정</span>
        </div>
      </div>

      <ScheduleModal open={modal} onClose={() => setModal(false)} date={preset} profileId={profileId} />
    </div>
  )
}

function ScheduleModal({ open, onClose, date, profileId }: { open: boolean; onClose: () => void; date: string; profileId: string }) {
  const [d, setD] = useState(date)
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  useEffect(() => { if (open) { setD(date); setTitle(''); setMemo('') } }, [open, date])

  async function save() {
    if (!title.trim()) return
    const s: Schedule = { id: uid(), profileId, date: d, title: title.trim(), memo: memo.trim() || undefined, source: 'manual' }
    await repo.upsertSchedule(s)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="일정 추가">
      <Field label="날짜"><input type="date" value={d} onChange={(e) => setD(e.target.value)} className={inputCls} /></Field>
      <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 카드결제일" className={inputCls} /></Field>
      <Field label="메모(선택)"><input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} /></Field>
      <div className="flex gap-2 mt-4 justify-end">
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
