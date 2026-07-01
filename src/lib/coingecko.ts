// CoinGecko 무료 API — 코인 원화 시세 (브라우저에서 직접 호출 가능)
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', XRP: 'ripple', SOL: 'solana', ADA: 'cardano',
  DOGE: 'dogecoin', USDT: 'tether', BNB: 'binancecoin', TRX: 'tron', DOT: 'polkadot',
  MATIC: 'matic-network', LINK: 'chainlink', AVAX: 'avalanche-2', SHIB: 'shiba-inu',
  ATOM: 'cosmos', LTC: 'litecoin', BCH: 'bitcoin-cash', NEAR: 'near', APT: 'aptos',
}

/** 티커 목록 → { 티커: 원화가격 } (지원 안 하는 티커는 제외) */
export async function fetchCoinPricesKRW(tickers: string[]): Promise<Record<string, number>> {
  const wanted = tickers.map((t) => t.toUpperCase()).filter((t) => COIN_IDS[t])
  if (wanted.length === 0) return {}
  const ids = Array.from(new Set(wanted.map((t) => COIN_IDS[t])))
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=krw`)
  if (!res.ok) throw new Error('coingecko')
  const data = await res.json()
  const out: Record<string, number> = {}
  for (const t of wanted) {
    const price = data[COIN_IDS[t]]?.krw
    if (typeof price === 'number') out[t] = price
  }
  return out
}

export const isSupportedCoin = (ticker?: string) => !!ticker && !!COIN_IDS[ticker.toUpperCase()]
