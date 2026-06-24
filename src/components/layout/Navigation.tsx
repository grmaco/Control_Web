import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useConveyorStore } from '../../store/useConveyorStore'

const navItems = [
  { to: '/', label: '주화면', end: true },
  { to: '/line-status', label: '라인 현황' },
  { to: '/builder', label: '라인 빌더' },
  { to: '/history', label: '이력' },
]

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
  }`

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-3 text-base font-medium transition-colors ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
  }`

export function Navigation() {
  const logApplication = useConveyorStore((s) => s.logApplication)
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
      {/* 데스크톱: 가로 나열 */}
      <nav className="hidden md:flex gap-1">
        {navItems.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => handleClick(label)} className={desktopLinkClass}>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* 모바일: 햄버거 버튼 */}
      <button
        type="button"
        aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
        className="md:hidden flex h-11 w-11 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 active:bg-slate-700"
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

      {/* 모바일: 풀 너비 드롭다운 (헤더 높이 64px 아래 고정) */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-x-0 top-[69px] z-50 border-b border-slate-700 bg-slate-900 shadow-xl md:hidden">
            <nav className="mx-auto max-w-7xl flex flex-col gap-0.5 px-4 py-2">
              {navItems.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => handleClick(label)} className={mobileLinkClass}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
