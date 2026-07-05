// 프로필 공유 (마스터 → 상대). 클라우드 shared_profiles 테이블 사용.
import { supabase } from './supabase'
import { repo } from '../db/repository'

export interface Share {
  id: string
  owner_email: string | null
  target_email: string
  profile_name: string
  permission: 'read' | 'edit'
  hidden_menus: string[]
  updated_at: string
}

/** 마스터: 공유 생성/갱신 (같은 프로필·상대면 덮어쓰기) */
export async function createShare(opts: {
  profileId: string
  profileName: string
  targetEmail: string
  permission: 'read' | 'edit'
  hiddenMenus: string[]
}): Promise<'ok' | 'noauth' | 'error'> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'noauth'
  const target = opts.targetEmail.trim().toLowerCase()
  if (!target) return 'error'
  const data = await repo.exportProfile(opts.profileId)
  // 같은 상대+프로필명 기존 공유 있으면 갱신
  const { data: existing } = await supabase.from('shared_profiles')
    .select('id').eq('owner_id', user.id).eq('target_email', target).eq('profile_name', opts.profileName).maybeSingle()
  const row = {
    owner_id: user.id, owner_email: user.email, target_email: target,
    profile_name: opts.profileName, permission: opts.permission,
    hidden_menus: opts.hiddenMenus, data, updated_at: new Date().toISOString(),
  }
  const q = existing?.id
    ? supabase.from('shared_profiles').update(row).eq('id', (existing as { id: string }).id)
    : supabase.from('shared_profiles').insert(row)
  const { error } = await q
  return error ? 'error' : 'ok'
}

/** 마스터: 내가 만든 공유 목록 */
export async function listMyShares(): Promise<Share[]> {
  const { data } = await supabase.from('shared_profiles')
    .select('id, owner_email, target_email, profile_name, permission, hidden_menus, updated_at')
    .order('updated_at', { ascending: false })
  return (data as Share[]) ?? []
}

export async function revokeShare(id: string): Promise<void> {
  await supabase.from('shared_profiles').delete().eq('id', id)
}

/** 상대: 나에게 공유된 프로필 목록(데이터 포함) */
export async function listSharedToMe(): Promise<(Share & { data: Record<string, unknown> })[]> {
  const { data } = await supabase.from('shared_profiles')
    .select('id, owner_email, target_email, profile_name, permission, hidden_menus, updated_at, data')
  return (data as (Share & { data: Record<string, unknown> })[]) ?? []
}
