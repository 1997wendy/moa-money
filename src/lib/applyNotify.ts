// 청약 알림 설정 — 저장/불러오기 + 테스트 발송
// 설정은 Supabase(apply_watch)에 저장한다. 알림은 내 브라우저가 아니라 서버가 보내야 하므로,
// 기기에만 저장하면 폰을 꺼둔 사이엔 알림이 안 간다.
//
// ※ 카카오톡 발송도 만들었다가 설정이 번거로워 메일만 쓰기로 했다.
//   카카오 연동 코드는 커밋 fd7331f 에 남아 있으니 나중에 되살릴 수 있다.
import { supabase } from './supabase'

/**
 * 알림 기능을 쓸 수 있는 계정.
 * 사이트는 누구나 쓸 수 있게 열어두지만, 메일 발송은 발송 서비스(Resend) 사용량을 쓰고
 * 알림 설정도 개인 정보라 본인 계정에서만 보이게 한다.
 *
 * ⚠️ 메일 주소를 그대로 적지 않는다 — 저장소가 공개(public)라 주소가 영구히 노출되기 때문.
 *    대신 주소를 되돌릴 수 없는 값(SHA-256 해시)으로 바꿔서 비교만 한다.
 * ※ 계정 추가법: 터미널에서 아래를 실행해 나온 값을 이 목록에 넣는다.
 *    node -e "console.log(require('crypto').createHash('sha256').update('메일주소').digest('hex'))"
 *    (서버 쪽 apply-test / apply-notify 에도 같은 목록이 있다)
 */
const NOTIFY_ALLOW_HASH = [
  '1ae3e4416f2a891a01aa91f1105b9e9ee81efbd866914fecca5d0cf60cd7cc27',
]

/** 메일 주소 → SHA-256 (브라우저 내장 기능) */
async function emailHash(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 지금 로그인한 계정이 알림 기능을 쓸 수 있는지 */
export async function canUseNotify(): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email?.trim().toLowerCase()
  if (!email) return false
  return NOTIFY_ALLOW_HASH.includes(await emailHash(email))
}

export interface Watch {
  enabled: boolean
  regions: string[]
  email: string
  emailOn: boolean
  specialOn: boolean
}

export const EMPTY_WATCH: Watch = {
  enabled: false,
  regions: [],
  email: '',
  emailOn: true,
  specialOn: false, // 특별공급 알림 — 자격이 확인되기 전까지는 꺼둔다
}

export async function loadWatch(): Promise<Watch | null> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return null
  const { data, error } = await supabase.from('apply_watch').select('*').eq('user_id', u.user.id).maybeSingle()
  if (error) return null
  if (!data) return { ...EMPTY_WATCH, email: u.user.email ?? '' }
  return {
    enabled: !!data.enabled,
    regions: data.regions ?? [],
    email: data.email ?? u.user.email ?? '',
    emailOn: !!data.email_on,
    specialOn: !!data.special_on,
  }
}

export async function saveWatch(w: Watch): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return false
  const { error } = await supabase.from('apply_watch').upsert({
    user_id: u.user.id,
    enabled: w.enabled,
    regions: w.regions,
    email: w.email || null,
    email_on: w.emailOn,
    special_on: w.specialOn,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  return !error
}

export async function sendTest(email: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.functions.invoke('apply-test', { body: { email } })
  if (error) return { ok: false, reason: 'apply-test 함수가 아직 배포되지 않았어요.' }
  return data as { ok: boolean; reason?: string }
}
