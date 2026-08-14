// 비밀 URL(/s/:token)로 들어온 사람이 보는 화면.
// 로그인 게이트 바깥에 있어서 모아에 가입하지 않아도 열린다. 항상 읽기 전용.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicShare, type PublicSharePayload } from '../lib/sharing'
import ShareReadOnly, { shareTotalAssets, type SharedData } from '../components/ShareReadOnly'
import { compact } from '../lib/format'
import Logo from '../components/Logo'

export default function PublicShareView() {
  const { token } = useParams()
  const [payload, setPayload] = useState<PublicSharePayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPublicShare(token ?? '').then((p) => { if (alive) { setPayload(p); setLoading(false) } })
    return () => { alive = false }
  }, [token])

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-[560px] mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-4"><Logo /></div>
        {children}
      </div>
    </div>
  )

  if (loading) return shell(<div className="text-sub text-[13px] py-10 text-center">불러오는 중…</div>)

  if (!payload) return shell(
    <div className="text-center py-12">
      <div className="text-[15px] font-bold mb-1.5">링크를 열 수 없어요</div>
      <div className="text-[13px] text-sub leading-relaxed">
        주소가 잘못됐거나, <b>기한이 지났거나</b>, 만든 사람이 링크를 삭제했어요.<br />공유해 준 분에게 새 링크를 요청하세요.
      </div>
    </div>
  )

  const data = payload.data as SharedData
  const updated = payload.updated_at?.slice(0, 10).replace(/-/g, '.')

  return shell(
    <>
      <div className="mb-3.5">
        <div className="text-[19px] font-extrabold">{payload.profile_name}</div>
        <div className="text-[12px] text-sub mt-0.5">공유받은 화면 · 읽기 전용{updated ? ` · ${updated} 기준` : ''}</div>
      </div>

      <ShareReadOnly data={data} perms={payload.menu_perms ?? {}} />

      <div className="text-[11px] text-sub text-center mt-2 leading-relaxed">
        이 화면은 <b>읽기 전용</b>이고, 공유한 사람이 <b>보이기로 정한 항목만</b> 담겨 있어요.<br />
        표시 자산 합계 {compact(shareTotalAssets(data))}
      </div>
    </>,
  )
}
