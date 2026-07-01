// 숫자·날짜 포맷 헬퍼

export const won = (n: number): string =>
  new Intl.NumberFormat('ko-KR').format(Math.round(n))

/** 부호 포함 (+1,000 / -1,000) */
export const signed = (n: number): string => (n >= 0 ? '+' : '-') + won(Math.abs(n))

/** 억/만 단위 축약 (1.52억) */
export const compact = (n: number): string => {
  const a = Math.abs(n)
  if (a >= 1e8) return (n / 1e8).toFixed(2).replace(/\.00$/, '') + '억'
  if (a >= 1e4) return Math.round(n / 1e4) + '만'
  return won(n)
}

export const todayISO = (): string => new Date().toISOString().slice(0, 10)
export const thisMonth = (): string => new Date().toISOString().slice(0, 7)

/** yyyy-mm → 'YYYY년 M월' */
export const monthLabel = (ym: string): string => {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

export const addMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return d.toISOString().slice(0, 7)
}
