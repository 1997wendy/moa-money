import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, thisMonth, monthLabel, addMonth, addDays } from '../lib/format'
import { holidayName } from '../lib/holidays'
import { SCH_COLORS, colorOf } from '../lib/colors'
import { PageHeader, Button, Modal, Field, inputCls, Fab } from '../components/ui'
import TimeInput from '../components/TimeInput'
import type { RepeatKind, Schedule, Transaction } from '../db/types'

/** 반복 규칙 + 예외를 고려해 해당 날짜에 일정이 뜨는지 */
function occursOn(s: Schedule, dateStr: string): boolean {
  if (dateStr < s.date) return false
  if (s.repeatUntil && dateStr > s.repeatUntil) return false
  if (s.exceptions?.includes(dateStr)) return false
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
  const [occDate, setOccDate] = useState('')
  const [presetDate, setPresetDate] = useState('')
  const [dayModal, setDayModal] = useState<string | null>(null)

  const txs = useLiveQuery(() => (profileId ? repo.listTransactions(profileId, { month }) : []), [profileId, month], [])
  const schedules = useLiveQuery(() => (profileId ? repo.listSchedules(profileId) : []), [profileId], [])

  const byDay = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {}
    const get = (d: string) => (map[d] ??= { income: 0, expense: 0 })
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
  const schedulesOn = (ds: string) => schedules.filter((s) => occursOn(s, ds))

  function openAdd(ds: string) { setEditSch(undefined); setOccDate(''); setPresetDate(ds); setSchModal(true) }
  function openEdit(s: Schedule, occ: string) { setEditSch(s); setOccDate(occ); setSchModal(true) }

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
            const daySch = d ? schedulesOn(ds) : []
            const shown = daySch.slice(0, 3)
            const moreCount = daySch.length - shown.length
            return (
              <div key={i} onClick={() => d && openAdd(ds)} className={`min-h-[96px] bg-surface p-1.5 flex flex-col ${d ? 'cursor-pointer hover:bg-canvas' : 'bg-canvas'}`}>
                {d && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`text-[12px] ${isRed ? 'text-expense font-semibold' : dow === 6 ? 'text-income' : 'text-sub'}`}>{d}</span>
                      {hol && <span className="text-[9px] text-expense font-semibold truncate max-w-[52px]">{hol}</span>}
                    </div>

                    <div className="flex-1 mt-0.5 space-y-0.5">
                      {shown.map((s) => {
                        const c = colorOf(s.color)
                        return (
                          <button key={s.id} onClick={(e) => { e.stopPropagation(); openEdit(s, ds) }}
                            className="w-full text-left text-[10px] font-semibold px-1 py-0.5 rounded truncate flex items-center gap-1"
                            style={{ background: c.bg, color: c.fg }}>
                            {s.time && <span className="tnum opacity-80 shrink-0">{s.time}</span>}
                            <span className="truncate">{s.title}</span>
                            {s.memo && <span className="shrink-0" title="메모">📝</span>}
                            {s.repeat && s.repeat !== 'none' && <span className="shrink-0" title="반복">🔁</span>}
                          </button>
                        )
                      })}
                      {moreCount > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setDayModal(ds) }} className="text-[9.5px] text-mint-d font-bold pl-1 hover:underline">+{moreCount}개 더 보기</button>
                      )}
                    </div>

                    {(info?.expense || info?.income) ? (
                      <button onClick={(e) => { e.stopPropagation(); setDayModal(ds) }} className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-bold tnum rounded bg-canvas px-1 py-0.5 hover:bg-line/60">
                        {info?.income ? <span className="text-income">+{compact(info.income)}</span> : null}
                        {info?.expense ? <span className="text-expense">-{compact(info.expense)}</span> : null}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[12px] text-sub flex-wrap">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-expense inline-block" />지출</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-income inline-block" />수입</span>
          <span className="text-[11px]">· 날짜 클릭 → 일정 추가 · 금액/＋N → 그날 모아보기</span>
        </div>
      </div>

      <Fab onClick={() => openAdd(`${month}-01`)} label="일정 추가" />
      <ScheduleModal open={schModal} onClose={() => setSchModal(false)} edit={editSch} occDate={occDate} date={presetDate} profileId={profileId} />
      <DayModal
        date={dayModal}
        schedules={dayModal ? schedulesOn(dayModal) : []}
        txs={txs}
        onClose={() => setDayModal(null)}
        onEdit={(s) => { const dd = dayModal!; setDayModal(null); openEdit(s, dd) }}
        onAdd={() => { const dd = dayModal!; setDayModal(null); openAdd(dd) }}
      />
    </div>
  )
}

function DayModal({
  date, schedules, txs, onClose, onEdit, onAdd,
}: {
  date: string | null; schedules: Schedule[]; txs: Transaction[]
  onClose: () => void; onEdit: (s: Schedule) => void; onAdd: () => void
}) {
  if (!date) return null
  const rows = txs.filter((t) => t.date === date)
  const income = rows.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const expense = rows.filter((t) => t.type === 'expense').reduce((a, t) => a + t.splits.filter((s) => !s.owedBy).reduce((x, s) => x + s.amount, 0), 0)

  return (
    <Modal open={!!date} onClose={onClose} title={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-sub">일정 {schedules.length}건</span>
        <button onClick={onAdd} className="text-[12px] font-bold text-mint-d flex items-center gap-1"><Plus size={13} /> 일정 추가</button>
      </div>
      {schedules.length === 0 ? (
        <div className="text-[13px] text-sub py-2">일정이 없어요.</div>
      ) : (
        schedules.map((s) => {
          const c = colorOf(s.color)
          return (
            <button key={s.id} onClick={() => onEdit(s)} className="w-full text-left flex items-center gap-2 py-2 border-b border-line last:border-0 hover:bg-canvas -mx-2 px-2 rounded-lg">
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.dot }} />
              {s.time && <span className="text-[12px] tnum text-sub">{s.time}</span>}
              <span className="text-[13.5px] font-semibold flex-1">{s.title}</span>
              {s.memo && <span title="메모">📝</span>}
              {s.repeat && s.repeat !== 'none' && <span title="반복">🔁</span>}
            </button>
          )
        })
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="flex gap-3 mb-2">
            <div className="flex-1 bg-canvas rounded-lg p-2 text-center"><div className="text-[11px] text-sub">수입</div><div className="text-[14px] font-bold text-income tnum">+{won(income)}</div></div>
            <div className="flex-1 bg-canvas rounded-lg p-2 text-center"><div className="text-[11px] text-sub">지출(내 부담)</div><div className="text-[14px] font-bold text-expense tnum">-{won(expense)}</div></div>
          </div>
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-line last:border-0">
              <div><div className="text-[13px] font-semibold">{t.merchant}</div><div className="text-[11px] text-sub">{t.splits.map((s) => s.category).join(', ')}</div></div>
              <span className={`tnum font-bold text-[13px] ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>{t.type === 'income' ? '+' : '-'}{won(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

const REPEATS: [RepeatKind, string][] = [
  ['none', '반복 안 함'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월'], ['yearly', '매년'],
]
type Scope = 'single' | 'future' | 'all'

function ScheduleModal({
  open, onClose, edit, occDate, date, profileId,
}: {
  open: boolean; onClose: () => void; edit?: Schedule; occDate: string; date: string; profileId: string
}) {
  const [d, setD] = useState(date)
  const [time, setTime] = useState('')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [color, setColor] = useState('violet')
  const [repeat, setRepeat] = useState<RepeatKind>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [scope, setScope] = useState<Scope>('single')

  const isRepeating = !!edit && (edit.repeat ?? 'none') !== 'none'

  useEffect(() => {
    if (!open) return
    setScope('single')
    if (edit) {
      setD(occDate || edit.date); setTime(edit.time ?? ''); setTitle(edit.title); setMemo(edit.memo ?? '')
      setColor(edit.color ?? 'violet'); setRepeat(edit.repeat ?? 'none'); setRepeatUntil(edit.repeatUntil ?? '')
    } else {
      setD(date); setTime(''); setTitle(''); setMemo(''); setColor('violet'); setRepeat('none'); setRepeatUntil('')
    }
  }, [open, edit, date, occDate])

  const base = () => ({
    profileId, source: 'manual' as const, title: title.trim(),
    time: time || undefined, memo: memo.trim() || undefined, color,
  })
  const ru = () => (repeat !== 'none' && repeatUntil ? repeatUntil : undefined)

  async function save() {
    if (!title.trim()) return
    if (!edit) {
      await repo.upsertSchedule({ id: uid(), date: d, repeat, repeatUntil: ru(), ...base() })
    } else if (!isRepeating) {
      await repo.upsertSchedule({ id: edit.id, date: d, repeat, repeatUntil: ru(), ...base() })
    } else if (scope === 'all') {
      await repo.upsertSchedule({ ...edit, ...base(), repeat, repeatUntil: ru() })
    } else if (scope === 'future') {
      await repo.upsertSchedule({ ...edit, repeatUntil: addDays(occDate, -1) })
      await repo.upsertSchedule({ id: uid(), date: occDate, repeat, repeatUntil: ru(), ...base() })
    } else {
      // single: 해당 회차만 예외 처리 + 단일 일정 생성
      await repo.upsertSchedule({ ...edit, exceptions: [...(edit.exceptions ?? []), occDate] })
      await repo.upsertSchedule({ id: uid(), date: occDate, repeat: 'none', ...base() })
    }
    onClose()
  }

  async function del() {
    if (!edit) return
    if (!isRepeating || scope === 'all') {
      await repo.deleteSchedule(edit.id)
    } else if (scope === 'future') {
      await repo.upsertSchedule({ ...edit, repeatUntil: addDays(occDate, -1) })
    } else {
      await repo.upsertSchedule({ ...edit, exceptions: [...(edit.exceptions ?? []), occDate] })
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '일정 수정' : '일정 추가'}>
      {isRepeating && (
        <div className="mb-3">
          <div className="text-[12px] font-semibold text-sub mb-1.5">적용 범위 (반복 일정 · {occDate} 회차)</div>
          <div className="flex gap-1.5">
            {([['single', '이 일정만'], ['future', '이후 전체'], ['all', '전체']] as [Scope, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setScope(v)} className={`flex-1 py-2 rounded-[10px] text-[12px] font-bold border ${scope === v ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {(!isRepeating) ? (
          <Field label="날짜"><input type="date" min="2000-01-01" max="2100-12-31" value={d} onChange={(e) => setD(e.target.value)} className={inputCls} /></Field>
        ) : (
          <Field label="선택한 날짜"><div className={inputCls + ' bg-canvas text-sub'}>{occDate}</div></Field>
        )}
        <Field label="시간 (선택)"><TimeInput value={time} onChange={setTime} /></Field>
      </div>
      <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 카드결제일" className={inputCls} /></Field>

      <Field label="색상">
        <div className="flex gap-2 mt-1">
          {SCH_COLORS.map((c) => (
            <button key={c.key} onClick={() => setColor(c.key)} title={c.label}
              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${color === c.key ? 'border-ink scale-110' : 'border-transparent'}`}
              style={{ background: c.bg }}>
              <i className="w-3.5 h-3.5 rounded-full" style={{ background: c.dot }} />
            </button>
          ))}
        </div>
      </Field>

      {/* 반복 설정: single 회차 편집일 땐 숨김(해당 회차는 단일이 됨) */}
      {!(isRepeating && scope === 'single') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="반복">
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={inputCls}>
              {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {repeat !== 'none' && (
            <Field label="반복 종료일 (선택)"><input type="date" min="2000-01-01" max="2100-12-31" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputCls} /></Field>
          )}
        </div>
      )}

      <Field label="메모 (선택)"><input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} /></Field>

      <div className="flex gap-2 mt-4 items-center">
        {edit && <button onClick={del} className="text-[13px] font-bold text-expense">삭제</button>}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
