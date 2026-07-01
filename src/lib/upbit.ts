// 업비트 공개 API — 원화 마켓 코인 실시간 시세 (브라우저 직접 호출 OK)
let krwMarkets: Set<string> | null = null

async function validKrwTickers(): Promise<Set<string>> {
  if (krwMarkets) return krwMarkets
  const res = await fetch('https://api.upbit.com/v1/market/all')
  const list: { market: string }[] = await res.json()
  krwMarkets = new Set(list.filter((m) => m.market.startsWith('KRW-')).map((m) => m.market.slice(4)))
  return krwMarkets
}

/** 티커 목록 → { 티커: 원화가격 } (원화마켓에 없는 티커는 제외) */
export async function fetchUpbitPricesKRW(tickers: string[]): Promise<Record<string, number>> {
  const uniq = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)))
  if (uniq.length === 0) return {}
  const valid = await validKrwTickers()
  const use = uniq.filter((t) => valid.has(t))
  if (use.length === 0) return {}
  const markets = use.map((t) => `KRW-${t}`).join(',')
  const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${markets}`)
  if (!res.ok) throw new Error('upbit')
  const data: { market: string; trade_price: number }[] = await res.json()
  const out: Record<string, number> = {}
  for (const row of data) {
    const t = row.market.slice(4)
    if (typeof row.trade_price === 'number') out[t] = row.trade_price
  }
  return out
}
