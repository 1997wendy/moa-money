// 시간 입력 — 오전/오후 없이 숫자로 입력, 타이핑하면서 실시간으로 HH:MM 형태
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

/** 4자리까지의 숫자를 HH:MM 으로 정리 (완성 시 시/분 범위 보정) */
export function normalizeTime(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (d === '') return ''
  let h: number, m: number
  if (d.length <= 2) { h = +d; m = 0 }
  else if (d.length === 3) { h = +d.slice(0, 1); m = +d.slice(1) }
  else { h = +d.slice(0, 2); m = +d.slice(2) }
  if (h > 23) h = 23
  if (m > 59) m = 59
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 타이핑 중 실시간 표시 (2자리 뒤 콜론 삽입) */
function live(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return d.slice(0, 2) + ':' + d.slice(2)
}

export default function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(value) }, [value, editing])

  return (
    <input
      inputMode="numeric"
      placeholder="예: 1400 → 14:00"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        const disp = live(e.target.value)
        setText(disp)
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits.length >= 3 ? normalizeTime(digits) : disp)
      }}
      onBlur={() => {
        setEditing(false)
        const v = normalizeTime(text)
        onChange(v)
        setText(v)
      }}
      className={inputCls + ' tnum'}
    />
  )
}
