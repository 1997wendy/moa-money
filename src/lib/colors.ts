// 일정 색상 팔레트 (6종) — 업무/개인 등 구분용
export interface SchColor {
  key: string
  label: string
  bg: string
  fg: string
  dot: string
}

export const SCH_COLORS: SchColor[] = [
  { key: 'violet', label: '기본', bg: '#efeafe', fg: '#6b46e5', dot: '#6b46e5' },
  { key: 'blue', label: '업무', bg: '#e7f0ff', fg: '#2f6fed', dot: '#2f6fed' },
  { key: 'green', label: '개인', bg: '#e6f7f0', fg: '#0e9c8d', dot: '#12b8a6' },
  { key: 'amber', label: '중요', bg: '#fff3e0', fg: '#c77700', dot: '#f5a524' },
  { key: 'pink', label: '기념일', bg: '#ffe9f0', fg: '#d6336c', dot: '#e64980' },
  { key: 'gray', label: '기타', bg: '#eef0f3', fg: '#5b6673', dot: '#8a94a3' },
]

export const colorOf = (key?: string): SchColor =>
  SCH_COLORS.find((c) => c.key === key) ?? SCH_COLORS[0]
