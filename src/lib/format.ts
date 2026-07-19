// 숫자·날짜 포맷 헬퍼

export const won = (n: number): string =>
  new Intl.NumberFormat('ko-KR').format(Math.round(n))

/** 통화 기호 (₩ $ ¥ ₫) */
export const curSymbol = (code?: string): string =>
  ({ KRW: '₩', USD: '$', JPY: '¥', VND: '₫' } as Record<string, string>)[code ?? 'KRW'] ?? ''

/**
 * 통화 단위 금액 표시. 원화=정수, 달러=소수 2자리(0.12·6,780.42)까지 살림.
 * (해외주식·코인 소수 달러가 0/정수로 뭉개지지 않도록)
 */
export const money = (n: number, currency?: string): string => {
  if (!currency || currency === 'KRW') return won(n)
  const dec = currency === 'USD' ? 2 : 0 // JPY·VND는 정수
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(n)
}

/** 소수 시세 표시 — 코인처럼 1원 미만 시세가 0으로 뭉개지지 않게 (₩8.85 · ₩0.69 · ₩0.0029) */
export const smallPrice = (n: number): string => {
  const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s)
  if (n >= 100) return won(n) // 100원 이상은 정수
  if (n >= 1) return trim(n.toFixed(2)) // 8.85
  if (n > 0) return trim(n.toPrecision(2)) // 0.69 · 0.0029
  return '0'
}

/** 부호 포함 (+1,000 / -1,000) */
export const signed = (n: number): string => (n >= 0 ? '+' : '-') + won(Math.abs(n))

/** 억/만 단위 축약 (1.52억). 반올림하지 않고 '버림'(truncate) — 4.139억 → 4.13억 */
const truncTo = (n: number, digits: number): string => {
  const f = Math.pow(10, digits)
  return (Math.trunc(n * f) / f).toFixed(digits)
}
export const compact = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e8) return truncTo(n / 1e8, 2).replace(/\.?0+$/, '') + '억'
  if (a >= 1e4) return truncTo(n / 1e4, 1).replace(/\.0$/, '') + '만'
  return won(n)
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** 로컬(한국시간) 기준 오늘 yyyy-mm-dd — UTC로 밀리지 않게 직접 조합 */
export const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const thisMonth = (): string => todayISO().slice(0, 7)

/** yyyy-mm → 'YYYY년 M월' */
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

/** 월 더하기/빼기 — 순수 산술로 계산(타임존 영향 없음) */
export const addMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** 날짜(yyyy-mm-dd) 더하기/빼기 */
export const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
