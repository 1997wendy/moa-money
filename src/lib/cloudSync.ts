// 클라우드 자동 동기화 (스냅샷 방식, 마지막-쓰기-우선 + 충돌 감지)
import { supabase } from './supabase'
import { repo } from '../db/repository'

const LAST = 'moa.lastSyncMs' // 마지막으로 클라우드와 맞춘 시각(ms)
const DIRTY = 'moa.dirtyAt' // 마지막 로컬 변경 시각(ms)

const num = (k: string) => Number(localStorage.getItem(k) || 0)
const markSynced = (ms: number) => { localStorage.setItem(LAST, String(ms)); localStorage.setItem(DIRTY, String(ms)) }

export const isDirty = () => num(DIRTY) > num(LAST)

function suppress(on: boolean) {
  ;(window as unknown as { __moaSuppressDirty?: boolean }).__moaSuppressDirty = on
}
async function currentUid(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** 이 계정의 클라우드 백업이 존재하는지 */
export async function hasCloud(): Promise<boolean> {
  const id = await currentUid()
  if (!id) return false
  const { data } = await supabase.from('backups').select('user_id').maybeSingle()
  return !!data
}

/** 로컬 → 클라우드 업로드 */
export async function pushNow(): Promise<'ok' | 'noauth' | 'error'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const updatedAt = new Date().toISOString()
  const payload = await repo.exportAll()
  const { error } = await supabase.from('backups').upsert({ user_id: id, data: payload, updated_at: updatedAt })
  if (error) return 'error'
  markSynced(Date.parse(updatedAt))
  return 'ok'
}

/** 클라우드가 더 최신이고 로컬이 깨끗하면 자동 반영 */
export async function pullAuto(): Promise<'pulled' | 'up-to-date' | 'no-cloud' | 'conflict' | 'first-run' | 'noauth'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const { data, error } = await supabase.from('backups').select('data, updated_at').maybeSingle()
  if (error || !data) return 'no-cloud'
  const cloudMs = Date.parse((data as { updated_at: string }).updated_at)
  if (cloudMs <= num(LAST)) return 'up-to-date'
  // 이 기기에서 처음 동기화하는 상황이면(baseline 없음) 자동으로 덮지 않고 사용자 선택에 맡김
  if (isDirty()) return num(LAST) === 0 ? 'first-run' : 'conflict'
  suppress(true)
  try { await repo.importAll((data as { data: Record<string, unknown> }).data) } finally { suppress(false) }
  markSynced(cloudMs)
  return 'pulled'
}

/** 사용자가 명시적으로 '받기': 무조건 클라우드로 덮기 */
export async function pullForce(): Promise<'pulled' | 'no-cloud' | 'noauth'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const { data } = await supabase.from('backups').select('data, updated_at').maybeSingle()
  if (!data) return 'no-cloud'
  suppress(true)
  try { await repo.importAll((data as { data: Record<string, unknown> }).data) } finally { suppress(false) }
  markSynced(Date.parse((data as { updated_at: string }).updated_at))
  return 'pulled'
}
