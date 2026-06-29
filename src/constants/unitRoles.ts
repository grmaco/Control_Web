import type { UnitRole } from '../types/unitProperties'

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
