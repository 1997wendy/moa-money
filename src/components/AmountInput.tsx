// 금액 입력 — 타이핑 중 실시간 천단위 콤마 + 엑셀식 수식(3+3) 지원
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
const isFormula = (s: string) => /[+\-*/()]/.test(s.replace(/,/g, ''))

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
  const [text, setText] = useState(value != null ? withComma(value) : '')
  const [editing, setEditing] = useState(false)

  // 밖에서 값이 바뀌면(편집 중 아닐 때) 표시 동기화
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
        const raw = e.target.value
        if (isFormula(raw)) {
          // 수식 입력 중 — 콤마 넣지 않고 원본 유지, 값만 계산
          setText(raw)
          onChange(evalAmount(raw))
        } else {
          // 일반 숫자 — 실시간 콤마. 엑셀 등에서 붙여넣은 소수점(1,000.00)은 반올림 정수로
          const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
          if (cleaned === '' || cleaned === '.') {
            setText('')
            onChange(null)
          } else {
            const n = Math.round(Number(cleaned) || 0)
            setText(withComma(n))
            onChange(n)
          }
        }
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
