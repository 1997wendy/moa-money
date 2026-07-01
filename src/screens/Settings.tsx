import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { todayISO } from '../lib/format'
import { HIDEABLE } from '../components/AppShell'
import { Card, CardLabel, PageHeader, Button } from '../components/ui'

export default function Settings() {
  const { profile } = useProfile()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const hidden = new Set(profile?.hiddenMenus ?? [])

  async function toggleMenu(key: string) {
    if (!profile) return
    const next = new Set(profile.hiddenMenus ?? [])
    next.has(key) ? next.delete(key) : next.add(key)
    await repo.upsertProfile({ ...profile, hiddenMenus: Array.from(next) })
  }

  async function exportJson() {
    const data = await repo.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `money-app-backup-${todayISO()}.json`
    a.click()
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

      <Card>
        <CardLabel>메뉴 표시 ({profile?.name})</CardLabel>
        <p className="text-[12px] text-sub mb-2">이 프로필에서 안 쓰는 메뉴는 꺼두면 사이드바에서 숨겨져요. (프로필마다 따로 설정)</p>
        {HIDEABLE.map((m) => {
          const on = !hidden.has(m.key)
          return (
            <div key={m.key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
              <span className="text-[13.5px] font-semibold">{m.label}</span>
              <button
                onClick={() => toggleMenu(m.key)}
                className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-mint' : 'bg-line'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </Card>

      <Card className="mt-3.5">
        <CardLabel>데이터 백업</CardLabel>
        <p className="text-[13px] text-sub mb-3">로컬 저장이라, 가끔 백업 파일로 내보내 두세요. 브라우저 데이터를 지우면 사라져요.</p>
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
