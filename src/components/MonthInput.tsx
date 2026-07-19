// 월 입력 — 숫자 6자리를 타이핑하면 실시간으로 YYYY-MM 으로 정리 (202201 → 2022-01)
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

/** 6자리 숫자를 YYYY-MM 으로 (월 1~12 보정). 미완성이면 '' */
export function normalizeMonth(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 6)
  if (d.length < 6) return ''
  const y = d.slice(0, 4)
  let mo = +d.slice(4, 6)
  if (mo < 1) mo = 1
  if (mo > 12) mo = 12
  return `${y}-${String(mo).padStart(2, '0')}`
}

/** 타이핑 중 실시간 표시 (4자리 뒤 - 삽입) */
function live(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 6)
  return d.length <= 4 ? d : d.slice(0, 4) + '-' + d.slice(4)
}

export default function MonthInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(value) }, [value, editing])

  return (
    <input
      inputMode="numeric"
      placeholder={placeholder ?? '예: 202201 → 2022-01'}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const disp = live(e.target.value)
        setText(disp)
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits.length === 6 ? normalizeMonth(digits) : '')
      }}
      onBlur={() => {
        setEditing(false)
        const v = normalizeMonth(text)
        onChange(v)
        setText(v)
      }}
      className={inputCls + ' tnum'}
    />
  )
}
