import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { repo } from '../db/repository'
import { todayISO } from '../lib/format'
import { Card, CardLabel, PageHeader, Button } from '../components/ui'

export default function DataBackup() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

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
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.app !== 'money-app') {
        setMsg('⚠️ 이 앱의 백업 파일이 아니에요.')
        return
      }
      if (!confirm('현재 데이터를 모두 지우고 이 백업으로 덮어씁니다. 계속할까요?')) return
      await repo.importAll(data)
      setMsg('불러오기 완료 — 새로고침하면 반영돼요.')
      setTimeout(() => location.reload(), 800)
    } catch {
      setMsg('⚠️ 파일을 읽지 못했어요. JSON 형식인지 확인하세요.')
    }
  }

  return (
    <div>
      <PageHeader title="데이터 백업" desc="로컬 저장이라, 정기적으로 백업 파일을 저장해 두세요" />

      <Card>
        <CardLabel>내보내기</CardLabel>
        <p className="text-[13px] text-sub mb-3">모든 데이터를 JSON 파일 하나로 저장해요. (다른 기기로 옮기거나 백업용)</p>
        <Button onClick={exportJson}><Download size={15} className="inline -mt-0.5 mr-1.5" />백업 파일 내보내기</Button>
      </Card>

      <Card className="mt-3.5">
        <CardLabel>불러오기</CardLabel>
        <p className="text-[13px] text-sub mb-3">백업 파일을 선택하면 현재 데이터를 <b className="text-expense">전부 덮어씁니다.</b></p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
        />
        <Button variant="line" onClick={() => fileRef.current?.click()}><Upload size={15} className="inline -mt-0.5 mr-1.5" />백업 파일 불러오기</Button>
      </Card>

      {msg && <div className="mt-4 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{msg}</div>}

      <Card className="mt-3.5">
        <CardLabel>ℹ️ 참고</CardLabel>
        <p className="text-[13px] text-sub">
          지금은 데이터가 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니, 가끔 <b className="text-ink">내보내기</b>로 백업해 두는 걸 권장해요.
          여러 기기에서 자동 동기화가 필요해지면 클라우드로 전환할 수 있어요.
        </p>
      </Card>
    </div>
  )
}
