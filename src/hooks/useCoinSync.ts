// 페이지 진입 시 코인 시세를 CoinGecko에서 받아와 평가액 갱신 (ticker에 coingecko id 저장)
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { getCoinPricesKRW, COIN_DUST } from '../lib/coinApi'

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
      if (prices === null) return // 네트워크 실패 → 기존 값 유지
      for (const a of coins) {
        const raw = prices[a.ticker!.toLowerCase()] ?? 0
        // 시세가 먼지(0.01원 미만 = 상폐·거래중지·동명코인 잔여시세)면 0으로. 그 외엔 상폐여도 정상 계산(총액에서만 제외)
        const p = raw < COIN_DUST ? 0 : raw
        const newAmount = Math.floor(a.quantity! * p)
        if (a.unitPrice === p && a.amount === newAmount) continue
        await repo.upsertAsset({ ...a, unitPrice: p, amount: newAmount, updatedAt: new Date().toISOString() })
      }
    })()
  }, [profileId])
}
