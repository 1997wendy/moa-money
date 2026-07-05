// 코인 검색·시세 (CoinGecko, 키 불필요·CORS 허용). id 기준으로 조회.
export interface CoinHit { id: string; symbol: string; name: string }

export async function searchCoins(q: string): Promise<CoinHit[]> {
  const query = q.trim()
  if (!query) return []
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
    const j = await r.json() as { coins?: { id: string; symbol: string; name: string }[] }
    return (j.coins ?? []).slice(0, 15).map((c) => ({ id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name }))
  } catch { return [] }
}

/** 코인 id → 원화 현재가. */
export async function getCoinPriceKRW(id: string): Promise<number | null> {
  const prices = await getCoinPricesKRW([id])
  return prices[id] ?? null
}

/** 여러 코인 id → { id: 원화가격 }. */
export async function getCoinPricesKRW(ids: string[]): Promise<Record<string, number>> {
  const uniq = Array.from(new Set(ids.map((i) => i.toLowerCase()).filter(Boolean)))
  if (uniq.length === 0) return {}
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uniq.join(',')}&vs_currencies=krw`)
    const j = await r.json() as Record<string, { krw?: number }>
    const out: Record<string, number> = {}
    for (const id of uniq) {
      const p = j?.[id]?.krw
      if (typeof p === 'number') out[id] = p
    }
    return out
  } catch { return {} }
}
