import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireDeveloper } from './components/auth/RequireDeveloper'
import { AppLayout } from './components/layout/AppLayout'
import { BuilderPage } from './pages/BuilderPage'
import { ChartPage } from './pages/ChartPage'
import { CvStatusPage } from './pages/CvStatusPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { LineStatusPage } from './pages/LineStatusPage'
import { LoginPage } from './pages/LoginPage'
import { ProtocolReferencePage } from './pages/ProtocolReferencePage'
import { V3AlarmReferencePage } from './pages/V3AlarmReferencePage'

// Electron 배포 빌드는 file:// 로 로드되므로 HTML5 history(BrowserRouter)가 동작하지 않는다.
// file:// 프로토콜일 때만 HashRouter 사용 — 웹(http/https)·Electron 개발(localhost)은 BrowserRouter 유지.
const Router =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? HashRouter
    : BrowserRouter

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="line-status" element={<LineStatusPage />} />
            <Route path="v3-alarms" element={<V3AlarmReferencePage />} />
            <Route path="cv-status" element={<CvStatusPage />} />
            <Route element={<RequireDeveloper />}>
              <Route path="protocols" element={<ProtocolReferencePage />} />
              <Route path="builder" element={<BuilderPage />} />
              <Route path="charts" element={<ChartPage />} />
            </Route>
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  )
}
