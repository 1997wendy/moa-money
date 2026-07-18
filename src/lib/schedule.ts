// 일정 반복/기간 계산 (캘린더·대시보드 공용)
import type { Schedule } from '../db/types'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 기간(여러 날) 일정 여부 */
export const isPeriod = (s: Schedule): boolean => !!s.endDate && s.endDate > s.date

/** 반복 규칙 + 예외 + 기간을 고려해 해당 날짜에 일정이 뜨는지 */
export function occursOn(s: Schedule, dateStr: string): boolean {
  if (dateStr < s.date) return false
  if (s.repeatUntil && dateStr > s.repeatUntil) return false
  if (s.exceptions?.includes(dateStr)) return false
  const rep = s.repeat ?? 'none'
  if (rep === 'none') return s.endDate ? dateStr >= s.date && dateStr <= s.endDate : dateStr === s.date
  const d = new Date(dateStr + 'T00:00')
  const start = new Date(s.date + 'T00:00')
  if (rep === 'daily') return true
  if (rep === 'weekly') return s.weekdays?.length ? s.weekdays.includes(d.getDay()) : d.getDay() === start.getDay()
  if (rep === 'monthly') return d.getDate() === start.getDate()
  if (rep === 'yearly') return d.getMonth() === start.getMonth() && d.getDate() === start.getDate()
  return false
}

export interface Upcoming { s: Schedule; date: string; ongoing: boolean }

/** 오늘(fromISO)부터 days일 안의 '다가오는' 일정 — 일정별 가장 가까운 1건 + 진행 중 기간일정 */
export function upcomingList(schedules: Schedule[], fromISO: string, days: number, limit: number): Upcoming[] {
  const byId = new Map<string, Upcoming>()
  // 진행 중인 기간 일정(오늘이 시작~종료 사이) 먼저
  for (const s of schedules) {
    if (isPeriod(s) && s.date <= fromISO && (s.endDate ?? '') >= fromISO) byId.set(s.id, { s, date: fromISO, ongoing: true })
  }
  const base = new Date(fromISO + 'T00:00')
  for (let i = 0; i < days; i++) {
    const dt = new Date(base); dt.setDate(base.getDate() + i)
    const ds = iso(dt)
    for (const s of schedules) {
      if (byId.has(s.id)) continue // 이미 더 가까운 회차 있음
      if (occursOn(s, ds)) byId.set(s.id, { s, date: ds, ongoing: false })
    }
  }
  return [...byId.values()]
    .sort((a, b) =>
      a.ongoing !== b.ongoing ? (a.ongoing ? -1 : 1)
        : a.date !== b.date ? (a.date < b.date ? -1 : 1)
          : (a.s.time ?? '') < (b.s.time ?? '') ? -1 : 1)
    .slice(0, limit)
}
