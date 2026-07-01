// 금액 입력 — 천단위 콤마 자동 + 엑셀식 수식(3+3, 1000*2 등) 계산
import { useEffect, useState } from 'react'
import { inputCls } from './ui'

/** 수식 문자열을 안전하게 계산 (+ - * / 괄호 숫자만 허용) */
export function evalAmount(raw: string): number | null {
  const s = raw.replace(/,/g, '').trim()
  if (s === '') return null
  if (!/^[0-9+\-*/().\s]+$/.test(s)) return null
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${s})`)()
    return typeof v === 'number' && isFinite(v) ? Math.round(v) : null
  } catch {
    return null
  }
}

const withComma = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

export default function AmountInput({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  // 편집 중 원본 문자열(수식 포함) 유지, blur 시 콤마 정리
  const [text, setText] = useState(value != null ? withComma(value) : '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setText(value != null ? withComma(value) : '')
  }, [value, editing])

  return (
    <input
      inputMode="numeric"
      value={text}
      autoFocus={autoFocus}
      placeholder={placeholder ?? '0 (예: 3+3 도 계산됨)'}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value)
        const v = evalAmount(e.target.value)
        onChange(v)
      }}
      onBlur={() => {
        setEditing(false)
        const v = evalAmount(text)
        onChange(v)
        setText(v != null ? withComma(v) : '')
      }}
      className={`${inputCls} text-right tnum ${className}`}
    />
  )
}
