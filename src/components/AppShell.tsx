// 반응형 레이아웃: 데스크톱=고정 사이드바 / 모바일=햄버거 드로어
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Notebook, PieChart, Calendar, Receipt, TrendingUp, CreditCard, Settings, Lock, LineChart, Menu, X, Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProfile } from '../state/profile'
import { useSyncManager } from '../hooks/useSyncManager'
import { useNetWorthSnapshot } from '../hooks/useNetWorthSnapshot'
import { useSharedToMe } from '../hooks/useSharedToMe'
import { SHARED_PREFIX } from '../db/repository'
import Logo from './Logo'

interface Item { key: string; to: string; label: string; icon: LucideIcon; end?: boolean; hideable?: boolean }
interface Group { title?: string; items: Item[] }

export const HIDEABLE: { key: string; label: string }[] = [
  { key: 'ledger', label: '가계부' },
  { key: 'receivables', label: '정산' },
  { key: 'assets', label: '자산' },
  { key: 'calendar', label: '캘린더' },
  { key: 'subscription', label: '청약' },
  { key: 'stats', label: '통계·목표' },
  { key: 'invest', label: '투자' },
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
  {
    title: '일정',
    items: [
      { key: 'calendar', to: '/calendar', label: '캘린더', icon: Calendar, hideable: true },
      { key: 'subscription', to: '/subscription', label: '청약', icon: Building2, hideable: true },
    ],
  },
  {
    title: '분석',
    items: [
      { key: 'stats', to: '/stats', label: '통계·목표', icon: TrendingUp, hideable: true },
      { key: 'invest', to: '/invest', label: '투자', icon: LineChart, hideable: true },
      { key: 'cards', to: '/cards', label: '카드혜택', icon: CreditCard, hideable: true },
    ],
  },
]

export default function AppShell() {
  const { profiles, profileId, profile, setProfileId, isLocked, shared, enterShared, exitShared } = useProfile()
  const { shares } = useSharedToMe() // 나에게 공유된 프로필들 (프로필 드롭다운에 같이 노출)
  useSyncManager()
  useNetWorthSnapshot() // 앱 열면 이 달 순자산 자동 기록
  const location = useLocation()
  // 메뉴 이동하면 항상 화면 맨 위부터 (모바일에서 스크롤 위치가 남는 문제)
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  const [drawer, setDrawer] = useState(false)
  // 공유받은 프로필을 보는 중이면, 그 사람이 '보이기'로 정한 메뉴만 남긴다
  const hidden = shared
    ? new Set(HIDEABLE.map((m) => m.key).filter((k) => {
      const v = shared.menuPerms?.[k]
      return v !== 'read' && v !== 'edit'
    }))
    : new Set(profile?.hiddenMenus ?? [])
  const locked = isLocked(profileId)
  const close = () => setDrawer(false)

  /** 프로필 드롭다운 선택 — 공유받은 것이면 열람 모드로, 아니면 내 프로필로 */
  const pickProfile = (value: string) => {
    if (value.startsWith(SHARED_PREFIX)) {
      const s = shares.find((x) => SHARED_PREFIX + x.id === value)
      if (s) {
        enterShared({
          shareId: s.id, ownerEmail: s.owner_email, profileName: s.profile_name,
          menuPerms: s.menu_perms ?? {}, data: s.data ?? {},
        })
      }
      return
    }
    if (shared) exitShared()
    setProfileId(value)
  }

  return (
    <div className="min-h-full">
      {/* 모바일 상단바 */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-surface border-b border-line flex items-center gap-3 px-4">
        <button onClick={() => setDrawer(true)} aria-label="메뉴" className="p-1 -ml-1 text-ink"><Menu size={22} /></button>
        <Logo size={22} />
        <span className="font-extrabold text-[16px]">모아</span>
      </header>

      {/* 드로어 배경 */}
      {drawer && <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={close} />}

      {/* 사이드바 (모바일=드로어) */}
      <aside className={`w-[240px] md:w-[212px] bg-surface border-r border-line flex flex-col fixed inset-y-0 left-0 z-50 overflow-y-auto transition-transform duration-200 md:translate-x-0 ${drawer ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="px-5 py-4 flex items-center gap-2">
          <Logo size={26} />
          <span className="font-extrabold text-[16px] tracking-tight">모아</span>
          <button onClick={close} className="md:hidden ml-auto text-sub p-1"><X size={20} /></button>
        </div>

        <div className="px-3 mb-3">
          <div className="bg-mint-l rounded-[12px] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-mint-d">프로필</span>
              <NavLink to="/settings#account" onClick={close} className="text-[11px] font-bold text-mint-d hover:underline">관리 ›</NavLink>
            </div>
            <select value={profileId} onChange={(e) => pickProfile(e.target.value)} className="w-full border border-line rounded-[8px] px-3 py-2 text-[13px] font-bold bg-surface outline-none">
              {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              {shares.length > 0 && (
                <optgroup label="공유받음">
                  {shares.map((s) => (
                    <option key={s.id} value={SHARED_PREFIX + s.id}>
                      {s.profile_name} ({s.owner_email ?? '공유'})
                    </option>
                  ))}
                </optgroup>
              )}
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
                {items.map((it) => <NavItem key={it.key} item={it} onClick={close} />)}
              </div>
            )
          })}
        </nav>

        <div className="px-3 pb-2 border-t border-line pt-2">
          <NavItem item={{ key: 'settings', to: '/settings', label: '설정', icon: Settings }} onClick={close} />
        </div>
        <div className="px-5 py-2 text-[11px] text-sub">v0.3</div>
      </aside>

      {/* 사이드바(212px) 공간만 확보하고, 본문은 남는 영역 가운데 정렬 (오른쪽 쏠림 방지) */}
      <main className="md:pl-[212px] pt-[72px] md:pt-7 pb-28">
        <div className="max-w-[1000px] mx-auto px-4 md:px-7">
          {/* 공유받은 프로필을 보는 중 — 내 데이터가 아니고, 고쳐도 저장되지 않는다는 걸 항상 보이게 */}
          {shared && (
            <div className="mb-3.5 flex items-center gap-2 flex-wrap bg-mint-l border border-mint/40 rounded-xl px-3.5 py-2.5">
              <span className="text-[13px] font-bold text-mint-d">
                👀 {shared.ownerEmail ?? '상대'} 님의 <b>{shared.profileName}</b> 프로필을 보는 중
              </span>
              <span className="text-[11.5px] text-sub">· 읽기 전용 (고쳐도 저장되지 않아요)</span>
              <button onClick={exitShared} className="ml-auto text-[12px] font-bold text-mint-d bg-surface border border-line rounded-lg px-2.5 py-1.5">
                내 프로필로 돌아가기
              </button>
            </div>
          )}
          {locked ? <LockScreen /> : <Outlet />}
        </div>
      </main>
    </div>
  )
}

function LockScreen() {
  const { profileId, profile, unlock } = useProfile()
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)

  async function tryUnlock() {
    const ok = await unlock(profileId, pin)
    if (!ok) { setErr(true); setPin('') }
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-mint-l text-mint-d flex items-center justify-center mb-4"><Lock size={26} /></div>
      <div className="text-[17px] font-bold mb-1">{profile?.name} 프로필이 잠겨 있어요</div>
      <div className="text-[13px] text-sub mb-4">PIN을 입력하면 열려요.</div>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => { setPin(e.target.value); setErr(false) }}
        onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
        placeholder="PIN"
        className={`w-[200px] text-center tracking-[0.4em] text-[18px] border rounded-[10px] px-3 py-2.5 outline-none ${err ? 'border-expense' : 'border-line focus:border-mint'}`}
      />
      {err && <div className="text-[12px] text-expense mt-2">PIN이 맞지 않아요.</div>}
      <button onClick={tryUnlock} className="mt-4 bg-mint text-white font-bold text-[14px] rounded-[10px] px-6 py-2.5 hover:bg-mint-d">열기</button>
    </div>
  )
}

function NavItem({ item, onClick }: { item: Item; onClick?: () => void }) {
  const { icon: Icon, to, label, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
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
