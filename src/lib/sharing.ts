// 프로필 공유 (마스터 → 상대). 메뉴별 권한(숨김/읽기/수정).
import { supabase } from './supabase'
import { repo } from '../db/repository'

export type MenuPerm = 'hidden' | 'read' | 'edit'
export type MenuPerms = Record<string, MenuPerm>

/** 공유에서 권한을 정할 수 있는 메뉴들 */
export const SHARE_MENUS: { key: string; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'ledger', label: '가계부' },
  { key: 'receivables', label: '정산' },
  { key: 'assets', label: '자산' },
  { key: 'calendar', label: '캘린더' },
  { key: 'stats', label: '통계·목표' },
  { key: 'invest', label: '투자' },
  { key: 'cards', label: '카드혜택' },
]

export interface Share {
  id: string
  owner_email: string | null
  target_email: string
  profile_name: string
  permission: 'read' | 'edit'
  hidden_menus: string[]
  menu_perms: MenuPerms
  updated_at: string
}

/**
 * 어떤 표(데이터)가 어떤 메뉴에서 필요한지.
 * 예: 거래내역은 가계부뿐 아니라 대시보드 요약·정산·통계·카드혜택에서도 쓴다.
 * 허용된 메뉴 중 하나라도 그 표를 필요로 하면 담고, 아무도 안 쓰면 아예 빼버린다.
 */
const TABLE_NEEDED_BY: Record<string, string[]> = {
  assets: ['dashboard', 'assets', 'stats', 'invest'],
  transactions: ['dashboard', 'ledger', 'receivables', 'stats', 'cards'],
  schedules: ['calendar'],
  people: ['receivables'],
  recurring: ['receivables'],
  cards: ['cards', 'ledger'],
  goals: ['stats'],
  categories: ['ledger', 'stats'],
  coachNotes: ['invest'],
  supports: ['dashboard', 'assets', 'stats'],
}

/**
 * 이메일 공유본에서 '숨김'으로 정한 메뉴의 데이터를 통째로 빼낸다.
 *
 * 화면에서만 가리면 받은 사람이 개발자도구로 들여다볼 수 있다.
 * → 숨긴 메뉴의 데이터는 **애초에 공유본에 담지 않는다.** (비밀 링크와 같은 원칙)
 */
function sharedSnapshot(full: Record<string, unknown>, perms: MenuPerms): Record<string, unknown> {
  const on = (k: string) => perms[k] === 'read' || perms[k] === 'edit'
  const out: Record<string, unknown> = { ...full }
  for (const [table, menus] of Object.entries(TABLE_NEEDED_BY)) {
    if (!menus.some(on)) out[table] = [] // 이 표를 볼 수 있는 메뉴가 하나도 없음 → 비움
  }
  return out
}

/** 마스터: 공유 생성/갱신 (같은 상대+프로필명이면 덮어쓰기) */
export async function createShare(opts: {
  profileId: string
  profileName: string
  targetEmail: string
  menuPerms: MenuPerms
}): Promise<'ok' | 'noauth' | 'error'> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'noauth'
  const target = opts.targetEmail.trim().toLowerCase()
  if (!target) return 'error'
  const values = Object.values(opts.menuPerms)
  const permission: 'read' | 'edit' = values.includes('edit') ? 'edit' : 'read'
  const hidden = Object.entries(opts.menuPerms).filter(([, v]) => v === 'hidden').map(([k]) => k)
  // 숨김으로 정한 메뉴의 데이터는 아예 담지 않는다
  const data = sharedSnapshot(await repo.exportProfile(opts.profileId) as unknown as Record<string, unknown>, opts.menuPerms)
  const { data: existing } = await supabase.from('shared_profiles')
    .select('id').eq('owner_id', user.id).eq('target_email', target).eq('profile_name', opts.profileName).maybeSingle()
  const row = {
    owner_id: user.id, owner_email: user.email, target_email: target,
    profile_id: opts.profileId, // 나중에 자동 갱신할 때 어느 프로필인지 찾기 위해 저장
    profile_name: opts.profileName, permission, hidden_menus: hidden,
    menu_perms: opts.menuPerms, data, updated_at: new Date().toISOString(),
  }
  const q = existing?.id
    ? supabase.from('shared_profiles').update(row).eq('id', (existing as { id: string }).id)
    : supabase.from('shared_profiles').insert(row)
  const { error } = await q
  return error ? 'error' : 'ok'
}

export async function listMyShares(): Promise<Share[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('shared_profiles')
    .select('id, owner_email, target_email, profile_name, permission, hidden_menus, menu_perms, updated_at')
    .eq('owner_id', user.id) // 내가 소유(공유한) 것만
    .order('updated_at', { ascending: false })
  return (data as Share[]) ?? []
}

export async function revokeShare(id: string): Promise<void> {
  await supabase.from('shared_profiles').delete().eq('id', id)
}

/**
 * 내가 만든 공유본(이메일 공유 + 비밀 링크)을 전부 '지금 데이터'로 다시 채운다.
 *
 * 공유는 만든 시점의 복사본이라, 예전엔 내용이 바뀌면 갱신 버튼을 눌러야 상대에게 반영됐다.
 * 이제 내 데이터가 클라우드에 동기화될 때마다 이 함수가 같이 돌아서 공유본도 최신이 된다.
 * (실패해도 본 동기화에는 영향 없음 — 조용히 넘어간다)
 */
export async function refreshAllMyShares(): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const profiles = await repo.listProfiles()
    /** 공유 행이 가리키는 프로필 찾기 (옛 공유엔 profile_id가 없어서 이름으로도 찾아본다) */
    const findProfileId = (pid: string | null, name: string) =>
      (pid && profiles.some((p) => p.id === pid) ? pid : profiles.find((p) => p.name === name)?.id)
    const now = new Date().toISOString()
    let n = 0

    // ① 이메일 공유
    const { data: mine } = await supabase.from('shared_profiles')
      .select('id, profile_id, profile_name, menu_perms').eq('owner_id', user.id)
    for (const s of (mine as { id: string; profile_id: string | null; profile_name: string; menu_perms: MenuPerms }[]) ?? []) {
      const pid = findProfileId(s.profile_id, s.profile_name)
      if (!pid) continue // 그 프로필이 이 기기엔 없음 → 건드리지 않음
      const full = await repo.exportProfile(pid) as unknown as Record<string, unknown>
      const { error } = await supabase.from('shared_profiles')
        .update({ data: sharedSnapshot(full, s.menu_perms ?? {}), profile_id: pid, updated_at: now }).eq('id', s.id)
      if (!error) n++
    }

    // ② 비밀 링크 (숨김 메뉴는 애초에 담지 않는 필터를 그대로 적용)
    const { data: links } = await supabase.from('public_shares')
      .select('id, profile_id, profile_name, menu_perms').eq('owner_id', user.id)
    for (const s of (links as PublicShare[]) ?? []) {
      const pid = findProfileId(s.profile_id, s.profile_name)
      if (!pid) continue
      const full = await repo.exportProfile(pid)
      const { error } = await supabase.from('public_shares').update({
        data: publicSnapshot(full as unknown as Record<string, unknown>, s.menu_perms ?? {}),
        profile_id: pid, updated_at: now,
      }).eq('id', s.id)
      if (!error) n++
    }
    return n
  } catch {
    return 0
  }
}

/** 상대: 나에게 공유된 프로필 목록(데이터 포함) */
export async function listSharedToMe(): Promise<(Share & { data: Record<string, unknown> })[]> {
  const { data } = await supabase.from('shared_profiles')
    .select('id, owner_email, target_email, profile_name, permission, hidden_menus, menu_perms, updated_at, data')
  return (data as (Share & { data: Record<string, unknown> })[]) ?? []
}

/* ===== 비밀 URL 공유 — 가입 없이 링크만으로 읽기 전용 열람 ===== */

export interface PublicShare {
  id: string // 이 값이 곧 링크의 비밀 토큰
  label: string | null
  profile_id: string | null
  profile_name: string
  menu_perms: MenuPerms
  expires_at: string | null
  created_at: string
  updated_at: string
}

/** 링크 전체 주소 (지금 접속한 도메인 기준 · localhost에서도 그대로 동작) */
export const publicShareUrl = (token: string) => `${window.location.origin}/s/${token}`

/**
 * 링크에 담을 데이터를 '보이기로 한 메뉴'만 남기고 잘라낸다.
 * 화면에서만 가리면 개발자도구로 들여다볼 수 있으므로, 숨김 메뉴는 아예 저장하지 않는다.
 */
function publicSnapshot(full: Record<string, unknown>, perms: MenuPerms) {
  // 비밀 링크는 '명시적으로 보이기로 한 메뉴'만 인정한다 (빠진 키는 숨김 취급)
  const on = (k: string) => perms[k] === 'read' || perms[k] === 'edit'
  const pick = <T,>(key: string, keep: boolean): T[] => (keep && Array.isArray(full[key]) ? (full[key] as T[]) : [])
  return {
    app: 'money-app', shared: true, public: true,
    assets: pick('assets', on('dashboard') || on('assets')),
    transactions: pick('transactions', on('dashboard') || on('ledger') || on('receivables')),
    schedules: pick('schedules', on('calendar')),
    people: pick('people', on('receivables')),
  }
}

/** 비밀 URL 화면이 실제로 그려주는 메뉴만 (나머지는 링크에 담기지 않음) */
export const PUBLIC_SHARE_MENUS = SHARE_MENUS.filter((m) =>
  ['dashboard', 'assets', 'ledger', 'receivables', 'calendar'].includes(m.key))

/** 마스터: 비밀 링크 생성 → 토큰 반환 */
export async function createPublicShare(opts: {
  profileId: string
  profileName: string
  menuPerms: MenuPerms
  label?: string
  days?: number | null // null·미지정 = 무기한
}): Promise<{ ok: true; token: string } | { ok: false; reason: 'noauth' | 'error' }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'noauth' }
  const full = await repo.exportProfile(opts.profileId)
  const expires = opts.days ? new Date(Date.now() + opts.days * 86400000).toISOString() : null
  const { data, error } = await supabase.from('public_shares').insert({
    owner_id: user.id,
    label: opts.label?.trim() || null,
    profile_id: opts.profileId,
    profile_name: opts.profileName,
    menu_perms: opts.menuPerms,
    data: publicSnapshot(full as unknown as Record<string, unknown>, opts.menuPerms),
    expires_at: expires,
    updated_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !data) return { ok: false, reason: 'error' }
  return { ok: true, token: (data as { id: string }).id }
}

export async function listPublicShares(): Promise<PublicShare[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('public_shares')
    .select('id, label, profile_id, profile_name, menu_perms, expires_at, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
  return (data as PublicShare[]) ?? []
}

/** 링크는 만든 시점의 스냅샷이라, 최신 내용을 보여주려면 갱신해야 한다 */
export async function refreshPublicShare(s: PublicShare): Promise<boolean> {
  if (!s.profile_id) return false
  const full = await repo.exportProfile(s.profile_id)
  const { error } = await supabase.from('public_shares').update({
    data: publicSnapshot(full as unknown as Record<string, unknown>, s.menu_perms ?? {}),
    updated_at: new Date().toISOString(),
  }).eq('id', s.id)
  return !error
}

export async function revokePublicShare(id: string): Promise<void> {
  await supabase.from('public_shares').delete().eq('id', id)
}

export interface PublicSharePayload {
  profile_name: string
  menu_perms: MenuPerms
  data: Record<string, unknown>
  updated_at: string
}

/** 링크 방문자(로그인 안 한 사람 포함): 토큰으로 1건만 가져온다 */
export async function fetchPublicShare(token: string): Promise<PublicSharePayload | null> {
  const { data, error } = await supabase.rpc('get_public_share', { p_token: token })
  if (error || !Array.isArray(data) || data.length === 0) return null
  return data[0] as PublicSharePayload
}
