import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Trash2, Plus, Cloud } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { supabase } from '../lib/supabase'
import { pushNow, pullForce } from '../lib/cloudSync'
import { useNavigate } from 'react-router-dom'
import { createShare, listMyShares, revokeShare, listSharedToMe, SHARE_MENUS, type Share, type MenuPerm, type MenuPerms } from '../lib/sharing'
import { hashPin } from '../lib/pin'
import { todayISO } from '../lib/format'
import { HIDEABLE } from '../components/AppShell'
import { Card, CardLabel, PageHeader, Button, Field, inputCls } from '../components/ui'

type Tab = 'data' | 'account' | 'share' | 'menu'
const TABS: [Tab, string][] = [['data', '데이터·백업'], ['account', '사용자·잠금'], ['share', '공유'], ['menu', '메뉴 표시']]

export default function Settings() {
  const { profiles, profile, profileId, setProfileId } = useProfile()
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.replace('#', '')
    return (['data', 'account', 'share', 'menu'].includes(h) ? h : 'data') as Tab
  })
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
      <PageHeader title="설정" desc="계정·사용자·잠금·백업" />

      <div className="flex bg-canvas rounded-[10px] p-1 mb-4 w-fit">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-colors ${tab === k ? 'bg-surface shadow-sm text-ink' : 'text-sub'}`}>{label}</button>
        ))}
      </div>

      {tab === 'data' && (
        <>
          <CloudSection />
          <Card>
            <CardLabel>💾 파일 백업 (오프라인·계정 없이)</CardLabel>
            <p className="text-[12px] text-sub mb-3"><b className="text-ink">클라우드 동기화(위)</b>는 계정으로 여러 기기 자동 보관, <b className="text-ink">파일 백업</b>은 로그인 없이 내 파일(JSON)로 보관하는 방식이에요.</p>
            <div className="flex gap-2">
              <Button variant="line" onClick={exportJson}><Download size={15} className="inline -mt-0.5 mr-1.5" />내보내기</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              <Button variant="line" onClick={() => fileRef.current?.click()}><Upload size={15} className="inline -mt-0.5 mr-1.5" />불러오기</Button>
            </div>
            {msg && <div className="mt-3 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}
          </Card>
        </>
      )}

      {tab === 'account' && (
        <>
          <Card className="mb-3.5">
            <CardLabel>👥 사용자 관리</CardLabel>
            <p className="text-[12px] text-sub mb-2">본인·동생 등 프로필을 추가/이름변경/삭제해요.</p>
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0">
                <input defaultValue={p.name} onBlur={(e) => rename(p.id, e.target.value.trim() || p.name)} className={inputCls + ' flex-1'} />
                <button onClick={() => removeProfile(p.id)} className="text-sub hover:text-expense p-1"><Trash2 size={16} /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addProfile()} placeholder="새 사용자 이름" className={inputCls + ' flex-1'} />
              <Button onClick={addProfile}><Plus size={15} className="inline -mt-0.5 mr-1" />추가</Button>
            </div>
          </Card>
          <Card>
            <CardLabel>🔒 PIN 잠금</CardLabel>
            <PinBody />
          </Card>
        </>
      )}

      {tab === 'share' && <ShareSection />}

      {tab === 'menu' && (
        <Card>
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
      )}
    </div>
  )
}

function PinBody() {
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
    <div>
      <p className="text-[12px] text-sub mb-3">잠그면 이 프로필로 들어올 때 PIN이 필요해요. <b>가벼운 잠금</b>이라 완벽한 보안은 아니에요.</p>
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
    </div>
  )
}

function CloudSection() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [newPw, setNewPw] = useState('')
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
    setMsg(data.session ? '가입 & 로그인 완료.' : '가입됨! 인증 메일을 보냈어요. 메일의 링크를 눌러 인증한 뒤 로그인해 주세요.')
  }
  async function login() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    setMsg(error ? '로그인 실패: ' + error.message : '로그인 완료.')
  }
  async function logout() { await supabase.auth.signOut(); setMsg('로그아웃했어요.') }
  async function forgot() {
    if (!email) return setMsg('이메일을 먼저 입력하세요.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/settings' })
    setMsg(error ? '재설정 메일 실패: ' + error.message : '재설정 메일을 보냈어요. 메일 링크로 돌아와 새 비밀번호를 설정하세요.')
  }
  async function changePw() {
    if (newPw.length < 6) return setMsg('새 비밀번호는 6자 이상으로.')
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setNewPw('')
    setMsg(error ? '변경 실패: ' + error.message : '비밀번호를 변경했어요.')
  }
  async function deleteCloud() {
    if (!confirm('클라우드에 저장된 데이터를 삭제하고 로그아웃할까요? (이 기기의 로컬 데이터는 그대로 남아요)')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('backups').delete().eq('user_id', user.id)
    await supabase.auth.signOut()
    setMsg('클라우드 데이터를 삭제하고 로그아웃했어요.')
  }

  async function upload() {
    setBusy(true)
    const r = await pushNow()
    setBusy(false)
    setMsg(r === 'ok' ? '☁️ 클라우드에 올렸어요.' : '업로드 실패')
  }
  async function download() {
    if (!confirm('클라우드 데이터로 이 기기를 덮어씁니다. 계속할까요?')) return
    setBusy(true)
    const r = await pullForce()
    setBusy(false)
    if (r === 'pulled') { setMsg('받았어요. 새로고침할게요…'); setTimeout(() => location.reload(), 800) }
    else setMsg('클라우드에 저장된 데이터가 없어요. 먼저 올리기를 하세요.')
  }

  return (
    <Card className="mb-3.5">
      <CardLabel>☁️ 클라우드 동기화 (다기기)</CardLabel>
      {!userEmail ? (
        <>
          <p className="text-[12px] text-sub mb-2">로그인하면 폰·PC에서 데이터를 올리고 받을 수 있어요. 비밀번호는 <b className="text-ink">암호화(bcrypt)</b>되어 저장돼요.</p>
          <div className="flex gap-2 flex-wrap">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" className={inputCls + ' flex-1 min-w-[140px]'} />
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호(6자+)" className={inputCls + ' flex-1 min-w-[140px]'} />
          </div>
          <div className="flex gap-2 mt-2 items-center">
            <Button onClick={login} disabled={busy}>로그인</Button>
            <Button variant="line" onClick={signup} disabled={busy}>회원가입</Button>
            <div className="flex-1" />
            <button onClick={forgot} className="text-[12px] text-sub hover:text-ink underline">비밀번호를 잊으셨나요?</button>
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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-mint-d bg-mint-l px-2 py-0.5 rounded-full">⟳ 자동 동기화 켜짐</span>
            <span className="text-[12px] text-sub">최신 저장 {cloudAt ? new Date(cloudAt).toLocaleString('ko-KR') : '없음'}</span>
          </div>
          <p className="text-[12px] text-sub mb-2">데이터가 바뀌면 자동으로 올라가고, 다른 기기에서 열면 자동으로 최신을 받아와요. 아래 버튼은 즉시 실행·문제 정리용이에요.</p>
          <div className="flex gap-2">
            <Button onClick={upload} disabled={busy}><Upload size={14} className="inline -mt-0.5 mr-1" />지금 올리기</Button>
            <Button variant="line" onClick={download} disabled={busy}><Download size={14} className="inline -mt-0.5 mr-1" />클라우드로 덮어쓰기</Button>
          </div>

          <div className="mt-4 pt-3 border-t border-line">
            <div className="text-[12px] font-semibold text-sub mb-1.5">비밀번호 변경</div>
            <div className="flex gap-2">
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새 비밀번호(6자+)" className={inputCls + ' flex-1'} />
              <Button variant="line" onClick={changePw}>변경</Button>
            </div>
            <button onClick={deleteCloud} className="text-[12px] text-expense hover:underline mt-3">클라우드 데이터 삭제 · 로그아웃</button>
          </div>
        </>
      )}
      {msg && <div className="mt-3 text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2">{msg}</div>}
    </Card>
  )
}

const PERM_OPTS: [MenuPerm, string][] = [['hidden', '숨김'], ['read', '읽기'], ['edit', '수정']]
const defaultPerms = (): MenuPerms => Object.fromEntries(SHARE_MENUS.map((m) => [m.key, 'read'])) as MenuPerms

function ShareSection() {
  const { profiles } = useProfile()
  const nav = useNavigate()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [profileId, setProfileId] = useState('')
  const [target, setTarget] = useState('')
  const [perms, setPerms] = useState<MenuPerms>(defaultPerms())
  const [shares, setShares] = useState<Share[]>([])
  const [received, setReceived] = useState<Share[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user?.email ?? null)) }, [])
  useEffect(() => { if (userEmail) refresh() }, [userEmail])
  useEffect(() => { if (profiles.length && !profileId) setProfileId(profiles[0].id) }, [profiles, profileId])
  async function refresh() {
    setShares(await listMyShares())
    const all = await listSharedToMe()
    setReceived(all.filter((s) => s.owner_email !== userEmail)) // 내가 나한테 한 건 제외
  }

  const setPerm = (key: string, v: MenuPerm) => setPerms((p) => ({ ...p, [key]: v }))
  const setAll = (v: MenuPerm) => setPerms(Object.fromEntries(SHARE_MENUS.map((m) => [m.key, v])) as MenuPerms)

  function resetForm() {
    setEditingId(null); setTarget(''); setPerms(defaultPerms())
    if (profiles[0]) setProfileId(profiles[0].id)
  }
  async function create() {
    const p = profiles.find((x) => x.id === profileId)
    if (!p || !target.trim()) { setMsg('프로필과 상대 이메일을 확인하세요.'); return }
    setBusy(true)
    const r = await createShare({ profileId: p.id, profileName: p.name, targetEmail: target, menuPerms: perms })
    setBusy(false)
    if (r === 'ok') { setMsg(editingId ? '공유를 수정했어요.' : `'${p.name}' 프로필을 ${target}에게 공유했어요.`); resetForm(); refresh() }
    else if (r === 'noauth') setMsg('먼저 데이터·백업 탭에서 로그인하세요.')
    else setMsg('공유 실패. 상대 이메일/네트워크를 확인하세요.')
  }
  async function revoke(id: string) { if (!confirm('이 공유를 삭제할까요?')) return; await revokeShare(id); if (editingId === id) resetForm(); refresh() }
  function editShare(s: Share) {
    setEditingId(s.id); setTarget(s.target_email)
    setPerms({ ...defaultPerms(), ...(s.menu_perms ?? {}) })
    const p = profiles.find((x) => x.name === s.profile_name)
    if (p) setProfileId(p.id)
    setMsg(''); window.scrollTo(0, 0)
  }

  const summary = (s: Share) => {
    const mp = s.menu_perms ?? {}
    const edit = Object.values(mp).filter((v) => v === 'edit').length
    const read = Object.values(mp).filter((v) => v === 'read').length
    const hidden = Object.values(mp).filter((v) => v === 'hidden').length
    return `읽기 ${read} · 수정 ${edit} · 숨김 ${hidden}`
  }

  if (!userEmail) return (
    <Card><CardLabel>🤝 공유</CardLabel><p className="text-[13px] text-sub">공유하려면 먼저 <b>데이터·백업</b> 탭에서 <b>로그인</b>하세요.</p></Card>
  )

  return (
    <>
      <Card className="mb-3.5">
        <CardLabel>{editingId ? '✏️ 공유 수정 중' : '🤝 새 공유 만들기'}</CardLabel>
        <p className="text-[12px] text-sub mb-3">내 프로필을 다른 사람 이메일로 공유해요. 상대가 그 이메일로 로그인하면 <b className="text-ink">메뉴별 권한대로</b> 보게 돼요.</p>
        <Field label="공유할 프로필"><select value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={!!editingId} className={inputCls + (editingId ? ' bg-canvas text-sub' : '')}>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="상대 이메일"><input value={target} onChange={(e) => setTarget(e.target.value)} disabled={!!editingId} placeholder="sibling@email.com" className={inputCls + (editingId ? ' bg-canvas text-sub' : '')} /></Field>

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold text-sub">메뉴별 권한</span>
          <div className="flex gap-1">
            {PERM_OPTS.map(([v, l]) => <button key={v} onClick={() => setAll(v)} className="text-[11px] text-sub border border-line rounded-md px-1.5 py-0.5 hover:bg-canvas">전체 {l}</button>)}
          </div>
        </div>
        <div className="space-y-1.5 mb-3">
          {SHARE_MENUS.map((m) => (
            <div key={m.key} className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">{m.label}</span>
              <div className="flex bg-canvas rounded-lg p-0.5">
                {PERM_OPTS.map(([v, l]) => (
                  <button key={v} onClick={() => setPerm(m.key, v)} className={`px-2.5 py-1 rounded-md text-[12px] font-bold transition-colors ${perms[m.key] === v ? (v === 'hidden' ? 'bg-ink text-white' : v === 'edit' ? 'bg-mint text-white' : 'bg-surface shadow-sm text-ink') : 'text-sub'}`}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={create} disabled={busy}>{editingId ? '수정 저장' : '공유 만들기'}</Button>
          {editingId && <Button variant="line" onClick={resetForm}>취소</Button>}
        </div>
        {msg && <div className="mt-3 text-[12.5px] bg-mint-l text-mint-d rounded-lg px-3 py-2">{msg}</div>}
      </Card>

      <Card>
        <CardLabel>공유 중인 목록</CardLabel>
        {shares.length === 0 ? <p className="text-[13px] text-sub">아직 공유한 게 없어요. 위에서 만들어 보세요.</p> : (
          shares.map((s) => (
            <div key={s.id} className={`flex items-center justify-between py-2 border-b border-line last:border-0 ${editingId === s.id ? 'bg-mint-l -mx-2 px-2 rounded-lg' : ''}`}>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{s.profile_name} → {s.target_email}</div>
                <div className="text-[11px] text-sub">{summary(s)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => editShare(s)} className="text-[12px] font-bold text-mint-d border border-line rounded-lg px-2.5 py-1 hover:bg-canvas">수정</button>
                <button onClick={() => revoke(s.id)} className="text-sub hover:text-expense p-1"><Trash2 size={16} /></button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="mt-3.5">
        <CardLabel>나에게 공유된 프로필</CardLabel>
        {received.length === 0 ? <p className="text-[13px] text-sub">받은 공유가 없어요.</p> : (
          received.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <div>
                <div className="text-[13.5px] font-semibold">{s.profile_name}</div>
                <div className="text-[11px] text-sub">{s.owner_email ?? '상대'} 님이 공유 · {summary(s)}</div>
              </div>
              <button onClick={() => nav(`/shared/${s.id}`)} className="text-[12px] font-bold text-white bg-mint rounded-lg px-3 py-1.5 hover:bg-mint-d">보기</button>
            </div>
          ))
        )}
      </Card>
    </>
  )
}
