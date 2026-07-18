// 구독 캘린더(.ics) 이벤트를 이번 달 범위로 불러와 날짜별로 반환
import { useEffect, useState } from 'react'
import { fetchIcalText, parseICS, expandEvent, type ExtEvent } from '../lib/ical'
import type { CalSub } from '../db/types'

export function useIcalEvents(subs: CalSub[] | undefined, month: string): Record<string, ExtEvent[]> {
  const [map, setMap] = useState<Record<string, ExtEvent[]>>({})
  const key = JSON.stringify((subs ?? []).map((s) => [s.id, s.url, s.color, s.name]))

  useEffect(() => {
    const list = subs ?? []
    if (list.length === 0) { setMap({}); return }
    let cancel = false
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
    ;(async () => {
      const out: Record<string, ExtEvent[]> = {}
      for (const sub of list) {
        const text = await fetchIcalText(sub.url)
        if (!text) continue
        for (const raw of parseICS(text)) {
          for (const occ of expandEvent(raw, start, end)) {
            ;(out[occ.date] ??= []).push({ ...occ, color: sub.color, sub: sub.name })
          }
        }
      }
      if (!cancel) setMap(out)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, month])

  return map
}
