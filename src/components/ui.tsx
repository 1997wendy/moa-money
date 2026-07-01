// 미니멀 톤 공통 UI 조각
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { X, Plus } from 'lucide-react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-surface border border-line rounded-[12px] p-5 ${className}`}
    >
      {children}
    </div>
  )
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-semibold text-sub mb-2">{children}</div>
}

export function PageHeader({
  title,
  desc,
  right,
}: {
  title: string
  desc?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {desc && <p className="text-sub text-[13px] mt-0.5">{desc}</p>}
      </div>
      {right}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  className = '',
  disabled = false,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'line'
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
}) {
  const styles = {
    primary: 'bg-mint text-white hover:bg-mint-d',
    ghost: 'bg-canvas text-ink hover:bg-line/60',
    line: 'bg-surface text-ink border border-line hover:bg-canvas',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-[10px] text-[13px] font-bold transition-colors ${styles} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-[440px] rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-surface">
          <h2 className="font-bold text-[16px]">{title}</h2>
          <button onClick={onClose} className="text-sub hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block mb-3">
      <span className="text-[12px] font-semibold text-sub">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export const inputCls =
  'w-full border border-line rounded-[10px] px-3 py-2 text-[14px] bg-surface outline-none focus:border-mint transition-colors'

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-sub text-[13px] py-10">{children}</div>
  )
}

/** 우측 하단 고정 ＋ 버튼 (전 페이지 공통) */
export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed bottom-7 right-7 z-40 h-14 w-14 rounded-full bg-mint text-white shadow-lg flex items-center justify-center hover:bg-mint-d transition-colors"
    >
      <Plus size={26} />
    </button>
  )
}
