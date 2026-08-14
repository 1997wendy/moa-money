// 관심지역 청약 일정을 캘린더용 이벤트로 변환 (구독 캘린더와 같은 형태로 반환 → 캘린더에 그대로 합쳐진다)
import { useEffect, useState } from 'react'
import { fetchApplyHome, calcItem, DEFAULT_REGIONS } from '../lib/applyHome'
import type { ExtEvent } from '../lib/ical'

/**
 * @param regions 관심지역 (없으면 기본값)
 * @param month   'YYYY-MM'
 * @param enabled 청약 메뉴를 숨긴 프로필에서는 호출하지 않기 위한 스위치
 */
export function useApplyEvents(regions: string[] | undefined, month: string, enabled = true): Record<string, ExtEvent[]> {
  const [map, setMap] = useState<Record<string, ExtEvent[]>>({})
  const list = regions ?? DEFAULT_REGIONS
  const key = list.join(',')

  useEffect(() => {
    if (!enabled || list.length === 0) { setMap({}); return }
    let cancel = false
    ;(async () => {
      const d = await fetchApplyHome(list)
      if (cancel || !d) { if (!cancel) setMap({}); return }
      const out: Record<string, ExtEvent[]> = {}
      const push = (date: string | null, title: string, color: string) => {
        if (!date || date.slice(0, 7) !== month) return
        ;(out[date] ??= []).push({ date, title, color, sub: '청약' })
      }
      for (const it of d.items) {
        const { lotteryTotal } = calcItem(it)
        // 추첨 물량을 제목에 넣어, 캘린더에서 바로 노려볼 만한지 보이게 한다
        const tag = lotteryTotal > 0 ? ` (추첨 ${lotteryTotal})` : ''
        push(it.rceptBgn, `청약접수 ${it.name}${tag}`, 'amber')
        if (it.rceptEnd && it.rceptEnd !== it.rceptBgn) push(it.rceptEnd, `접수마감 ${it.name}`, 'amber')
        push(it.winnerDate, `당첨발표 ${it.name}`, 'blue')
      }
      if (!cancel) setMap(out)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, month, enabled])

  return map
}
