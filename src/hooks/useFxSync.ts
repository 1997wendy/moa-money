// 진입 시 외화 자산의 환율을 최신으로 보정 (예전에 0/미설정으로 저장된 것도 자동 복구)
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { fetchFxRate } from '../lib/fx'

export function useFxSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const foreign = assets.filter((a) => a.currency && a.currency !== 'KRW')
      if (foreign.length === 0) return
      const codes = Array.from(new Set(foreign.map((a) => a.currency!)))
      const rates: Record<string, number> = {}
      for (const c of codes) { const r = await fetchFxRate(c); if (r) rates[c] = r }
      for (const a of foreign) {
        const r = rates[a.currency!]
        if (r && r !== a.fxRate) await repo.upsertAsset({ ...a, fxRate: r, updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
