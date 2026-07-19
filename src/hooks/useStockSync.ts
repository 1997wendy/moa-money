// 해외주식/ETF(미국) 실시간 시세 자동 반영 — Edge Function(stock-price) 호출
import { useEffect, useRef } from 'react'
import { repo } from '../db/repository'
import { supabase } from '../lib/supabase'
import { fetchFxRate } from '../lib/fx'

export function useStockSync(profileId: string) {
  const done = useRef('')
  useEffect(() => {
    if (!profileId || done.current === profileId) return
    done.current = profileId
    ;(async () => {
      const assets = await repo.listAssets(profileId)
      const us = assets.filter((a) => (a.type === 'stock' || a.type === 'etf') && a.market === 'us' && a.currency === 'USD' && a.quantity && a.ticker && !a.archived)
      if (us.length === 0) return
      try {
        const symbols = Array.from(new Set(us.map((a) => a.ticker!.toUpperCase())))
        const { data, error } = await supabase.functions.invoke('stock-price', { body: { symbols } })
        const prices = (data as { prices?: Record<string, number> } | null)?.prices
        if (error || !prices) return
        const fx = (await fetchFxRate('USD')) ?? 0
        for (const a of us) {
          const p = prices[a.ticker!.toUpperCase()]
          if (p) {
            await repo.upsertAsset({
              ...a, currency: 'USD', unitPrice: p,
              amount: Math.floor(a.quantity! * p * 100) / 100, // 달러는 소수 2자리 유지·내림 ($0.69 등)
              fxRate: fx || a.fxRate,
              updatedAt: new Date().toISOString(),
            })
          }
        }
      } catch {
        /* 함수 미배포/네트워크 실패 시 기존 값 유지 */
      }
    })()
  }, [profileId])
}
