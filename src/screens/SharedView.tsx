import { useParams, Link } from 'react-router-dom'
import { useSharedToMe } from '../hooks/useSharedToMe'
import { compact } from '../lib/format'
import { PageHeader, Empty } from '../components/ui'
import ShareReadOnly, { shareTotalAssets, type SharedData } from '../components/ShareReadOnly'

export default function SharedView() {
  const { id } = useParams()
  const { shares, loading } = useSharedToMe()
  const share = shares.find((s) => s.id === id)

  if (loading) return <div className="text-sub text-[13px] py-10 text-center">불러오는 중…</div>
  if (!share) return (
    <div>
      <PageHeader title="공유 뷰" />
      <Empty>공유를 찾을 수 없어요. (로그인 이메일이 공유받은 이메일과 같은지 확인하세요.)<br /><Link to="/" className="text-mint-d font-bold">홈으로</Link></Empty>
    </div>
  )

  const data = share.data as SharedData
  const perms = share.menu_perms ?? {}
  const canEdit = (k: string) => perms[k] === 'edit'

  return (
    <div>
      <PageHeader title={`${share.profile_name} (공유)`} desc={`${share.owner_email ?? '소유자'} 님이 공유 · 읽기 전용`} />

      <ShareReadOnly
        data={data}
        perms={perms}
        badge={(k) => canEdit(k)
          ? <span className="text-[10px] font-bold text-mint-d bg-mint-l px-1.5 py-0.5 rounded ml-1.5">수정 권한(곧 지원)</span>
          : null}
      />

      <div className="text-[11px] text-sub text-center mt-2">이 화면은 <b>읽기 전용</b>이에요. 수정 권한 편집 기능은 다음 업데이트에서 열려요. · 표시 자산 합계 {compact(shareTotalAssets(data))}</div>
    </div>
  )
}
