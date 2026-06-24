import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { BuilderPage } from './pages/BuilderPage'
import { CvStatusPage } from './pages/CvStatusPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { LineStatusPage } from './pages/LineStatusPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="line-status" element={<LineStatusPage />} />
          <Route path="cv-status" element={<CvStatusPage />} />
          <Route path="builder" element={<BuilderPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
