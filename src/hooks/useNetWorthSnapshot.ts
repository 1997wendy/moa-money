// 순자산 스냅샷 자동 기록 — 앱을 켜기만 하면(대시보드/통계를 열지 않아도) 이 달 순자산이 기록됨
import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { krwValue, repayableTotal } from '../lib/assets'
import { thisMonth } from '../lib/format'

export function useNetWorthSnapshot() {
  const { profileId, profile } = useProfile()
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId]) // undefined=로딩중
  const supports = useLiveQuery(() => (profileId ? repo.listSupports(profileId) : []), [profileId], [])
  const recorded = useRef('')
  useEffect(() => {
    if (!profile || assets === undefined) return
    const month = thisMonth()
    // 순자산 추이는 '내 돈만'(받은 돈 중 돌려줄 돈 제외) 기준
    const netWorth = assets.reduce((s, a) => s + krwValue(a), 0) - repayableTotal(supports)
    // 자산 구성이 바뀌면(개수·평가액 변화) 다시 기록되도록 키에 개수도 포함
    const key = `${profile.id}:${month}:${netWorth}:${assets.length}`
    if (recorded.current === key) return
    recorded.current = key
    // ① 순자산 추이(숫자) — 대시보드/통계 그래프용
    if (profile.netWorthHistory?.[month] !== netWorth) {
      repo.upsertProfile({ ...profile, netWorthHistory: { ...(profile.netWorthHistory ?? {}), [month]: netWorth } })
    }
    // ② 이 달 상세 스냅샷 — 그 달 '마지막 접속 시점'의 자산 구성을 통째로 얼려 저장(과거 회고용).
    //    같은 달에 다시 접속하면 최신 상태로 덮어씀 → 그 달 마지막 모습이 남음.
    repo.upsertAssetSnapshot({
      id: `${profile.id}::${month}`,
      profileId: profile.id,
      month,
      netWorth,
      assets: assets.map((a) => ({ ...a })), // 값 고정(얕은 복사)
      supports: supports.map((s) => ({ ...s })),
      updatedAt: new Date().toISOString(),
    })
  }, [profile, assets, supports])
}
