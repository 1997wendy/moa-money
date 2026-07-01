// 페이지 진입 시 코인 시세를 업비트에서 자동으로 받아와 평가액 갱신 (버튼 불필요)
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { fetchUpbitPricesKRW } from '../lib/upbit'

export function useCoinSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const coins = assets.filter((a) => a.type === 'coin' && a.quantity && a.ticker)
      if (coins.length === 0) return
      try {
        const prices = await fetchUpbitPricesKRW(coins.map((a) => a.ticker!))
        for (const a of coins) {
          const p = prices[a.ticker!.toUpperCase()]
          if (p) await repo.upsertAsset({ ...a, unitPrice: p, amount: Math.round(a.quantity! * p), updatedAt: new Date().toISOString() })
        }
      } catch {
        // 네트워크 실패 시 기존 값 유지
      }
    })()
  }, [profileId])
}
