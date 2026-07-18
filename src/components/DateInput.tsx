// 날짜 입력 — 숫자 8자리를 타이핑하면 실시간으로 YYYY-MM-DD 로 정리
// (브라우저 기본 date 칸이 연속 입력을 잘 못 받는 문제 회피 · TimeInput 과 같은 방식)
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

/** 8자리 숫자를 YYYY-MM-DD 로 (완성 시 월 1~12·일 1~31 보정). 미완성이면 '' */
export function normalizeDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length < 8) return ''
  const y = d.slice(0, 4)
  let mo = +d.slice(4, 6)
  let da = +d.slice(6, 8)
  if (mo < 1) mo = 1
  if (mo > 12) mo = 12
  if (da < 1) da = 1
  if (da > 31) da = 31
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
}

/** 타이핑 중 실시간 표시 (4·6자리 뒤 - 삽입) */
function live(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4)
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6)
}

export default function DateInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [text, setText] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(value) }, [value, editing])

  return (
    <input
      inputMode="numeric"
      placeholder="예: 20270226 → 2027-02-26"
      disabled={disabled}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const disp = live(e.target.value)
        setText(disp)
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits.length === 8 ? normalizeDate(digits) : '')
      }}
      onBlur={() => {
        setEditing(false)
        const v = normalizeDate(text)
        onChange(v)
        setText(v)
      }}
      className={inputCls + ' tnum' + (disabled ? ' opacity-40' : '')}
    />
  )
}
