// 숫자·날짜 포맷 헬퍼

export const won = (n: number): string =>
  new Intl.NumberFormat('ko-KR').format(Math.round(n))

/** 부호 포함 (+1,000 / -1,000) */
export const signed = (n: number): string => (n >= 0 ? '+' : '-') + won(Math.abs(n))

/** 억/만 단위 축약 (1.52억) */
export const compact = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, '') + '억'
  if (a >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만'
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
