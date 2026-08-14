// 클라우드 자동 동기화 (스냅샷 방식, 마지막-쓰기-우선 + 충돌 감지)
import { supabase } from './supabase'
import { repo } from '../db/repository'
import { refreshAllMyShares } from './sharing'

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

type LooseData = { assets?: unknown[]; transactions?: unknown[] }
const isEmptyData = (d: LooseData | undefined | null) =>
  !d || ((d.assets?.length ?? 0) === 0 && (d.transactions?.length ?? 0) === 0)
const summaryOf = (d: LooseData) => ({ assets: d.assets?.length ?? 0, transactions: d.transactions?.length ?? 0 })

// ===== 클라우드 백업 히스토리 (이전 버전 롤백용) =====
const HISTORY_MIN_GAP_MS = 60 * 1000 // 1분 내 연속 저장은 하나로 묶음 (편집 몰아칠 때 폭증 방지)
const HISTORY_KEEP = 50 // 최근 50개 버전 유지

// 데이터 내용 지문(같으면 새 버전 안 만듦) — 간단한 djb2 해시
function quickHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

export interface BackupVersion { id: number; created_at: string; summary: { assets: number; transactions: number; sig?: string } | null }

/** 히스토리에 현재 스냅샷 적립: 빈 데이터·직전과 내용 동일·1분 내 연속이면 건너뜀. 최근 50개만 유지. 실패해도 본 동기화엔 영향 없음. */
async function saveHistory(id: string, payload: LooseData) {
  try {
    if (isEmptyData(payload)) return // 빈 스냅샷은 히스토리에 넣지 않음
    const sig = quickHash(JSON.stringify(payload))
    const { data: latest } = await supabase.from('backup_history').select('created_at, summary').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latest) {
      const l = latest as { created_at: string; summary?: { sig?: string } }
      if (l.summary?.sig === sig) return // 직전 버전과 내용 동일 → 새 버전 안 만듦
      if (Date.now() - Date.parse(l.created_at) < HISTORY_MIN_GAP_MS) return // 1분 내 연속 → 묶음
    }
    await supabase.from('backup_history').insert({ user_id: id, data: payload, summary: { ...summaryOf(payload), sig } })
    // 오래된 버전 정리 (최근 HISTORY_KEEP개만 남김)
    const { data: rows } = await supabase.from('backup_history').select('id').order('created_at', { ascending: false })
    const ids = (rows as { id: number }[] | null) ?? []
    if (ids.length > HISTORY_KEEP) {
      await supabase.from('backup_history').delete().in('id', ids.slice(HISTORY_KEEP).map((r) => r.id))
    }
  } catch { /* 히스토리 실패는 무시 */ }
}

/** 저장된 이전 버전 목록 (최신순) */
export async function listBackupHistory(): Promise<BackupVersion[]> {
  const id = await currentUid()
  if (!id) return []
  const { data } = await supabase.from('backup_history').select('id, created_at, summary').order('created_at', { ascending: false })
  return (data as BackupVersion[] | null) ?? []
}

/** 특정 이전 버전으로 복원 (로컬에 반영 후 최신본으로 다시 올림) */
export async function restoreBackupHistory(versionId: number): Promise<'ok' | 'noauth' | 'error'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const { data, error } = await supabase.from('backup_history').select('data').eq('id', versionId).maybeSingle()
  if (error || !data) return 'error'
  suppress(true)
  try { await repo.importAll((data as { data: Record<string, unknown> }).data) } finally { suppress(false) }
  markSynced(Date.now())
  await pushNow() // 복원한 내용을 최신본으로 클라우드에 반영
  return 'ok'
}

/** 로컬 → 클라우드 업로드 */
export async function pushNow(): Promise<'ok' | 'noauth' | 'error' | 'skipped-empty'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const payload = await repo.exportAll()
  // ⚠️ 안전장치: 로컬이 사실상 비어있으면(자산·거래 0), 클라우드에 실데이터가 있을 때 덮어쓰지 않는다.
  //   (세션 꼬임·초기화로 빈 로컬이 만들어졌을 때 클라우드 원본이 지워지는 사고 방지)
  if (isEmptyData(payload)) {
    const { data } = await supabase.from('backups').select('data').maybeSingle()
    if (!isEmptyData((data as { data?: LooseData } | null)?.data)) {
      return 'skipped-empty'
    }
  }
  // ⚠️ 안전장치: 이 기기엔 아직 없는 '지난 기록'(월별 자산 스냅샷 등)이 클라우드엔 쌓여 있을 수 있다.
  //   그대로 올리면 남의 기기에서 만든 기록을 통째로 지워버리므로, 클라우드 것을 그대로 얹어서 올린다.
  const p = payload as unknown as Record<string, unknown[]>
  const HISTORY = ['assetSnapshots', 'monthNotes', 'coachNotes']
  if (HISTORY.some((k) => (p[k]?.length ?? 0) === 0)) {
    const { data } = await supabase.from('backups').select('data').maybeSingle()
    const cloud = ((data as { data?: Record<string, unknown[]> } | null)?.data) ?? {}
    for (const k of HISTORY) {
      if ((p[k]?.length ?? 0) === 0 && (cloud[k]?.length ?? 0) > 0) p[k] = cloud[k]
    }
  }
  const updatedAt = new Date().toISOString()
  const { error } = await supabase.from('backups').upsert({ user_id: id, data: payload, updated_at: updatedAt })
  if (error) return 'error'
  markSynced(Date.parse(updatedAt))
  await saveHistory(id, payload) // 이전 버전 히스토리 적립
  void refreshSharesThrottled() // 내가 만든 공유본도 최신으로 (기다리지 않음)
  return 'ok'
}

// 공유본 자동 갱신 — 동기화는 4초마다도 일어나므로 1분에 한 번으로 제한
const SHARE_REFRESH_GAP_MS = 60 * 1000
let lastShareRefresh = 0
async function refreshSharesThrottled() {
  if (Date.now() - lastShareRefresh < SHARE_REFRESH_GAP_MS) return
  lastShareRefresh = Date.now()
  await refreshAllMyShares()
}

/** 클라우드가 더 최신이고 로컬이 깨끗하면 자동 반영 */
export async function pullAuto(): Promise<'pulled' | 'up-to-date' | 'no-cloud' | 'conflict' | 'first-run' | 'noauth'> {
  const id = await currentUid()
  if (!id) return 'noauth'
  const { data, error } = await supabase.from('backups').select('data, updated_at').maybeSingle()
  if (error || !data) return 'no-cloud'
  const cloudMs = Date.parse((data as { updated_at: string }).updated_at)
  if (cloudMs <= num(LAST)) return 'up-to-date'
  // ⚠️ 안전장치: 클라우드가 비어있는데(자산·거래 0) 로컬엔 실데이터가 있으면 자동으로 덮지 않음
  if (isEmptyData((data as { data?: { assets?: unknown[]; transactions?: unknown[] } }).data) && (await repo.hasUserData())) return 'up-to-date'
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
  // ⚠️ 안전장치: 빈 클라우드로 실데이터가 있는 로컬을 덮어쓰지 않음(수동 받기도 보호)
  if (isEmptyData((data as { data?: { assets?: unknown[]; transactions?: unknown[] } }).data) && (await repo.hasUserData())) return 'no-cloud'
  suppress(true)
  try { await repo.importAll((data as { data: Record<string, unknown> }).data) } finally { suppress(false) }
  markSynced(Date.parse((data as { updated_at: string }).updated_at))
  return 'pulled'
}
