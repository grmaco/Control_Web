/** 로그인 사용자 역할 — 추후 화면·조작 권한 분리 예정 */
export type UserRole = 'operator' | 'engineer' | 'developer'

export interface AuthSession {
  role: UserRole
  loggedInAt: string
}
