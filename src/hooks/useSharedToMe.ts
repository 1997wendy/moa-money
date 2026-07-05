// 현재 로그인 이메일로 공유받은 프로필 목록 가져오기
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listSharedToMe, type Share } from '../lib/sharing'

export type SharedItem = Share & { data: Record<string, unknown> }

export function useSharedToMe() {
  const [shares, setShares] = useState<SharedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (active) { setShares([]); setLoading(false) } return }
      const rows = await listSharedToMe()
      if (active) { setShares(rows); setLoading(false) }
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  return { shares, loading }
}
