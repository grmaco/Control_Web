import type { StkPolicy, UnitRole } from '../types/unitProperties'

export const DEFAULT_STK_CAPACITY = 100

export const UNIT_ROLES: UnitRole[] = [
  'INPUT',
  'OUTPUT',
  'TRANSFER',
  'STORAGE',
  'PORT_IN',
  'PORT_OUT',
]

export const UNIT_ROLE_LABELS: Record<UnitRole, string> = {
  INPUT: '투입구',
  OUTPUT: '출고구',
  TRANSFER: '경유',
  STORAGE: '스토커',
  PORT_IN: '투입고',
  PORT_OUT: '출고구',
}

export const STK_POLICIES: StkPolicy[] = [
  'MANUAL_ORDER',
  'LOAD_RATE_FIRST',
  'LOAD_RATE_LAST',
  'ROUND_ROBIN',
]

export const STK_POLICY_LABELS: Record<StkPolicy, string> = {
  MANUAL_ORDER: '수동 순서',
  LOAD_RATE_FIRST: '적재율 낮은 STK 우선',
  LOAD_RATE_LAST: '적재율 높은 STK 우선',
  ROUND_ROBIN: '라운드 로빈',
}
