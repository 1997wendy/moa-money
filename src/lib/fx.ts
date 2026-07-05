// 환율 (외화 1단위 → 원). 키 불필요·CORS 허용 API.
export async function fetchFxRate(code: string): Promise<number | null> {
  if (!code || code === 'KRW') return 1
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${code}`)
    const data = await res.json()
    const r = data?.rates?.KRW
    return typeof r === 'number' ? r : null
  } catch { return null }
}
