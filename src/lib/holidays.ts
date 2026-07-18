// 대한민국 공휴일 (로컬 정적 데이터)
// - off=true: 관공서 공휴일(휴무·빨간날) / off=false: 국경일·기념일(휴무 아님)
// - 음력 기반(설날·추석·부처님오신날)·대체공휴일은 연도별 수동 (추후 공공데이터포털 API로 대체 예정)

export interface Holiday { name: string; off: boolean }

// 양력 고정 (매년)
const FIXED: [string, string, boolean][] = [
  ['01-01', '신정', true],
  ['03-01', '삼일절', true],
  ['05-05', '어린이날', true],
  ['06-06', '현충일', true],
  ['07-17', '제헌절', false], // 국경일이나 2008년부터 공휴일(휴무) 아님
  ['08-15', '광복절', true],
  ['10-03', '개천절', true],
  ['10-09', '한글날', true],
  ['12-25', '성탄절', true],
]

// ⚠️ 음력 공휴일은 best-effort. 정확한 값은 API 연동 시 교체.
const LUNAR: Record<string, [string, string][]> = {
  '2025': [
    ['01-28', '설날 연휴'], ['01-29', '설날'], ['01-30', '설날 연휴'],
    ['05-05', '부처님오신날'], ['10-06', '추석 연휴'], ['10-07', '추석'], ['10-08', '추석 연휴'],
  ],
  '2026': [
    ['02-16', '설날 연휴'], ['02-17', '설날'], ['02-18', '설날 연휴'],
    ['05-24', '부처님오신날'], ['09-24', '추석 연휴'], ['09-25', '추석'], ['09-26', '추석 연휴'],
  ],
  '2027': [
    ['02-06', '설날 연휴'], ['02-07', '설날'], ['02-08', '설날 연휴'],
    ['05-13', '부처님오신날'], ['09-14', '추석 연휴'], ['09-15', '추석'], ['09-16', '추석 연휴'],
  ],
}

// 대체공휴일 (수동 · 해당 연도)
const SUBSTITUTE: Record<string, string[]> = {
  '2026': ['03-02', '05-25', '08-17', '09-28', '10-05'], // 삼일절·부처님·광복절·추석·개천절 대체
}

export function holidayInfo(dateStr: string): Holiday | undefined {
  const y = dateStr.slice(0, 4)
  const md = dateStr.slice(5)
  const f = FIXED.find(([d]) => d === md)
  if (f) return { name: f[1], off: f[2] }
  const l = (LUNAR[y] ?? []).find(([d]) => d === md)
  if (l) return { name: l[1], off: true }
  if ((SUBSTITUTE[y] ?? []).includes(md)) return { name: '대체공휴일', off: true }
  return undefined
}

/** 하위호환 — 이름만 */
export function holidayName(dateStr: string): string | undefined {
  return holidayInfo(dateStr)?.name
}
