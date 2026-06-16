import { Outlet } from 'react-router-dom'
import { Navigation } from './Navigation'

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold tracking-tight">
              C/V 관제시스템
            </h1>
            <Navigation />
          </div>
          <span className="text-xs text-slate-500">Phase 1 · localStorage</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
