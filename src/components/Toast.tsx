// 잠깐 떴다 사라지는 인앱 토스트 알림
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastFn = (msg: string) => void
const Ctx = createContext<ToastFn>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([])
  const seq = useRef(0)

  const toast = useCallback<ToastFn>((msg) => {
    const id = ++seq.current
    setItems((p) => [...p, { id, msg }])
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className="bg-ink text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-lg animate-[toastIn_.25s_ease]">
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
