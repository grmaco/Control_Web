import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useSemiCnvMonitor } from '../../hooks/useSemiCnvMonitor'
import { useV3PioBridge } from '../../hooks/useV3PioBridge'
import { USER_ROLE_LABELS } from '../../constants/auth'
import { useAuthStore } from '../../store/useAuthStore'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { UserRole } from '../../types/auth'
import { Navigation, MobileNavigation } from './Navigation'
import { HumanoidAssistant } from '../assistant/HumanoidAssistant'

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  operator: 'header-role-badge--operator',
  engineer: 'header-role-badge--engineer',
  developer: 'header-role-badge--developer',
}

/** 헤더 타이틀 앞 반짝이는 육각 로고 — 모바일·데스크톱 공통 표시 */
function HeaderLogo() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" className="app-header-logo shrink-0" aria-hidden>
      <defs>
        <linearGradient id="header-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <path
        d="M16 2 L27.5 9 V23 L16 30 L4.5 23 V9 Z"
        fill="none"
        stroke="url(#header-logo-grad)"
        strokeWidth="1.6"
      />
      <circle className="app-header-logo-core" cx="16" cy="16" r="4" fill="url(#header-logo-grad)" />
      <circle cx="16" cy="2" r="1.4" fill="#67e8f9" />
      <circle cx="27.5" cy="9" r="1.4" fill="#67e8f9" />
      <circle cx="27.5" cy="23" r="1.4" fill="#a78bfa" />
      <circle cx="16" cy="30" r="1.4" fill="#a78bfa" />
      <circle cx="4.5" cy="23" r="1.4" fill="#a78bfa" />
      <circle cx="4.5" cy="9" r="1.4" fill="#67e8f9" />
    </svg>
  )
}

export function AppLayout() {
  const navigate = useNavigate()
  const logApplication = useConveyorStore((s) => s.logApplication)
  const initializeMonitor = useMonitorStore((s) => s.initialize)
  const role = useAuthStore((s) => s.role)
  const logout = useAuthStore((s) => s.logout)
  const hasLoggedStart = useRef(false)

  useSemiCnvMonitor()

  // PIO 타임차트 V3 브리지 — 전역 상시 동작. 어느 페이지·어느 라인을 보든
  // 실제 V3 반송(cstId 위치 변화)을 감지해 핸드셰이크로 기록한다.
  const lines = useConveyorStore((s) => s.lines)
  const v3UnitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const v3IsLive = useSemiCnvStore((s) => s.isLive)
  useV3PioBridge({ enabled: v3IsLive, unitRuntime: v3UnitRuntime, lines })

  useEffect(() => {
    initializeMonitor()
  }, [initializeMonitor])

  useEffect(() => {
    if (hasLoggedStart.current) return
    hasLoggedStart.current = true
    void logApplication({
      title: 'Application Start',
      comment: 'PC Control System initialized',
    })
  }, [logApplication])

  const handleLogout = () => {
    if (!role) return
    void logApplication({
      title: 'Logout',
      comment: `${USER_ROLE_LABELS[role]} logout`,
    })
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex flex-shrink-0 items-center gap-3 md:gap-6">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <h1 className="app-header-title whitespace-nowrap text-base sm:text-lg">
                <span className="app-header-title-text font-semibold tracking-wide">
                  PCP AI
                </span>
              </h1>
            </div>
            <Navigation />
            {role ? (
              <button
                type="button"
                onClick={handleLogout}
                className="header-logout-btn rounded-lg px-2.5 py-1 text-xs text-slate-400 md:hidden"
              >
                로그아웃
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <MobileNavigation />
            {role ? (
              <div className="hidden items-center gap-2 md:flex">
                <span
                  className={`header-role-badge rounded-lg px-2.5 py-1 text-xs font-medium ${ROLE_BADGE_CLASS[role]}`}
                >
                  {USER_ROLE_LABELS[role]}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="header-logout-btn rounded-lg px-2.5 py-1 text-xs text-slate-400"
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="app-content mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>
      <HumanoidAssistant />
    </div>
  )
}
