// 계정 게이트 — 로그인해야 앱 사용. 로그인 시 그 계정 데이터를 불러오고, 로그아웃 시 로컬을 비운다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { repo } from '../db/repository'
import { initEmptyAccount } from '../db/seed'
import { hasCloud, pullForce, pushNow, isDirty } from '../lib/cloudSync'
import AuthScreen from './AuthScreen'

type Phase = 'checking' | 'auth' | 'loading' | 'ready'

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const entered = useRef(false)

  useEffect(() => {
    let active = true

    async function enter() {
      if (entered.current) return
      entered.current = true
      setPhase('loading')
      try {
        const cloud = await hasCloud()
        const localHasData = (await repo.listProfiles()).length > 0
        if (localHasData && isDirty()) {
          await pushNow() // 로컬에 아직 안 올린 변경이 있으면 그것을 우선 보존해 올림
        } else if (cloud) {
          await pullForce() // 깨끗한 로컬 → 클라우드 계정 데이터를 불러옴
        } else {
          await repo.wipeLocal() // 새 계정: 이전 로컬 데이터 제거
          await initEmptyAccount() // 빈 프로필 1개로 시작(샘플 없음)
          await pushNow() // 클라우드 기준점 생성
        }
      } catch {
        /* 실패해도 앱은 진입 (다음 동기화에서 재시도) */
      }
      if (active) setPhase('ready')
    }
    async function exit() {
      entered.current = false
      await repo.wipeLocal()
      localStorage.removeItem('moa.lastSyncMs')
      localStorage.removeItem('moa.dirtyAt')
      if (active) setPhase('auth')
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) enter()
      else setPhase('auth')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) enter()
      else if (event === 'SIGNED_OUT') exit()
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  if (phase === 'auth') return <AuthScreen />
  if (phase === 'checking' || phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-sub text-[14px]">불러오는 중…</div>
  }
  return <>{children}</>
}
