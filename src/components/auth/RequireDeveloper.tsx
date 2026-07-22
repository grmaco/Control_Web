import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'

/** 개발자 전용 라우트 가드 — 개발자 이외 접속 시 주화면으로 돌려보낸다 */
export function RequireDeveloper() {
  const role = useAuthStore((s) => s.role)

  if (role !== 'developer') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
