import type { UserRole } from '../types/auth'

/** 임시 공통 비밀번호 (추후 역할별·설정 화면에서 변경 예정) */
export const DEFAULT_LOGIN_PASSWORD = '0001'

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  operator: '오퍼레이터',
  engineer: '엔지니어',
  developer: '개발자',
}

export const USER_ROLES: UserRole[] = ['operator', 'engineer', 'developer']

/** 역할별 비밀번호 — 현재는 동일, 이후 설정 연동 */
export function getPasswordForRole(_role: UserRole): string {
  return DEFAULT_LOGIN_PASSWORD
}
