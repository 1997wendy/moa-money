// 소수점 허용 금액 입력 — 타이핑 중 정수부에 천단위 콤마, 소수부 유지
// (평단가처럼 코인 0.0053 · 해외주식 150.25 같은 소수 입력용)
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

/** 정수부만 콤마, 소수부·소수점 유지 ('1500'→'1,500', '0.0053'→'0.0053', '12.'→'12.') */
export function commaDecimal(raw: string): string {
  let s = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '') // 소수점 1개만
  const [int, dec] = s.split('.')
  const intF = int ? Number(int).toLocaleString('en-US') : (s.startsWith('.') ? '0' : '')
  return dec !== undefined ? `${intF || '0'}.${dec}` : intF
}

export default function DecimalInput({ value, onChange, placeholder, className = '' }: {
  value: string // 콤마 없는 숫자 문자열 ('' | '1500' | '0.0053')
  onChange: (v: string) => void // 콤마 제거된 값 전달
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value ? commaDecimal(value) : '')
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setText(value ? commaDecimal(value) : '') }, [value, editing])

  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => setEditing(true)}
      onChange={(e) => { const disp = commaDecimal(e.target.value); setText(disp); onChange(disp.replace(/,/g, '')) }}
      onBlur={() => { setEditing(false); const clean = text.replace(/,/g, ''); onChange(clean); setText(clean ? commaDecimal(clean) : '') }}
      className={`${inputCls} text-right tnum ${className}`}
    />
  )
}
