// 해외주식 검색·시세 (Edge Function stock-price 경유)
import { supabase } from './supabase'

export interface StockHit { symbol: string; description: string; type?: string }

export async function searchStocks(q: string): Promise<StockHit[]> {
  if (!q.trim()) return []
  const { data, error } = await supabase.functions.invoke('stock-price', { body: { search: q } })
  if (error) return []
  return (data as { results?: StockHit[] } | null)?.results ?? []
}

export async function getStockPrice(symbol: string): Promise<number | null> {
  const { data, error } = await supabase.functions.invoke('stock-price', { body: { symbols: [symbol] } })
  if (error) return null
  const p = (data as { prices?: Record<string, number> } | null)?.prices?.[symbol.toUpperCase()]
  return typeof p === 'number' ? p : null
}
