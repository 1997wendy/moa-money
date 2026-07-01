// 시간 입력 — 오전/오후 선택 없이 숫자로 바로 입력 (1400 / 14:00 → "14:00")
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

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

export default function TimeInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [text, setText] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(value) }, [value, editing])

  return (
    <input
      inputMode="numeric"
      placeholder="예: 1400 → 14:00"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
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
