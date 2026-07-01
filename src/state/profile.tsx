// 현재 선택된 사용자 프로필 + PIN 잠금 상태
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
import { hashPin } from '../lib/pin'
import type { Profile } from '../db/types'

interface ProfileCtx {
  profiles: Profile[]
  profileId: string
  profile?: Profile
  setProfileId: (id: string) => void
  isLocked: (id: string) => boolean
  unlock: (id: string, pin: string) => Promise<boolean>
}

const Ctx = createContext<ProfileCtx | null>(null)
const LS_KEY = 'money-app.profileId'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const profiles = useLiveQuery(() => repo.listProfiles(), [], [] as Profile[])
  const [profileId, setProfileId] = useState<string>(() => localStorage.getItem(LS_KEY) ?? '')
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())

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
      isLocked: (id: string) => {
        const p = profiles.find((x) => x.id === id)
        return !!p?.pinHash && !unlocked.has(id)
      },
      unlock: async (id: string, pin: string) => {
        const p = profiles.find((x) => x.id === id)
        if (!p?.pinHash) return true
        const h = await hashPin(pin)
        if (h === p.pinHash) {
          setUnlocked((prev) => new Set(prev).add(id))
          return true
        }
        return false
      },
    }),
    [profiles, profileId, unlocked],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
