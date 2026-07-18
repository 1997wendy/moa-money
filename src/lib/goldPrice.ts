// 금 시세 (원/g) — KRX 국내 금현물가 우선(정확), 실패 시 국제 spot 환산 폴백
//  1) krx-gold Edge Function (네이버 KRX, CORS 프록시) → 실제 국내 원/g
//  2) 폴백: gold-api.com(USD/oz, 키불필요·CORS) × 환율 → 국제 spot 환산(국내 프리미엄 미반영 근사)
import { supabase } from './supabase'
import { fetchFxRate } from './fx'

const TROY_OZ_G = 31.1034768 // 1 트로이온스 = 31.1034768g

export async function getGoldKrwPerGram(): Promise<number | null> {
  // 1) KRX 국내 금값 (정확)
  try {
    const { data, error } = await supabase.functions.invoke('krx-gold')
    const krw = (data as { krwPerGram?: number } | null)?.krwPerGram
    if (!error && typeof krw === 'number' && krw > 0) return Math.round(krw)
  } catch { /* 함수 미배포/실패 → 폴백 */ }
  // 2) 폴백: 국제 spot(USD/oz) × 환율
  try {
    const [goldRes, fx] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU'),
      fetchFxRate('USD'),
    ])
    const gold = (await goldRes.json()) as { price?: number }
    if (gold.price && fx) return Math.round((gold.price / TROY_OZ_G) * fx)
  } catch { /* noop */ }
  return null
}
