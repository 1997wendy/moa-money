// 국내주식/ETF 검색(내장 목록)·시세(kr-stock Edge Function)
import { supabase } from './supabase'
import { KR_STOCKS } from './krStocks'

export interface KrHit { code: string; name: string }

export function searchKrStocks(q: string): KrHit[] {
  const s = q.trim()
  if (!s) return []
  if (/^\d{6}$/.test(s)) return [{ code: s, name: s }] // 6자리 코드 직접 입력
  const low = s.toLowerCase()
  const seen = new Set<string>()
  const out: KrHit[] = []
  for (const x of KR_STOCKS) {
    const hit = x.name.toLowerCase().includes(low) || x.code.includes(s) || (x.alias?.toLowerCase().includes(low) ?? false)
    if (hit && !seen.has(x.code)) {
      seen.add(x.code)
      out.push({ code: x.code, name: x.name })
      if (out.length >= 15) break
    }
  }
  return out
}

export async function getKrStockPrices(codes: string[]): Promise<{ prices: Record<string, number>; names: Record<string, string> }> {
  const uniq = Array.from(new Set(codes.filter(Boolean)))
  if (uniq.length === 0) return { prices: {}, names: {} }
  const { data, error } = await supabase.functions.invoke('kr-stock', { body: { codes: uniq } })
  if (error) return { prices: {}, names: {} }
  const d = data as { prices?: Record<string, number>; names?: Record<string, string> } | null
  return { prices: d?.prices ?? {}, names: d?.names ?? {} }
}

export async function getKrStockPrice(code: string): Promise<{ price: number; name?: string } | null> {
  const { prices, names } = await getKrStockPrices([code])
  const p = prices[code]
  return typeof p === 'number' ? { price: p, name: names[code] } : null
}
