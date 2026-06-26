import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useSemiCnvMonitor } from '../../hooks/useSemiCnvMonitor'
import { USER_ROLE_LABELS } from '../../constants/auth'
import { useAuthStore } from '../../store/useAuthStore'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import type { UserRole } from '../../types/auth'
import { Navigation, MobileNavigation } from './Navigation'

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  operator: 'header-role-badge--operator',
  engineer: 'header-role-badge--engineer',
  developer: 'header-role-badge--developer',
}

export function AppLayout() {
  const navigate = useNavigate()
  const logApplication = useConveyorStore((s) => s.logApplication)
  const initializeMonitor = useMonitorStore((s) => s.initialize)
  const role = useAuthStore((s) => s.role)
  const logout = useAuthStore((s) => s.logout)
  const hasLoggedStart = useRef(false)

  useSemiCnvMonitor()

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
              <span
                className="hidden h-7 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-cyan-400 via-slate-200 to-violet-500 sm:block"
                aria-hidden
              />
              <h1 className="app-header-title whitespace-nowrap text-base sm:text-lg">
                <span className="app-header-title-text font-semibold tracking-wide">
                  제어설비 관제시스템
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
    </div>
  )
}
