// 현재 선택된 사용자 프로필 (본인/동생 …) 전역 상태
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo } from '../db/repository'
import type { Profile } from '../db/types'

interface ProfileCtx {
  profiles: Profile[]
  profileId: string
  profile?: Profile
  setProfileId: (id: string) => void
}

const Ctx = createContext<ProfileCtx | null>(null)
const LS_KEY = 'money-app.profileId'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const profiles = useLiveQuery(() => repo.listProfiles(), [], [] as Profile[])
  const [profileId, setProfileId] = useState<string>(
    () => localStorage.getItem(LS_KEY) ?? '',
  )

  // 프로필이 로드됐는데 선택값이 없거나 유효하지 않으면 첫 프로필 선택
  useEffect(() => {
    if (profiles.length === 0) return
    if (!profileId || !profiles.some((p) => p.id === profileId)) {
      setProfileId(profiles[0].id)
    }
  }, [profiles, profileId])

  useEffect(() => {
    if (profileId) localStorage.setItem(LS_KEY, profileId)
  }, [profileId])

  const value = useMemo<ProfileCtx>(
    () => ({
      profiles,
      profileId,
      profile: profiles.find((p) => p.id === profileId),
      setProfileId,
    }),
    [profiles, profileId],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
