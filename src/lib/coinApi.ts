// 코인 검색·시세 (업비트 KRW 마켓, 키 불필요)
export interface CoinHit { ticker: string; korean: string; english: string }

let cache: CoinHit[] | null = null

async function loadMarkets(): Promise<CoinHit[]> {
  if (cache) return cache
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch('https://api.upbit.com/v1/market/all', { signal: ctrl.signal })
    clearTimeout(timer)
    const j = await r.json() as { market: string; korean_name: string; english_name: string }[]
    const list = j.filter((m) => m.market.startsWith('KRW-')).map((m) => ({
      ticker: m.market.replace('KRW-', ''), korean: m.korean_name, english: m.english_name,
    }))
    if (list.length > 0) cache = list // 실패 시 캐시하지 않아 다음에 재시도
    return list
  } catch { return [] }
}

export async function searchCoins(q: string): Promise<CoinHit[]> {
  const query = q.trim()
  if (!query) return []
  const list = await loadMarkets()
  const s = query.toLowerCase()
  return list
    .filter((c) => c.ticker.toLowerCase().includes(s) || c.korean.includes(query) || c.english.toLowerCase().includes(s))
    .slice(0, 15)
}

/** 코인 현재가(원화). */
export async function getCoinPrice(ticker: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${ticker.toUpperCase()}`)
    const j = await r.json() as { trade_price: number }[]
    const p = j?.[0]?.trade_price
    return typeof p === 'number' ? p : null
  } catch { return null }
}
