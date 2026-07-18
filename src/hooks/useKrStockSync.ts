// 국내주식/ETF 실시간 시세 자동 반영 — kr-stock Edge Function(KIS)
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { getKrStockPrices } from '../lib/krStock'

export function useKrStockSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const kr = assets.filter((a) => (a.type === 'stock' || a.type === 'etf') && a.market === 'kr' && a.quantity && a.ticker)
      if (kr.length === 0) return
      const { prices } = await getKrStockPrices(kr.map((a) => a.ticker!))
      for (const a of kr) {
        const p = prices[a.ticker!]
        if (p) await repo.upsertAsset({ ...a, unitPrice: p, amount: Math.round(a.quantity! * p), updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
