import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Plus, X, Link2, Search } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won, compact, thisMonth, monthLabel, addMonth, addDays, todayISO } from '../lib/format'
import { holidayInfo } from '../lib/holidays'
import { SCH_COLORS, colorOf } from '../lib/colors'
import { useIcalEvents } from '../hooks/useIcalEvents'
import type { ExtEvent } from '../lib/ical'
import { PageHeader, Button, Modal, Field, inputCls, Fab } from '../components/ui'
import TimeInput from '../components/TimeInput'
import { occursOn, isPeriod } from '../lib/schedule'
import type { RepeatKind, Schedule, Transaction, CalSub, Profile } from '../db/types'

// 셀에 그릴 칩 (내부 일정 + 외부 구독 이벤트 공통)
interface Chip { key: string; time?: string; endTime?: string; title: string; bg: string; fg: string; past: boolean; ext: boolean; period?: { leftCap: boolean; rightCap: boolean }; onClick: () => void }
const chipPast = (ds: string, time: string | undefined, nowMs: number) => new Date(`${ds}T${time || '23:59'}:00`).getTime() < nowMs

// 맨 위 고정 대상: 종일 or 기간 (시간이 안 흐르는 일정)
const pinTop = (s: Schedule): boolean => !s.time || isPeriod(s)
// 특정 날짜에서 이 일정이 '지금' 기준 지났는지 (시간 없으면 그날 끝까지 유효)
function isPastSch(s: Schedule, ds: string, nowMs: number): boolean {
  return new Date(`${ds}T${s.time || '23:59'}:00`).getTime() < nowMs
}
// 정렬: 종일·기간 먼저(위 고정) → 시간 일정은 안 지난 것 먼저 → 시간순 → 같은 시간이면 최근 등록순
function schCompare(ds: string, nowMs: number) {
  return (a: Schedule, b: Schedule) => {
    const pa2 = pinTop(a), pb2 = pinTop(b)
    if (pa2 !== pb2) return pa2 ? -1 : 1
    if (!pa2) {
      const pa = isPastSch(a, ds, nowMs), pb = isPastSch(b, ds, nowMs)
      if (pa !== pb) return pa ? 1 : -1
      if (a.time !== b.time) return a.time! < b.time! ? -1 : 1
    }
    return (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id)
  }
}

export default function Calendar() {
  const { profileId, profile } = useProfile()
  const [month, setMonth] = useState(thisMonth())
  const [schModal, setSchModal] = useState(false)
  const [editSch, setEditSch] = useState<Schedule | undefined>()
  const [occDate, setOccDate] = useState('')
  const [presetDate, setPresetDate] = useState('')
  const [dayModal, setDayModal] = useState<string | null>(null)
  const [subsModal, setSubsModal] = useState(false)
  const [search, setSearch] = useState('')
  const extEvents = useIcalEvents(profile?.calSubs, month)

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
  const today = todayISO()
  const nowMs = Date.now()
  const schedulesOn = (ds: string) => schedules.filter((s) => occursOn(s, ds)).sort(schCompare(ds, nowMs))
  const searchResults = search.trim()
    ? schedules.filter((s) => `${s.title} ${s.memo ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30)
    : []

  // 내부 일정 + 외부 구독 이벤트를 한 목록으로 (안 지난 것 먼저 → 시간순)
  const buildChips = (ds: string): Chip[] => {
    const chips: Chip[] = []
    const dow = new Date(ds + 'T00:00').getDay()
    for (const s of schedulesOn(ds)) {
      const c = colorOf(s.color)
      if (isPeriod(s)) {
        const isStart = ds === s.date, isEnd = ds === s.endDate
        chips.push({
          key: 's' + s.id, title: s.title, bg: c.bg, fg: c.fg, ext: false, onClick: () => openEdit(s, s.date),
          past: (s.endDate ?? '') < today,
          period: { leftCap: isStart || dow === 0, rightCap: isEnd || dow === 6 },
          time: isStart ? s.time : undefined,
          endTime: isEnd ? s.endTime : undefined,
        })
      } else {
        chips.push({ key: 's' + s.id, time: s.time, title: s.title, bg: c.bg, fg: c.fg, past: isPastSch(s, ds, nowMs), ext: false, onClick: () => openEdit(s, ds) })
      }
    }
    for (const e of extEvents[ds] ?? []) {
      const c = colorOf(e.color)
      chips.push({ key: 'e' + e.title + (e.time ?? ''), time: e.time, title: e.title, bg: c.bg, fg: c.fg, past: chipPast(ds, e.time, nowMs), ext: true, onClick: () => setDayModal(ds) })
    }
    return chips.sort((a, b) => {
      const pa = !!a.period || !a.time, pb = !!b.period || !b.time // 종일·기간 위로
      if (pa !== pb) return pa ? -1 : 1
      if (!pa) {
        if (a.past !== b.past) return a.past ? 1 : -1
        if (a.time !== b.time) return a.time! < b.time! ? -1 : 1
      }
      return 0
    })
  }

  function openAdd(ds: string) { setEditSch(undefined); setOccDate(''); setPresetDate(ds); setSchModal(true) }
  function openEdit(s: Schedule, occ: string) { setEditSch(s); setOccDate(occ); setSchModal(true) }

  // 주 단위 + 기간(여러 날) 일정을 '칸 위에 뜨는 하나의 막대'로 배치 (칸 배경에 안 가려지게 오버레이)
  const LANE_H = 15, BAR_TOP = 22
  const periodScheds = schedules.filter(isPeriod)
  const weeks: { wk: (number | null)[]; bars: { s: Schedule; startCol: number; endCol: number; isStart: boolean; isEnd: boolean; lane: number }[]; laneCount: number }[] = []
  for (let w = 0; w < cells.length; w += 7) {
    const wk = cells.slice(w, w + 7)
    const colDate = wk.map((d) => (d ? dateStr(d) : null))
    const bars: { s: Schedule; startCol: number; endCol: number; isStart: boolean; isEnd: boolean; lane: number }[] = []
    for (const s of periodScheds) {
      const cols = colDate.map((cd, c) => (cd && cd >= s.date && cd <= s.endDate! ? c : -1)).filter((c) => c >= 0)
      if (!cols.length) continue
      const startCol = cols[0], endCol = cols[cols.length - 1]
      bars.push({ s, startCol, endCol, isStart: colDate[startCol] === s.date, isEnd: colDate[endCol] === s.endDate, lane: 0 })
    }
    bars.sort((a, b) => a.startCol - b.startCol || a.s.date.localeCompare(b.s.date))
    const laneEnd: number[] = []
    for (const bar of bars) {
      let lane = 0
      while (lane < laneEnd.length && laneEnd[lane] >= bar.startCol) lane++
      laneEnd[lane] = bar.endCol
      bar.lane = lane
    }
    weeks.push({ wk, bars, laneCount: laneEnd.length })
  }

  return (
    <div>
      <PageHeader title="캘린더" />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setMonth(addMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronLeft size={18} /></button>
        <span className="font-bold text-[15px] w-[110px] text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(addMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-line/60 text-sub"><ChevronRight size={18} /></button>
        <button onClick={() => setMonth(thisMonth())} className="ml-1 text-[12px] text-sub border border-line rounded-lg px-2.5 py-1 hover:bg-canvas">오늘</button>
        <div className="flex-1" />
        <button onClick={() => setSubsModal(true)} className="text-[12px] text-sub border border-line rounded-lg px-2.5 py-1 hover:bg-canvas flex items-center gap-1"><Link2 size={13} />구독{profile?.calSubs?.length ? ` ${profile.calSubs.length}` : ''}</button>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="일정 검색 (제목·메모)" className={inputCls + ' pl-9'} />
        {search.trim() && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-line rounded-[10px] shadow-lg max-h-72 overflow-auto">
            {searchResults.length === 0 ? (
              <div className="px-3 py-2.5 text-[12.5px] text-sub">결과 없어요.</div>
            ) : searchResults.map((s) => {
              const c = colorOf(s.color)
              return (
                <button key={s.id} onClick={() => { setMonth(s.date.slice(0, 7)); setSearch('') }} className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-canvas border-b border-line last:border-0">
                  <i className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />
                  <span className="text-[11px] tnum text-sub shrink-0 w-[76px]">{s.date.slice(2)} {s.time || '종일'}</span>
                  <span className="text-[13px] font-semibold truncate flex-1">{s.title}</span>
                  {s.repeat && s.repeat !== 'none' && <span className="text-[10px] text-sub shrink-0">🔁</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-surface border border-line rounded-[12px] p-3">
        <div className="grid grid-cols-7 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`text-center text-[12px] py-1 ${i === 0 ? 'text-expense' : i === 6 ? 'text-income' : 'text-sub'}`}>{d}</div>
          ))}
        </div>
        <div className="rounded-lg overflow-hidden border-t border-l border-line">
          {weeks.map((wkData, w) => (
            <div key={w} className="relative">
              {wkData.bars.map((bar) => {
                const c = colorOf(bar.s.color)
                const past = (bar.s.endDate ?? '') < today
                return (
                  <div key={bar.s.id} className="absolute z-10" style={{ left: `${(bar.startCol / 7) * 100}%`, width: `${((bar.endCol - bar.startCol + 1) / 7) * 100}%`, top: BAR_TOP + bar.lane * LANE_H }}>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(bar.s, bar.s.date) }}
                      className={`w-[calc(100%-2px)] mx-px text-left text-[10px] font-semibold px-1.5 py-0.5 truncate flex items-center gap-1 ${bar.isStart ? 'rounded-l-md' : ''} ${bar.isEnd ? 'rounded-r-md' : ''} ${past ? 'opacity-45' : ''}`}
                      style={{ background: c.bg, color: c.fg }}>
                      {bar.isStart && bar.s.time && <span className="tnum opacity-80 shrink-0">{bar.s.time}</span>}
                      <span className="truncate flex-1">{bar.isStart ? bar.s.title : ''}</span>
                      {bar.isEnd && bar.s.endTime && <span className="tnum opacity-80 shrink-0">~{bar.s.endTime}</span>}
                    </button>
                  </div>
                )
              })}
              <div className="grid grid-cols-7">
                {wkData.wk.map((d, ci) => {
                  const i = w * 7 + ci
                  const ds = d ? dateStr(d) : ''
                  const info = d ? byDay[ds] : undefined
                  const hol = d ? holidayInfo(ds) : undefined
                  const isRed = ci === 0 || !!hol?.off
                  const isToday = ds === today
                  const numColor = isToday ? 'text-white' : isRed ? 'text-expense' : ci === 6 ? 'text-income' : 'text-sub'
                  const chips = d ? buildChips(ds).filter((ch) => !ch.period) : []
                  const shown = chips.slice(0, 3)
                  const moreCount = chips.length - shown.length
                  return (
                    <div key={i} onClick={() => d && openAdd(ds)} className={`relative min-h-[104px] p-1.5 pb-5 border-r border-b border-line ${d ? 'cursor-pointer hover:bg-canvas' : 'bg-canvas'} ${isToday ? 'bg-mint-l' : 'bg-surface'}`}>
                      {d && (
                        <>
                          <div className="flex items-center justify-between gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setDayModal(ds) }} title="이 날 모아보기" className={`text-[12px] font-semibold shrink-0 ${numColor} ${isToday ? 'bg-mint rounded-full w-[19px] h-[19px] inline-flex items-center justify-center' : 'hover:bg-line/60 rounded px-1 -mx-1'}`}>{d}</button>
                            {hol && <span className={`text-[9px] font-semibold truncate ${hol.off ? 'text-expense' : 'text-sub'}`}>{hol.name}</span>}
                          </div>
                          {wkData.laneCount > 0 && <div style={{ height: wkData.laneCount * LANE_H }} />}
                          <div className="mt-1 space-y-0.5">
                            {shown.map((ch) => (
                              <button key={ch.key} onClick={(e) => { e.stopPropagation(); ch.onClick() }}
                                className={`w-full text-left text-[10px] font-semibold px-1 py-0.5 rounded truncate flex items-center gap-1 ${ch.past ? 'opacity-40 line-through' : ''}`}
                                style={{ background: ch.bg, color: ch.fg }}>
                                {ch.time ? <span className="tnum opacity-80 shrink-0">{ch.time}</span> : <span className="shrink-0 text-[8.5px] font-bold opacity-70 border border-current rounded px-0.5">종일</span>}
                                <span className="truncate">{ch.title}</span>
                                {ch.ext && <span className="shrink-0 opacity-70" title="구독 일정">🔗</span>}
                              </button>
                            ))}
                            {moreCount > 0 && (
                              <button onClick={(e) => { e.stopPropagation(); setDayModal(ds) }} className="text-[9.5px] text-mint-d font-bold pl-1 hover:underline">+{moreCount}개 더 보기</button>
                            )}
                          </div>
                          {(info?.expense || info?.income) ? (
                            <button onClick={(e) => { e.stopPropagation(); setDayModal(ds) }} className="absolute bottom-1 right-1.5 left-1.5 flex items-center justify-end gap-1.5 text-[10px] font-bold tnum">
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
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-[12px] text-sub flex-wrap">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-expense inline-block" />지출</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-income inline-block" />수입</span>
        </div>
      </div>

      <Fab onClick={() => openAdd(`${month}-01`)} label="일정 추가" />
      <ScheduleModal open={schModal} onClose={() => setSchModal(false)} edit={editSch} occDate={occDate} date={presetDate} profileId={profileId} />
      <DayModal
        date={dayModal}
        schedules={dayModal ? schedulesOn(dayModal) : []}
        ext={dayModal ? (extEvents[dayModal] ?? []) : []}
        txs={txs}
        nowMs={nowMs}
        onClose={() => setDayModal(null)}
        onEdit={(s) => { const dd = dayModal!; setDayModal(null); openEdit(s, dd) }}
        onAdd={() => { const dd = dayModal!; setDayModal(null); openAdd(dd) }}
      />
      <SubsModal open={subsModal} onClose={() => setSubsModal(false)} profile={profile} />
    </div>
  )
}

function DayModal({
  date, schedules, ext, txs, nowMs, onClose, onEdit, onAdd,
}: {
  date: string | null; schedules: Schedule[]; ext: ExtEvent[]; txs: Transaction[]; nowMs: number
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
          const past = isPastSch(s, date, nowMs)
          return (
            <button key={s.id} onClick={() => onEdit(s)} className={`w-full text-left flex items-center gap-2 py-2 border-b border-line last:border-0 hover:bg-canvas -mx-2 px-2 rounded-lg ${past ? 'opacity-45' : ''}`}>
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.dot }} />
              {s.time ? <span className="text-[12px] tnum text-sub shrink-0">{s.time}{s.endTime ? `~${s.endTime}` : ''}</span> : <span className="text-[10px] font-bold text-sub border border-line rounded px-1 shrink-0">종일</span>}
              <span className={`text-[13.5px] font-semibold flex-1 ${past ? 'line-through decoration-1' : ''}`}>{s.title}{s.endDate ? <span className="text-[11px] font-normal text-sub"> · {s.date.slice(5)}~{s.endDate.slice(5)}</span> : ''}</span>
              {s.memo && <span title="메모">📝</span>}
              {s.repeat && s.repeat !== 'none' && <span title="반복">🔁</span>}
            </button>
          )
        })
      )}

      {ext.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-sub mb-1">🔗 구독 일정</div>
          {ext.map((e, i) => {
            const c = colorOf(e.color)
            const past = chipPast(date, e.time, nowMs)
            return (
              <div key={i} className={`flex items-center gap-2 py-1.5 ${past ? 'opacity-45' : ''}`}>
                <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.dot }} />
                {e.time && <span className="text-[12px] tnum text-sub">{e.time}</span>}
                <span className={`text-[13px] flex-1 ${past ? 'line-through decoration-1' : ''}`}>{e.title}</span>
                {e.sub && <span className="text-[10px] text-sub shrink-0">{e.sub}</span>}
              </div>
            )
          })}
        </div>
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
  const [endDate, setEndDate] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [color, setColor] = useState('violet')
  const [repeat, setRepeat] = useState<RepeatKind>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [scope, setScope] = useState<Scope>('single')

  const isRepeating = !!edit && (edit.repeat ?? 'none') !== 'none'

  useEffect(() => {
    if (!open) return
    setScope('single')
    if (edit) {
      setD(occDate || edit.date); setEndDate(edit.endDate ?? ''); setAllDay(!edit.time && !edit.endTime); setTime(edit.time ?? ''); setEndTime(edit.endTime ?? ''); setTitle(edit.title); setMemo(edit.memo ?? '')
      setColor(edit.color ?? 'violet'); setRepeat(edit.repeat ?? 'none'); setRepeatUntil(edit.repeatUntil ?? ''); setWeekdays(edit.weekdays ?? [])
    } else {
      setD(date); setEndDate(''); setAllDay(false); setTime(''); setEndTime(''); setTitle(''); setMemo(''); setColor('violet'); setRepeat('none'); setRepeatUntil(''); setWeekdays([])
    }
  }, [open, edit, date, occDate])

  const period = repeat === 'none' && endDate && endDate > d
  const base = () => ({
    profileId, source: 'manual' as const, title: title.trim(),
    time: allDay ? undefined : (time || undefined),
    endTime: !allDay && period ? (endTime || undefined) : undefined,
    memo: memo.trim() || undefined, color,
    weekdays: repeat === 'weekly' && weekdays.length ? weekdays : undefined,
    endDate: period ? endDate : undefined,
  })
  const ru = () => (repeat !== 'none' && repeatUntil ? repeatUntil : undefined)

  async function save() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    if (!edit) {
      await repo.upsertSchedule({ id: uid(), date: d, repeat, repeatUntil: ru(), createdAt: now, ...base() })
    } else if (!isRepeating) {
      await repo.upsertSchedule({ id: edit.id, date: d, repeat, repeatUntil: ru(), createdAt: edit.createdAt ?? now, ...base() })
    } else if (scope === 'all') {
      await repo.upsertSchedule({ ...edit, ...base(), repeat, repeatUntil: ru() })
    } else if (scope === 'future') {
      await repo.upsertSchedule({ ...edit, repeatUntil: addDays(occDate, -1) })
      // 새 시리즈는 기존의 '이 회차만' 예외(occDate 이후)를 이어받아 중복 생성 방지
      await repo.upsertSchedule({ id: uid(), date: occDate, repeat, repeatUntil: ru(), exceptions: (edit.exceptions ?? []).filter((e) => e >= occDate), createdAt: now, ...base() })
    } else {
      // single: 해당 회차만 예외 처리 + 단일 일정 생성
      await repo.upsertSchedule({ ...edit, exceptions: [...(edit.exceptions ?? []), occDate] })
      await repo.upsertSchedule({ id: uid(), date: occDate, repeat: 'none', createdAt: now, ...base() })
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
          <Field label={period ? '시작일' : '날짜'}><input type="date" min="2000-01-01" max="2100-12-31" value={d} onChange={(e) => setD(e.target.value)} className={inputCls} /></Field>
        ) : (
          <Field label="선택한 날짜"><div className={inputCls + ' bg-canvas text-sub'}>{occDate}</div></Field>
        )}
        {!isRepeating && (
          <Field label="종료일"><input type="date" min={d} max="2100-12-31" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></Field>
        )}
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-sub -mt-1 mb-2 cursor-pointer">
        <input type="checkbox" checked={allDay} onChange={(e) => { setAllDay(e.target.checked); if (e.target.checked) { setTime(''); setEndTime('') } }} /> 종일
      </label>
      {!allDay && (
        period ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 시간 (선택)"><TimeInput value={time} onChange={setTime} /></Field>
            <Field label="종료 시간 (선택)"><TimeInput value={endTime} onChange={setEndTime} /></Field>
          </div>
        ) : (
          <Field label="시간 (선택)"><TimeInput value={time} onChange={setTime} /></Field>
        )
      )}
      <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 카드결제일 / 제주 여행" className={inputCls} /></Field>

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
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="반복">
              <select value={repeat} onChange={(e) => { const v = e.target.value as RepeatKind; setRepeat(v); if (v === 'weekly' && weekdays.length === 0) setWeekdays([new Date(d + 'T00:00').getDay()]) }} className={inputCls}>
                {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            {repeat !== 'none' && (
              <Field label="반복 종료일 (선택)"><input type="date" min="2000-01-01" max="2100-12-31" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputCls} /></Field>
            )}
          </div>
          {repeat === 'weekly' && (
            <Field label="반복 요일 (여러 개 선택)">
              <div className="flex gap-1">
                {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => {
                  const on = weekdays.includes(i)
                  return (
                    <button key={i} onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== i) : [...weekdays, i].sort((a, b) => a - b))}
                      className={`flex-1 py-1.5 rounded-md text-[12px] font-bold border ${on ? 'bg-mint text-white border-mint' : 'bg-surface text-sub border-line'}`}>{w}</button>
                  )
                })}
              </div>
            </Field>
          )}
        </>
      )}

      <Field label="메모 (선택)"><input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} /></Field>

      <div className="flex gap-2 mt-4 items-center">
        {edit && <button onClick={del} className="text-[13px] font-bold text-expense">삭제</button>}
        <div className="flex-1" />
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}

function SubsModal({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: Profile }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState(SCH_COLORS[0].key)
  const subs = profile?.calSubs ?? []

  async function add() {
    if (!profile || !name.trim() || !url.trim()) return
    const sub: CalSub = { id: uid(), name: name.trim(), url: url.trim(), color }
    await repo.upsertProfile({ ...profile, calSubs: [...subs, sub] })
    setName(''); setUrl(''); setColor(SCH_COLORS[0].key)
  }
  async function remove(id: string) {
    if (!profile) return
    await repo.upsertProfile({ ...profile, calSubs: subs.filter((s) => s.id !== id) })
  }

  return (
    <Modal open={open} onClose={onClose} title="구독 캘린더 (.ics)">
      <div className="text-[12px] text-sub mb-3 leading-relaxed">
        구글·카카오 등 캘린더의 <b>.ics 주소(iCal 형식)</b>를 붙여넣으면 일정을 읽어와요. (읽기 전용 · 내 일정과 함께 표시) <b>여러 개 등록할 수 있어요.</b>
      </div>

      <div className="text-[12px] font-bold text-sub mb-1.5">구독 중 {subs.length}개</div>
      {subs.length === 0 ? (
        <div className="text-[12px] text-sub bg-canvas rounded-lg px-3 py-2.5 mb-3">아직 없어요. 아래에서 추가하세요.</div>
      ) : (
        <div className="mb-3 space-y-1.5">
          {subs.map((s) => {
            const c = colorOf(s.color)
            return (
              <div key={s.id} className="flex items-center gap-2 bg-canvas rounded-lg px-2.5 py-2">
                <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.dot }} />
                <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{s.name}</div><div className="text-[10.5px] text-sub truncate">{s.url}</div></div>
                <button onClick={() => remove(s.id)} className="text-sub hover:text-expense p-1 shrink-0" title="삭제"><X size={15} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="border-t border-line pt-3 mt-1">
        <div className="text-[12px] font-bold text-mint-d mb-1.5">＋ 새 캘린더 추가</div>
        <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 구글 캘린더" className={inputCls} /></Field>
        <Field label=".ics 주소"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…ics 또는 webcal://…" className={inputCls} /></Field>
        <Field label="색상">
          <div className="flex gap-2 mt-1">
            {SCH_COLORS.map((c) => (
              <button key={c.key} onClick={() => setColor(c.key)} title={c.label} className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${color === c.key ? 'border-ink scale-110' : 'border-transparent'}`} style={{ background: c.bg }}>
                <i className="w-3.5 h-3.5 rounded-full" style={{ background: c.dot }} />
              </button>
            ))}
          </div>
        </Field>
        <Button onClick={add} className="w-full mt-2">이 캘린더 추가</Button>
      </div>

    </Modal>
  )
}
