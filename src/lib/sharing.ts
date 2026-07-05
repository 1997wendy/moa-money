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
  const data = await repo.exportProfile(opts.profileId)
  const { data: existing } = await supabase.from('shared_profiles')
    .select('id').eq('owner_id', user.id).eq('target_email', target).eq('profile_name', opts.profileName).maybeSingle()
  const row = {
    owner_id: user.id, owner_email: user.email, target_email: target,
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

/** 상대: 나에게 공유된 프로필 목록(데이터 포함) */
export async function listSharedToMe(): Promise<(Share & { data: Record<string, unknown> })[]> {
  const { data } = await supabase.from('shared_profiles')
    .select('id, owner_email, target_email, profile_name, permission, hidden_menus, menu_perms, updated_at, data')
  return (data as (Share & { data: Record<string, unknown> })[]) ?? []
}
