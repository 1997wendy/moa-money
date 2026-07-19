// 계좌형(IRP·연금저축펀드) 안 개별 종목 시세 자동 반영
//  각 holding(ticker+quantity)의 현재가를 불러와 value=수량×현재가, 자산 amount 재계산
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { getKrStockPrices } from '../lib/krStock'
import { getCoinPriceKRW } from '../lib/coinApi'

export function useHoldingSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const targets = assets.filter((a) => a.holdings?.some((h) => h.ticker && h.quantity))
      if (targets.length === 0) return
      for (const a of targets) {
        const hs = a.holdings!
        const krCodes = hs.filter((h) => h.live === 'stock' && h.ticker && h.quantity).map((h) => h.ticker!)
        const coinIds = hs.filter((h) => h.live === 'coin' && h.ticker && h.quantity).map((h) => h.ticker!)
        const krPrices = krCodes.length ? (await getKrStockPrices(krCodes)).prices : {}
        const coinPrices: Record<string, number> = {}
        for (const id of coinIds) { const p = await getCoinPriceKRW(id); if (p) coinPrices[id] = p }
        let changed = false
        const holdings = hs.map((h) => {
          if (!h.ticker || !h.quantity) return h
          const price = h.live === 'coin' ? coinPrices[h.ticker] : krPrices[h.ticker]
          if (!price) return h
          const value = Math.floor(h.quantity * price)
          if (price === h.unitPrice && value === h.value) return h
          changed = true
          return { ...h, unitPrice: price, value }
        })
        if (!changed) continue
        const amount = holdings.reduce((s, h) => s + (h.value || 0), 0) + (a.cash || 0)
        await repo.upsertAsset({ ...a, holdings, amount, updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
