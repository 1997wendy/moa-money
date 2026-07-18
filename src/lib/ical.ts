// 외부 캘린더(.ics) 파싱 — Edge Function 'ical' 로 원문 받아 이벤트로 변환
// 지원: 단일 일정 + 기본 반복(RRULE FREQ=DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL/UNTIL/COUNT).
// (BYDAY 다중요일·복잡 규칙은 v1 미지원 — 시작 요일 기준 반복)
import { supabase } from './supabase'

export interface ExtEvent { date: string; time?: string; title: string; color?: string; sub?: string }

export async function fetchIcalText(url: string): Promise<string | null> {
  try {
    const norm = url.trim().replace(/^webcal:\/\//i, 'https://')
    const { data, error } = await supabase.functions.invoke('ical', { body: { url: norm } })
    const text = (data as { ics?: string } | null)?.ics
    return !error && text ? text : null
  } catch { return null }
}

interface Rrule { freq: string; interval: number; until?: string; count?: number }
interface RawEvent { y: number; mo: number; d: number; time?: string; title: string; rrule?: Rrule }

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

function parseDt(val: string): { y: number; mo: number; d: number; time?: string } | null {
  const m = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], time: m[4] != null ? `${m[4]}:${m[5]}` : undefined }
}

export function parseICS(text: string): RawEvent[] {
  const lines = unfold(text)
  const events: RawEvent[] = []
  let cur: (Partial<RawEvent> & { _dt?: { y: number; mo: number; d: number; time?: string } }) | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.title && cur._dt) events.push({ y: cur._dt.y, mo: cur._dt.mo, d: cur._dt.d, time: cur._dt.time, title: cur.title, rrule: cur.rrule })
      cur = null; continue
    }
    if (!cur) continue
    const ci = line.indexOf(':')
    if (ci < 0) continue
    const name = line.slice(0, ci).split(';')[0]
    const val = line.slice(ci + 1)
    if (name === 'DTSTART') { const dt = parseDt(val); if (dt) cur._dt = dt }
    else if (name === 'SUMMARY') cur.title = val.replace(/\\,/g, ',').replace(/\\n/gi, ' ').trim()
    else if (name === 'RRULE') {
      const p = Object.fromEntries(val.split(';').map((x) => x.split('=')))
      cur.rrule = { freq: p.FREQ, interval: p.INTERVAL ? +p.INTERVAL : 1, until: p.UNTIL ? p.UNTIL.slice(0, 8) : undefined, count: p.COUNT ? +p.COUNT : undefined }
    }
  }
  return events
}

const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** 범위 [start,end] (yyyy-mm-dd) 안의 발생일로 확장 */
export function expandEvent(ev: RawEvent, start: string, end: string): ExtEvent[] {
  const out: ExtEvent[] = []
  const emit = (dt: Date) => {
    const ds = iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
    if (ds >= start && ds <= end) out.push({ date: ds, time: ev.time, title: ev.title })
  }
  const base = new Date(ev.y, ev.mo - 1, ev.d)
  if (!ev.rrule) { emit(base); return out }
  const r = ev.rrule
  const untilDs = r.until ? `${r.until.slice(0, 4)}-${r.until.slice(4, 6)}-${r.until.slice(6, 8)}` : end
  const stopDs = untilDs < end ? untilDs : end
  const cur = new Date(base)
  let cnt = 0, guard = 0
  while (guard++ < 1500) {
    const ds = iso(cur.getFullYear(), cur.getMonth() + 1, cur.getDate())
    if (ds > stopDs) break
    if (r.count != null && cnt >= r.count) break
    emit(cur)
    cnt++
    if (r.freq === 'DAILY') cur.setDate(cur.getDate() + r.interval)
    else if (r.freq === 'WEEKLY') cur.setDate(cur.getDate() + 7 * r.interval)
    else if (r.freq === 'MONTHLY') cur.setMonth(cur.getMonth() + r.interval)
    else if (r.freq === 'YEARLY') cur.setFullYear(cur.getFullYear() + r.interval)
    else break
  }
  return out
}
