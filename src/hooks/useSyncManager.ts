// 자동 동기화 관리자 — 앱 전역에서 1회 마운트
// - 로그인/앱시작 시: 클라우드가 더 최신이면 자동으로 받아옴
// - 로컬 변경 시: 디바운스(4초) 후 자동 업로드
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { pushNow, pullAuto } from '../lib/cloudSync'
import { useToast } from '../components/Toast'

export function useSyncManager() {
  const toast = useToast()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    let active = true

    async function initialPull() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !active) return
      const r = await pullAuto()
      if (!active) return
      if (r === 'pulled') toast('☁️ 클라우드 최신 데이터를 받았어요')
      else if (r === 'conflict') toast('⚠️ 클라우드에 더 최신본이 있어요 — 설정에서 정리하세요')
      // 'first-run'은 조용히 넘어감(설정에서 올리기/덮어쓰기로 기준 잡음)
    }
    initialPull()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) initialPull()
    })

    function onChange() {
      clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) await pushNow()
      }, 4000)
    }
    window.addEventListener('moa:changed', onChange)

    return () => {
      active = false
      sub.subscription.unsubscribe()
      window.removeEventListener('moa:changed', onChange)
      clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
