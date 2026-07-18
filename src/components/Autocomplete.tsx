// 자동완성 입력 — 결과 목록을 화면 최상단 레이어(포털)에 띄워
//  ① 모달 스크롤에 안 잘리고 ② 아래 내용을 밀지 않아 덜컹거림이 없음
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { inputCls } from './ui'

export default function Autocomplete({ value, onChange, options, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  options: string[] // 전체 목록 (내부에서 필터)
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const matches = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
    : []
  const show = open && matches.length > 0

  const place = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()) }
  useEffect(() => {
    if (!open) return
    place()
    const h = () => place()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
  }, [open])

  return (
    <>
      <input
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); place() }}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={className ?? inputCls}
      />
      {show && rect && createPortal(
        <div
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 100 }}
          className="bg-surface border border-line rounded-[10px] shadow-lg max-h-52 overflow-auto"
        >
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-canvas border-b border-line last:border-0"
            >{m}</button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
