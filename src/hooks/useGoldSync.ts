// 금(gold) 실시간 시세 자동 반영 — 원/g × 보유 그램수 = 평가금액
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { getGoldKrwPerGram } from '../lib/goldPrice'

export function useGoldSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const golds = assets.filter((a) => a.type === 'gold' && a.quantity)
      if (golds.length === 0) return
      const price = await getGoldKrwPerGram()
      if (!price) return
      for (const a of golds) {
        await repo.upsertAsset({ ...a, unitPrice: price, amount: Math.round(a.quantity! * price), updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
