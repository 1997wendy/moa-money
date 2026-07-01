import { useRef, useState } from 'react'
import { Download, Upload, Trash2, Plus, Lock } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
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
      <PageHeader title="설정" desc={`${profile?.name ?? ''} 프로필`} />

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
        <CardLabel>메뉴 표시 ({profile?.name})</CardLabel>
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
      <CardLabel>🔒 PIN 잠금 ({profile?.name})</CardLabel>
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
