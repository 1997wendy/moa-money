import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Trash2, Plus, Lock, Cloud } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { supabase } from '../lib/supabase'
import { hashPin } from '../lib/pin'
import { todayISO } from '../lib/format'
import { HIDEABLE } from '../components/AppShell'
import { Card, CardLabel, PageHeader, Button, inputCls } from '../components/ui'

export default function Settings() {
  const { profiles, profile, profileId, setProfileId } = useProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [newName, setNewName] = useState('')
  const hidden = new Set(profile?.hiddenMenus ?? [])

  async function toggleMenu(key: string) {
    if (!profile) return
    const next = new Set(profile.hiddenMenus ?? [])
    next.has(key) ? next.delete(key) : next.add(key)
    await repo.upsertProfile({ ...profile, hiddenMenus: Array.from(next) })
  }

  async function addProfile() {
    if (!newName.trim()) return
    const order = Math.max(-1, ...profiles.map((p) => p.order)) + 1
    await repo.upsertProfile({ id: uid(), name: newName.trim(), order })
    setNewName('')
  }
  async function rename(id: string, name: string) {
    const p = profiles.find((x) => x.id === id)
    if (p) await repo.upsertProfile({ ...p, name })
  }
  async function removeProfile(id: string) {
    if (profiles.length <= 1) { alert('마지막 사용자는 삭제할 수 없어요.'); return }
    if (!confirm('이 사용자와 관련된 모든 데이터를 이 기기에서 삭제할까요? (되돌릴 수 없음)')) return
    await repo.deleteProfileCascade(id)
    if (profileId === id) setProfileId(profiles.find((p) => p.id !== id)!.id)
  }

  async function exportJson() {
    const data = await repo.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `moa-backup-${todayISO()}.json`; a.click()
    URL.revokeObjectURL(url)
    setMsg('내보내기 완료 — 다운로드 폴더를 확인하세요.')
  }
  async function importJson(file: File) {
    try {
      const data = JSON.parse(await file.text())
      if (data.app !== 'money-app') { setMsg('⚠️ 이 앱의 백업 파일이 아니에요.'); return }
      if (!confirm('현재 데이터를 모두 지우고 이 백업으로 덮어씁니다. 계속할까요?')) return
      await repo.importAll(data)
      setMsg('불러오기 완료 — 새로고침하면 반영돼요.')
      setTimeout(() => location.reload(), 800)
    } catch { setMsg('⚠️ 파일을 읽지 못했어요.') }
  }

  return (
    <div>
      <PageHeader title="설정" desc="클라우드 · 사용자 · 잠금 · 메뉴 · 백업" />

      {/* 클라우드 동기화 */}
      <CloudSection />

      {/* 사용자 관리 */}
      <Card>
        <CardLabel>사용자 관리</CardLabel>
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0">
            <input defaultValue={p.name} onBlur={(e) => rename(p.id, e.target.value.trim() || p.name)} className={inputCls + ' flex-1'} />
            {p.pinHash && <span title="PIN 잠금" className="text-mint-d"><Lock size={15} /></span>}
            <button onClick={() => removeProfile(p.id)} className="text-sub hover:text-expense p-1"><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addProfile()} placeholder="새 사용자 이름" className={inputCls + ' flex-1'} />
          <Button onClick={addProfile}><Plus size={15} className="inline -mt-0.5 mr-1" />추가</Button>
        </div>
      </Card>

      {/* PIN 잠금 */}
      <PinSection />

      {/* 메뉴 표시 */}
      <Card className="mt-3.5">
        <CardLabel>메뉴 표시</CardLabel>
        <p className="text-[12px] text-sub mb-2">안 쓰는 메뉴는 꺼두면 사이드바에서 숨겨져요. <b>데이터는 유지</b>되고 다시 켜면 그대로 나와요. (프로필마다 따로)</p>
        {HIDEABLE.map((m) => {
          const on = !hidden.has(m.key)
          return (
            <div key={m.key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <span className="text-[13.5px] font-semibold">{m.label}</span>
              <button onClick={() => toggleMenu(m.key)} className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-mint' : 'bg-line'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </Card>

      {/* 데이터 백업 */}
      <Card className="mt-3.5">
        <CardLabel>데이터 백업</CardLabel>
        <p className="text-[13px] text-sub mb-3">로컬 저장이라, 가끔 백업 파일로 내보내 두세요.</p>
        <div className="flex gap-2">
          <Button onClick={exportJson}><Download size={15} className="inline -mt-0.5 mr-1.5" />내보내기</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <Button variant="line" onClick={() => fileRef.current?.click()}><Upload size={15} className="inline -mt-0.5 mr-1.5" />불러오기</Button>
        </div>
        {msg && <div className="mt-3 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}
      </Card>
    </div>
  )
}

function PinSection() {
  const { profile } = useProfile()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [msg, setMsg] = useState('')
  const has = !!profile?.pinHash

  async function setNewPin() {
    if (!profile) return
    if (pin.length < 4) { setMsg('PIN은 4자리 이상으로.'); return }
    if (pin !== pin2) { setMsg('두 PIN이 달라요.'); return }
    await repo.upsertProfile({ ...profile, pinHash: await hashPin(pin) })
    setPin(''); setPin2(''); setMsg('PIN을 설정했어요.')
  }
  async function removePin() {
    if (!profile) return
    if (!confirm('PIN 잠금을 해제할까요?')) return
    const { pinHash, ...rest } = profile
    void pinHash
    await repo.upsertProfile(rest)
    setMsg('PIN을 해제했어요.')
  }

  return (
    <Card className="mt-3.5">
      <CardLabel>🔒 PIN 잠금</CardLabel>
      <p className="text-[12px] text-sub mb-3">
        잠그면 이 프로필로 들어올 때 PIN이 필요해요 (다른 사람이 내 정보 못 보게).
        <b> 단, 가벼운 잠금이라 완벽한 보안은 아니에요</b> — 진짜 보안은 클라우드 단계에서.
      </p>
      {has ? (
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-mint-d">PIN 설정됨</span>
          <div className="flex-1" />
          <Button variant="line" onClick={removePin}>잠금 해제</Button>
        </div>
      ) : (
        <div className="flex gap-2 items-center flex-wrap">
          <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="새 PIN" className={inputCls + ' w-[120px] tracking-widest'} />
          <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="PIN 확인" className={inputCls + ' w-[120px] tracking-widest'} />
          <Button onClick={setNewPin}>설정</Button>
        </div>
      )}
      {msg && <div className="text-[12px] text-sub mt-2">{msg}</div>}
    </Card>
  )
}

function CloudSection() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [cloudAt, setCloudAt] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user?.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserEmail(session?.user?.email ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userEmail) { setCloudAt(null); return }
    supabase.from('backups').select('updated_at').maybeSingle().then(({ data }) => setCloudAt((data as { updated_at?: string } | null)?.updated_at ?? null))
  }, [userEmail, msg])

  async function signup() {
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email, password: pw })
    setBusy(false)
    if (error) return setMsg('회원가입 실패: ' + error.message)
    setMsg(data.session ? '가입 & 로그인 완료.' : '가입됨! 이메일 인증이 필요할 수 있어요. 메일 확인 후 로그인하거나, Supabase Auth 설정에서 이메일 인증을 꺼도 돼요.')
  }
  async function login() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    setMsg(error ? '로그인 실패: ' + error.message : '로그인 완료.')
  }
  async function logout() { await supabase.auth.signOut(); setMsg('로그아웃했어요.') }

  async function upload() {
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const payload = await repo.exportAll()
      const { error } = await supabase.from('backups').upsert({ user_id: user.id, data: payload, updated_at: new Date().toISOString() })
      setMsg(error ? '업로드 실패: ' + error.message : '☁️ 클라우드에 올렸어요.')
    } finally { setBusy(false) }
  }
  async function download() {
    if (!confirm('클라우드 데이터로 이 기기를 덮어씁니다. 계속할까요?')) return
    setBusy(true)
    try {
      const { data, error } = await supabase.from('backups').select('data').maybeSingle()
      if (error) return setMsg('다운로드 실패: ' + error.message)
      if (!data) return setMsg('클라우드에 저장된 데이터가 없어요. 먼저 올리기를 하세요.')
      await repo.importAll((data as { data: Record<string, unknown> }).data)
      setMsg('받았어요. 새로고침할게요…')
      setTimeout(() => location.reload(), 800)
    } finally { setBusy(false) }
  }

  return (
    <Card className="mb-3.5">
      <CardLabel>☁️ 클라우드 동기화 (다기기)</CardLabel>
      {!userEmail ? (
        <>
          <p className="text-[12px] text-sub mb-2">로그인하면 폰·PC에서 데이터를 올리고 받을 수 있어요. (처음이면 회원가입)</p>
          <div className="flex gap-2 flex-wrap">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" className={inputCls + ' flex-1 min-w-[140px]'} />
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호(6자+)" className={inputCls + ' flex-1 min-w-[140px]'} />
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={login} disabled={busy}>로그인</Button>
            <Button variant="line" onClick={signup} disabled={busy}>회원가입</Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Cloud size={16} className="text-mint-d" />
            <span className="text-[13px] font-semibold">{userEmail}</span>
            <div className="flex-1" />
            <button onClick={logout} className="text-[12px] text-sub hover:text-ink">로그아웃</button>
          </div>
          <div className="text-[12px] text-sub mb-2">클라우드 최신 저장: {cloudAt ? new Date(cloudAt).toLocaleString('ko-KR') : '없음'}</div>
          <div className="flex gap-2">
            <Button onClick={upload} disabled={busy}><Upload size={14} className="inline -mt-0.5 mr-1" />올리기(백업)</Button>
            <Button variant="line" onClick={download} disabled={busy}><Download size={14} className="inline -mt-0.5 mr-1" />받기(복원)</Button>
          </div>
        </>
      )}
      {msg && <div className="mt-3 text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2">{msg}</div>}
    </Card>
  )
}
