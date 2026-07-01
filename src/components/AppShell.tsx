// 좌측 사이드바(그룹화) + 사용자 전환 + 콘텐츠 영역
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutGrid, Notebook, PieChart, Calendar, Receipt, TrendingUp, CreditCard, Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProfile } from '../state/profile'

interface Item { key: string; to: string; label: string; icon: LucideIcon; end?: boolean; hideable?: boolean }
interface Group { title?: string; items: Item[] }

export const HIDEABLE: { key: string; label: string }[] = [
  { key: 'ledger', label: '가계부' },
  { key: 'receivables', label: '정산' },
  { key: 'assets', label: '자산' },
  { key: 'calendar', label: '캘린더' },
  { key: 'stats', label: '통계·목표' },
  { key: 'cards', label: '카드혜택' },
]

const GROUPS: Group[] = [
  { items: [{ key: 'dashboard', to: '/', label: '대시보드', icon: LayoutGrid, end: true }] },
  {
    title: '돈 관리',
    items: [
      { key: 'ledger', to: '/ledger', label: '가계부', icon: Notebook, hideable: true },
      { key: 'receivables', to: '/receivables', label: '정산', icon: Receipt, hideable: true },
      { key: 'assets', to: '/assets', label: '자산', icon: PieChart, hideable: true },
    ],
  },
  { title: '일정', items: [{ key: 'calendar', to: '/calendar', label: '캘린더', icon: Calendar, hideable: true }] },
  {
    title: '분석',
    items: [
      { key: 'stats', to: '/stats', label: '통계·목표', icon: TrendingUp, hideable: true },
      { key: 'cards', to: '/cards', label: '카드혜택', icon: CreditCard, hideable: true },
    ],
  },
]

export default function AppShell() {
  const { profiles, profileId, profile, setProfileId } = useProfile()
  const hidden = new Set(profile?.hiddenMenus ?? [])

  return (
    <div className="flex min-h-full">
      <aside className="w-[212px] shrink-0 bg-surface border-r border-line flex flex-col fixed inset-y-0 left-0 overflow-y-auto">
        <div className="px-5 py-4 font-extrabold text-[15px] tracking-tight">💰 머니앱</div>

        <div className="px-3 mb-3">
          <div className="bg-mint-l rounded-[12px] p-3">
            <div className="text-[11px] font-bold text-mint-d mb-1.5">사용자</div>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="w-full border border-line rounded-[8px] px-2 py-2 text-[13px] font-bold bg-surface outline-none">
              {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
        </div>

        <nav className="px-3 flex-1">
          {GROUPS.map((g, gi) => {
            const items = g.items.filter((it) => !(it.hideable && hidden.has(it.key)))
            if (items.length === 0) return null
            return (
              <div key={gi} className="mb-1.5">
                {g.title && <div className="text-[10.5px] font-bold text-sub/70 px-3 pt-2 pb-1 uppercase tracking-wide">{g.title}</div>}
                {items.map((it) => <NavItem key={it.key} item={it} />)}
              </div>
            )
          })}
        </nav>

        <div className="px-3 pb-2 border-t border-line pt-2">
          <NavItem item={{ key: 'settings', to: '/settings', label: '설정', icon: Settings }} />
        </div>
        <div className="px-5 py-2 text-[11px] text-sub">로컬 저장 · v0.3</div>
      </aside>

      <main className="flex-1 ml-[212px] px-7 pt-7 pb-28 max-w-[1000px]">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({ item }: { item: Item }) {
  const { icon: Icon, to, label, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[13.5px] font-semibold mb-0.5 transition-colors ${
          isActive ? 'bg-mint text-white' : 'text-sub hover:bg-canvas hover:text-ink'
        }`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  )
}
