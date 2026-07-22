import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useConveyorStore } from '../../store/useConveyorStore'

type NavAccent = 'cyan' | 'teal' | 'amber' | 'violet' | 'sky' | 'rose' | 'emerald'
type NavIconName = 'home' | 'status' | 'alarm' | 'data' | 'builder' | 'history' | 'chart'

const navItems: {
  to: string
  label: string
  end?: boolean
  accent: NavAccent
  icon: NavIconName
  /** true면 개발자 로그인에서만 표시 */
  developerOnly?: boolean
}[] = [
  { to: '/', label: '주화면', end: true, accent: 'cyan', icon: 'home' },
  { to: '/line-status', label: '라인 현황', accent: 'teal', icon: 'status' },
  { to: '/v3-alarms', label: '알람 리스트', accent: 'amber', icon: 'alarm' },
  { to: '/protocols', label: '데이터', accent: 'emerald', icon: 'data', developerOnly: true },
  { to: '/builder', label: '라인 빌더', accent: 'violet', icon: 'builder', developerOnly: true },
  { to: '/history', label: '이력', accent: 'sky', icon: 'history' },
  { to: '/charts', label: '차트', accent: 'rose', icon: 'chart', developerOnly: true },
]

/** 역할에 맞는 메뉴 목록 — 개발자 이외에는 developerOnly 항목 숨김 */
function useVisibleNavItems() {
  const role = useAuthStore((s) => s.role)
  return navItems.filter((item) => !item.developerOnly || role === 'developer')
}

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const cn = className ?? 'h-4 w-4 shrink-0'
  switch (name) {
    case 'home':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10.5L12 3l9 7.5M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5"
          />
        </svg>
      )
    case 'status':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
          <circle cx="18" cy="12" r="2.5" strokeWidth={1.75} />
        </svg>
      )
    case 'alarm':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          />
        </svg>
      )
    case 'data':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
          <path strokeLinecap="round" d="M4.5 5.5v6.5c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8V5.5" />
          <path strokeLinecap="round" d="M4.5 12v6.5c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8V12" />
        </svg>
      )
    case 'builder':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3l7 4v10l-7 4-7-4V7l7-4zM12 12l7-4M12 12v9M12 12L5 8"
          />
        </svg>
      )
    case 'history':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'chart':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16h3l2-8 4 12 3-8 1.5 4H21M3 4v16"
          />
        </svg>
      )
  }
}

function navLinkClass(isActive: boolean, accent: NavAccent, mobile = false) {
  const size = mobile
    ? 'nav-link nav-link--mobile flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium'
    : 'nav-link flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium'
  const state = isActive ? 'nav-link--active' : 'nav-link--idle'
  return `${size} ${state} nav-link--${accent}`
}

export function Navigation() {
  const logApplication = useConveyorStore((s) => s.logApplication)
  const visibleItems = useVisibleNavItems()

  const handleClick = (label: string) => {
    void logApplication({
      title: 'Button Click',
      comment: `Main: Menu-${label} Click`,
    })
  }

  return (
    <nav className="nav-menu hidden gap-0.5 md:flex">
      {visibleItems.map(({ to, label, end, accent, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => handleClick(label)}
          className={({ isActive }) => navLinkClass(isActive, accent)}
        >
          <NavIcon name={icon} className="nav-link-icon h-4 w-4 shrink-0" />
          <span className="nav-link-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function MobileNavigation() {
  const logApplication = useConveyorStore((s) => s.logApplication)
  const visibleItems = useVisibleNavItems()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleClick = (label: string) => {
    setMobileOpen(false)
    void logApplication({
      title: 'Button Click',
      comment: `Main: Menu-${label} Click`,
    })
  }

  return (
    <>
      <button
        type="button"
        aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
        className={`nav-menu-toggle md:hidden flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-200 ${
          mobileOpen
            ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
            : 'border-slate-700/80 text-slate-300 hover:border-cyan-500/30 hover:bg-slate-800/80 hover:text-cyan-100'
        }`}
      >
        {mobileOpen ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="nav-menu-mobile fixed inset-x-0 top-[69px] z-50 border-b border-cyan-500/20 bg-slate-900/95 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
              {visibleItems.map(({ to, label, end, accent, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => handleClick(label)}
                  className={({ isActive }) => navLinkClass(isActive, accent, true)}
                >
                  <NavIcon name={icon} className="nav-link-icon h-5 w-5 shrink-0" />
                  <span className="nav-link-label">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
