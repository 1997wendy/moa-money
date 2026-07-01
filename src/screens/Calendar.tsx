import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, thisMonth, monthLabel, addMonth } from '../lib/format'
import { holidayName } from '../lib/holidays'
import { SCH_COLORS, colorOf } from '../lib/colors'
import { PageHeader, Button, Modal, Field, inputCls, Fab } from '../components/ui'
import type { RepeatKind, Schedule, Transaction } from '../db/types'

/** 반복 규칙을 고려해 해당 날짜에 일정이 뜨는지 */
function occursOn(s: Schedule, dateStr: string): boolean {
  if (dateStr < s.date) return false
  if (s.repeatUntil && dateStr > s.repeatUntil) return false
  const rep = s.repeat ?? 'none'
  if (rep === 'none') return dateStr === s.date
  const d = new Date(dateStr + 'T00:00')
  const start = new Date(s.date + 'T00:00')
  if (rep === 'daily') return true
  if (rep === 'weekly') return d.getDay() === start.getDay()
  if (rep === 'monthly') return d.getDate() === start.getDate()
  if (rep === 'yearly') return d.getMonth() === start.getMonth() && d.getDate() === start.getDate()
  return false
}

export default function Calendar() {
  const { profileId } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [schModal, setSchModal] = useState(false)
  const [editSch, setEditSch] = useState<Schedule | undefined>()
  const [presetDate, setPresetDate] = useState('')
  const [dayDetail, setDayDetail] = useState<string | null>(null)

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const schedules = useLiveQuery(() => (profileId ? repo.listSchedules(profileId) : []), [profileId], [])

  const byDay = useMemo(() => {
    const map: Record<string, { income: number; expense: number; sch: Schedule[] }> = {}
    const get = (d: string) => (map[d] ??= { income: 0, expense: 0, sch: [] })
    for (const t of txs) {
      if (t.type === 'income') get(t.date).income += t.amount
      else get(t.date).expense += t.splits.filter((s) => !s.owedBy).reduce((a, s) => a + s.amount, 0)
    }
    return map
  }, [txs])

  const [y, m] = month.split('-').map(Number)
  const startPad = new Date(y, m - 1, 1).getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (number | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const dateStr = (d: number) => `${month}-${String(d).padStart(2, '0')}`
  const schedulesOn = (d: number) => schedules.filter((s) => occursOn(s, dateStr(d)))

  function openAdd(d?: number) { setEditSch(undefined); setPresetDate(d ? dateStr(d) : `${month}-01`); setSchModal(true) }
  function openEdit(s: Schedule) { setEditSch(s); setSchModal(true) }

  return (
    <div>
      <PageHeader title="캘린더" desc="수입·지출·일정·공휴일을 한눈에" />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
        <button onClick={() => setMonth(thisMonth())} className="ml-1 text-[12px] text-sub border border-line rounded-lg px-2.5 py-1 hover:bg-canvas">오늘</button>
      </div>

      <div className="bg-surface border border-line rounded-[12px] p-3">
        <div className="grid grid-cols-7 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`text-center text-[12px] py-1 ${i === 0 ? 'text-expense' : i === 6 ? 'text-income' : 'text-sub'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
          {cells.map((d, i) => {
            const ds = d ? dateStr(d) : ''
            const info = d ? byDay[ds] : undefined
            const hol = d ? holidayName(ds) : undefined
            const dow = i % 7
            const isRed = dow === 0 || !!hol
            return (
              <div key={i} onClick={() => d && openAdd(d)} className={`min-h-[92px] bg-surface p-1.5 ${d ? 'cursor-pointer hover:bg-canvas' : 'bg-canvas'}`}>
                {d && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`text-[12px] ${isRed ? 'text-expense font-semibold' : dow === 6 ? 'text-income' : 'text-sub'}`}>{d}</span>
                      {hol && <span className="text-[9px] text-expense font-semibold truncate max-w-[52px]">{hol}</span>}
                    </div>
                    {info?.expense ? (
                      <button onClick={(e) => { e.stopPropagation(); setDayDetail(ds) }} className="block text-[10.5px] font-bold text-expense tnum mt-0.5 hover:underline">-{compact(info.expense)}</button>
                    ) : null}
                    {info?.income ? (
                      <button onClick={(e) => { e.stopPropagation(); setDayDetail(ds) }} className="block text-[10.5px] font-bold text-income tnum hover:underline">+{compact(info.income)}</button>
                    ) : null}
                    {schedulesOn(d).map((s) => {
                      const c = colorOf(s.color)
                      return (
                        <button
                          key={s.id}
                          onClick={(e) => { e.stopPropagation(); openEdit(s) }}
                          className="w-full text-left text-[10px] font-semibold mt-0.5 px-1 py-0.5 rounded truncate flex items-center gap-0.5"
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {s.time && <span className="tnum">{s.time}</span>}
                          <span className="truncate">{s.title}</span>
                          {s.memo && <span title="메모 있음">📝</span>}
                          {s.repeat && s.repeat !== 'none' && <span title="반복">🔁</span>}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[12px] text-sub flex-wrap">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-expense inline-block" />지출</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-income inline-block" />수입</span>
          <span className="text-[11px]">· 숫자 클릭 → 그날 내역 · 일정 클릭 → 수정</span>
        </div>
      </div>

      <Fab onClick={() => openAdd()} label="일정 추가" />
      <ScheduleModal open={schModal} onClose={() => setSchModal(false)} edit={editSch} date={presetDate} profileId={profileId} />
      <DayDetailModal date={dayDetail} txs={txs} onClose={() => setDayDetail(null)} />
    </div>
  )
}

function DayDetailModal({ date, txs, onClose }: { date: string | null; txs: Transaction[]; onClose: () => void }) {
  if (!date) return null
  const rows = txs.filter((t) => t.date === date)
  const income = rows.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((a, t) => a + t.splits.filter((s) => !s.owedBy).reduce((x, s) => x + s.amount, 0), 0)
  return (
    <Modal open={!!date} onClose={onClose} title={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 내역`}>
      <div className="flex gap-3 mb-3">
        <div className="flex-1 bg-canvas rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-sub">수입</div>
          <div className="text-[15px] font-bold text-income tnum">+{won(income)}</div>
        </div>
        <div className="flex-1 bg-canvas rounded-lg p-2.5 text-center">
          <div className="text-[11px] text-sub">지출(내 부담)</div>
          <div className="text-[15px] font-bold text-expense tnum">-{won(expense)}</div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-sub text-[13px] py-6">이 날 거래가 없어요.</div>
      ) : (
        rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
            <div>
              <div className="text-[13.5px] font-semibold">{t.merchant}</div>
              <div className="text-[11px] text-sub">{t.splits.map((s) => s.category).join(', ')}{t.method ? ` · ${t.method}` : ''}</div>
            </div>
            <span className={`tnum font-bold text-[14px] ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>{t.type === 'income' ? '+' : '-'}{won(t.amount)}</span>
          </div>
        ))
      )}
    </Modal>
  )
}

const REPEATS: [RepeatKind, string][] = [
  ['none', '반복 안 함'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월'], ['yearly', '매년'],
]

function ScheduleModal({
  open, onClose, edit, date, profileId,
}: {
  open: boolean; onClose: () => void; edit?: Schedule; date: string; profileId: string
}) {
  const [d, setD] = useState(date)
  const [time, setTime] = useState('')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [color, setColor] = useState('violet')
  const [repeat, setRepeat] = useState<RepeatKind>('none')
  const [repeatUntil, setRepeatUntil] = useState('')

  useEffect(() => {
    if (!open) return
    if (edit) {
      setD(edit.date); setTime(edit.time ?? ''); setTitle(edit.title); setMemo(edit.memo ?? '')
      setColor(edit.color ?? 'violet'); setRepeat(edit.repeat ?? 'none'); setRepeatUntil(edit.repeatUntil ?? '')
    } else {
      setD(date); setTime(''); setTitle(''); setMemo(''); setColor('violet'); setRepeat('none'); setRepeatUntil('')
    }
  }, [open, edit, date])

  async function save() {
    if (!title.trim()) return
    const s: Schedule = {
      id: edit?.id ?? uid(), profileId, date: d, time: time || undefined,
      title: title.trim(), memo: memo.trim() || undefined, source: 'manual',
      color, repeat, repeatUntil: repeat !== 'none' && repeatUntil ? repeatUntil : undefined,
    }
    await repo.upsertSchedule(s)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '일정 수정' : '일정 추가'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="날짜"><input type="date" value={d} onChange={(e) => setD(e.target.value)} className={inputCls} /></Field>
        <Field label="시간 (선택)"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 카드결제일" className={inputCls} /></Field>

      <Field label="색상">
        <div className="flex gap-2 mt-1">
          {SCH_COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => setColor(c.key)}
              title={c.label}
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${color === c.key ? 'border-ink scale-110' : 'border-transparent'}`}
              style={{ background: c.bg }}
            >
              <i className="w-3.5 h-3.5 rounded-full" style={{ background: c.dot }} />
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="반복">
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={inputCls}>
            {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {repeat !== 'none' && (
          <Field label="반복 종료일 (선택)"><input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputCls} /></Field>
        )}
      </div>

      <Field label="메모 (선택)"><input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} /></Field>

      <div className="flex gap-2 mt-4">
        {edit && (
          <Button variant="ghost" className="!text-expense" onClick={async () => {
            if (confirm(edit.repeat && edit.repeat !== 'none' ? '반복 일정 전체를 삭제할까요?' : '이 일정을 삭제할까요?')) {
              await repo.deleteSchedule(edit.id); onClose()
            }
          }}>삭제</Button>
        )}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
