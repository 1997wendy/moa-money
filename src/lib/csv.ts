// 간단한 CSV 파서/생성기 (엑셀에서 '.csv'로 저장한 파일 지원)
export function parseCSV(text: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

/** 엑셀 한글 깨짐 방지 BOM 포함 CSV 문자열 */
export function toCSV(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 다양한 날짜 표기 → yyyy-mm-dd */
export function normDate(s: string): string | null {
  const m = s.trim().match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  return m ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null
}

/** 금액 문자열 → 숫자(절대값) */
export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[^0-9.-]/g, ''))
  return isFinite(n) ? Math.abs(Math.round(n)) : 0
}
