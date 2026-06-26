import { useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { SemiCnvConnectionBar } from '../monitor/SemiCnvConnectionBar'
import { useSemiCnvMonitor } from '../../hooks/useSemiCnvMonitor'
import { USER_ROLE_LABELS } from '../../constants/auth'
import { useAuthStore } from '../../store/useAuthStore'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useMonitorStore } from '../../store/useMonitorStore'
import { Navigation } from './Navigation'

export function AppLayout() {
  const navigate = useNavigate()
  const logApplication = useConveyorStore((s) => s.logApplication)
  const semiCnvEnabled = useConveyorStore((s) => s.settings.semiCnv?.enabled ?? false)
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex flex-shrink-0 items-center gap-3 md:gap-6">
            <h1 className="whitespace-nowrap text-base font-semibold tracking-tight sm:text-lg">
              PC제어설비 관제시스템
            </h1>
            <Navigation />
          </div>
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            {role ? (
              <div className="flex items-center gap-2">
                <span className="hidden rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 sm:inline">
                  {USER_ROLE_LABELS[role]}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void logApplication({
                      title: 'Logout',
                      comment: `${USER_ROLE_LABELS[role]} logout`,
                    })
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  로그아웃
                </button>
              </div>
            ) : null}
            <SemiCnvConnectionBar />
            <span className="hidden sm:inline text-xs text-slate-500">
              {semiCnvEnabled ? 'Semi C/V 연동' : 'Phase 1 · localStorage'}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>
    </div>
  )
}
