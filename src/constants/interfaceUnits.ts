import type { InterfaceUnitType } from '../types/conveyor'

export const INTERFACE_UNIT_TYPES: InterfaceUnitType[] = [
  'OHT',
  'AGV',
  'ROBOT',
  'AMR',
  'EQ',
  'PORT',
]

export function interfaceUnitLabel(type: InterfaceUnitType): string {
  return type
}
