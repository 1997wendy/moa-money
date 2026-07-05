// 페이지 진입 시 코인 시세를 CoinGecko에서 받아와 평가액 갱신 (ticker에 coingecko id 저장)
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { getCoinPricesKRW } from '../lib/coinApi'

export function useCoinSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const coins = assets.filter((a) => a.type === 'coin' && a.quantity && a.ticker)
      if (coins.length === 0) return
      const prices = await getCoinPricesKRW(coins.map((a) => a.ticker!))
      for (const a of coins) {
        const p = prices[a.ticker!.toLowerCase()]
        if (p) await repo.upsertAsset({ ...a, unitPrice: p, amount: Math.round(a.quantity! * p), updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
