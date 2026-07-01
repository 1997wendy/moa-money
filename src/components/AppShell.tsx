// 좌측 사이드바 + 사용자 전환 + 콘텐츠 영역
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutGrid,
  Notebook,
  PieChart,
  Calendar,
  Receipt,
  TrendingUp,
  CreditCard,
} from 'lucide-react'
import { useProfile } from '../state/profile'

const nav = [
  { to: '/', label: '대시보드', icon: LayoutGrid, end: true },
  { to: '/ledger', label: '가계부', icon: Notebook },
  { to: '/assets', label: '자산', icon: PieChart },
  { to: '/calendar', label: '캘린더', icon: Calendar },
  { to: '/receivables', label: '받을돈 정산', icon: Receipt },
  { to: '/stats', label: '통계·목표', icon: TrendingUp },
  { to: '/cards', label: '카드혜택', icon: CreditCard },
]

export default function AppShell() {
  const { profiles, profileId, setProfileId } = useProfile()

  return (
    <div className="flex min-h-full">
      {/* 사이드바 */}
      <aside className="w-[212px] shrink-0 bg-surface border-r border-line flex flex-col fixed inset-y-0 left-0">
        <div className="px-5 py-4 font-extrabold text-[15px] tracking-tight">
          💰 머니앱
        </div>

        {/* 사용자 전환 */}
        <div className="px-3 mb-3">
          <div className="bg-mint-l rounded-[12px] p-3">
            <div className="text-[11px] font-bold text-mint-d mb-1.5">사용자</div>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              className="w-full border border-line rounded-[8px] px-2 py-2 text-[13px] font-bold bg-surface outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav className="px-3 flex-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-semibold mb-0.5 transition-colors ${
                  isActive
                    ? 'bg-mint text-white'
                    : 'text-sub hover:bg-canvas hover:text-ink'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-3 text-[11px] text-sub border-t border-line">
          로컬 저장 · v0.2
        </div>
      </aside>

      {/* 콘텐츠 */}
      <main className="flex-1 ml-[212px] p-7 max-w-[1000px]">
        <Outlet />
      </main>
    </div>
  )
}
