// 순자산 스냅샷 자동 기록 — 앱을 켜기만 하면(대시보드/통계를 열지 않아도) 이 달 순자산이 기록됨
import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { krwValue } from '../lib/assets'
import { thisMonth } from '../lib/format'

export function useNetWorthSnapshot() {
  const { profileId, profile } = useProfile()
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId]) // undefined=로딩중
  const recorded = useRef('')
  useEffect(() => {
    if (!profile || assets === undefined) return
    const month = thisMonth()
    const total = assets.reduce((s, a) => s + krwValue(a), 0)
    const key = `${profile.id}:${month}:${total}`
    if (recorded.current === key) return
    recorded.current = key
    if (profile.netWorthHistory?.[month] === total) return
    repo.upsertProfile({ ...profile, netWorthHistory: { ...(profile.netWorthHistory ?? {}), [month]: total } })
  }, [profile, assets])
}
