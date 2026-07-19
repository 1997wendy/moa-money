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

// 0.01원 미만은 '먼지'(상폐·거래중지 잔여시세)로 보고 0 취급 — 검산 일관성 위해 조회/동기화 공통 기준
export const COIN_DUST = 0.01

/** 코인 id → 원화 현재가. (상폐/먼지시세/조회불가는 null) */
export async function getCoinPriceKRW(id: string): Promise<number | null> {
  const prices = await getCoinPricesKRW([id])
  const p = prices?.[id]
  return typeof p === 'number' && p >= COIN_DUST ? p : null
}

// 시세 캐시 (60초) — CoinGecko 무료 API 호출 과다(레이트리밋) 방지. localStorage에 저장돼 새로고침해도 유지.
const CACHE_KEY = 'moa.coinPriceCache'
const CACHE_TTL = 60_000
type PriceCache = Record<string, { p: number; t: number }>
const readCache = (): PriceCache => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} } }
const writeCache = (c: PriceCache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* noop */ } }

/**
 * 여러 코인 id → { id: 원화가격 }. 60초 캐시로 재호출 최소화.
 * 응답에 없는 id는 상폐/거래중지로 보고 0. 네트워크 실패 시 (캐시 없으면) null 반환 → 멀쩡한 값이 0으로 안 덮임.
 */
export async function getCoinPricesKRW(ids: string[]): Promise<Record<string, number> | null> {
  const uniq = Array.from(new Set(ids.map((i) => i.toLowerCase()).filter(Boolean)))
  if (uniq.length === 0) return {}
  const cache = readCache()
  const now = Date.now()
  const out: Record<string, number> = {}
  const need: string[] = []
  for (const id of uniq) {
    const e = cache[id]
    if (e && now - e.t < CACHE_TTL) out[id] = e.p
    else need.push(id)
  }
  if (need.length === 0) return out // 전부 캐시로 해결 → 호출 안 함
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${need.join(',')}&vs_currencies=krw`)
    if (!r.ok) return Object.keys(out).length ? out : null // 실패해도 캐시분은 반환
    const j = await r.json() as Record<string, { krw?: number }>
    for (const id of need) {
      const p = j?.[id]?.krw
      const v = typeof p === 'number' ? p : 0 // 응답에 없으면 상폐 → 0
      out[id] = v
      cache[id] = { p: v, t: now }
    }
    writeCache(cache)
    return out
  } catch { return Object.keys(out).length ? out : null }
}
