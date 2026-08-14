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
import { repo, setSharedOverlay, isSharedId, SHARED_PREFIX } from '../db/repository'
import { hashPin } from '../lib/pin'
import type { Profile } from '../db/types'
import type { MenuPerms } from '../lib/sharing'

/** 지금 열람 중인 '공유받은 프로필' 정보 (없으면 내 프로필을 보는 중) */
export interface SharedViewing {
  shareId: string
  ownerEmail: string | null
  profileName: string
  menuPerms: MenuPerms
}

/** 공유받은 프로필로 전환할 때 넘겨주는 것 */
export interface SharedEntry extends SharedViewing {
  data: Record<string, unknown> // 공유 스냅샷 (exportProfile 결과)
}

interface ProfileCtx {
  profiles: Profile[]
  profileId: string
  profile?: Profile
  setProfileId: (id: string) => void
  isLocked: (id: string) => boolean
  unlock: (id: string, pin: string) => Promise<boolean>
  /** 공유받은 프로필을 보는 중이면 그 정보 */
  shared: SharedViewing | null
  /** 공유받은 프로필로 전환 */
  enterShared: (entry: SharedEntry) => void
  /** 내 프로필로 돌아가기 */
  exitShared: () => void
}

const Ctx = createContext<ProfileCtx | null>(null)
const LS_KEY = 'money-app.profileId'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const profiles = useLiveQuery(() => repo.listProfiles(), [], [] as Profile[])
  // 공유받은 프로필은 새로고침하면 유지하지 않는다(스냅샷이 메모리에만 있으므로)
  const [profileId, setProfileId] = useState<string>(() => {
    const saved = localStorage.getItem(LS_KEY) ?? ''
    return isSharedId(saved) ? '' : saved
  })
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
  const [shared, setShared] = useState<SharedViewing | null>(null)
  const [sharedProfile, setSharedProfile] = useState<Profile | undefined>()

  useEffect(() => {
    if (isSharedId(profileId)) return // 공유 열람 중엔 내 프로필로 되돌리지 않는다
    if (profiles.length === 0) return
    if (!profileId || !profiles.some((p) => p.id === profileId)) {
      setProfileId(profiles[0].id)
    }
  }, [profiles, profileId])

  useEffect(() => {
    if (profileId && !isSharedId(profileId)) localStorage.setItem(LS_KEY, profileId)
  }, [profileId])

  const enterShared = (entry: SharedEntry) => {
    const fakeId = SHARED_PREFIX + entry.shareId
    setSharedOverlay({ profileId: fakeId, data: entry.data })
    // 공유본 안에 들어있는 소유자의 프로필 설정(급여·목표비중 등)을 그대로 쓰되 id만 바꿔치기
    const owner = (Array.isArray(entry.data.profiles) ? entry.data.profiles[0] : undefined) as Profile | undefined
    setSharedProfile({ ...(owner ?? { order: 0 } as Profile), id: fakeId, name: entry.profileName, pinHash: undefined })
    setShared({ shareId: entry.shareId, ownerEmail: entry.ownerEmail, profileName: entry.profileName, menuPerms: entry.menuPerms })
    setProfileId(fakeId)
  }

  const exitShared = () => {
    setSharedOverlay(null)
    setShared(null)
    setSharedProfile(undefined)
    const saved = localStorage.getItem(LS_KEY) ?? ''
    setProfileId(!isSharedId(saved) && saved ? saved : (profiles[0]?.id ?? ''))
  }

  const value = useMemo<ProfileCtx>(
    () => ({
      profiles,
      profileId,
      profile: isSharedId(profileId) ? sharedProfile : profiles.find((p) => p.id === profileId),
      setProfileId,
      shared,
      enterShared,
      exitShared,
      isLocked: (id: string) => {
        if (isSharedId(id)) return false // 공유받은 프로필엔 내 PIN 잠금이 적용되지 않음
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
    [profiles, profileId, unlocked, shared, sharedProfile], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProfile() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
