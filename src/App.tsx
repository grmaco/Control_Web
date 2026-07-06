import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { BuilderPage } from './pages/BuilderPage'
import { ChartPage } from './pages/ChartPage'
import { CvStatusPage } from './pages/CvStatusPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { LineStatusPage } from './pages/LineStatusPage'
import { LoginPage } from './pages/LoginPage'
import { V3AlarmReferencePage } from './pages/V3AlarmReferencePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="line-status" element={<LineStatusPage />} />
            <Route path="v3-alarms" element={<V3AlarmReferencePage />} />
            <Route path="cv-status" element={<CvStatusPage />} />
            <Route path="builder" element={<BuilderPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="charts" element={<ChartPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
