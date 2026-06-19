import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { SemiCnvConnectionBar } from '../monitor/SemiCnvConnectionBar'
import { useSemiCnvMonitor } from '../../hooks/useSemiCnvMonitor'
import { useConveyorStore } from '../../store/useConveyorStore'
import { Navigation } from './Navigation'

export function AppLayout() {
  const logApplication = useConveyorStore((s) => s.logApplication)
  const semiCnvEnabled = useConveyorStore((s) => s.settings.semiCnv?.enabled ?? false)
  const hasLoggedStart = useRef(false)

  useSemiCnvMonitor()

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
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold tracking-tight">
              PC제어 관제시스템
            </h1>
            <Navigation />
          </div>
          <div className="flex items-center gap-4">
            <SemiCnvConnectionBar />
            <span className="text-xs text-slate-500">
              {semiCnvEnabled ? 'Semi C/V 연동' : 'Phase 1 · localStorage'}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
