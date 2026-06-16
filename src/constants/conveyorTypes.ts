import type { ConveyorType, ConveyorUnit, InterfaceUnitType, LegacyConveyorType } from '../types/conveyor'
import { DEFAULT_GRID_SIZE } from './grid'

export const CONVEYOR_TYPES: ConveyorType[] = ['straight', 'turn', 'junction', 'lift']

const TYPE_LABELS: Record<ConveyorType, string> = {
  straight: '직선',
  turn: '회전',
  junction: '분기',
  lift: '리프트',
}

const TYPE_META: Record<
  ConveyorType,
  { showsRotation: boolean; isDualModule: boolean; description: string }
> = {
  straight: {
    showsRotation: false,
    isDualModule: false,
    description: '단일 직선 컨베이어',
  },
  turn: {
    showsRotation: true,
    isDualModule: false,
    description: '방향 전환 컨베이어',
  },
  junction: {
    showsRotation: true,
    isDualModule: true,
    description: '한 모듈에 컨베이어 2개가 겹친 분기',
  },
  lift: {
    showsRotation: true,
    isDualModule: false,
    description: '수직 이송 리프트',
  },
}

export function typeLabel(type: ConveyorType): string {
  return TYPE_LABELS[type]
}

export function typeDescription(type: ConveyorType): string {
  return TYPE_META[type].description
}

export function showsRotation(type: ConveyorType): boolean {
  return TYPE_META[type].showsRotation
}

export function isDualModule(type: ConveyorType): boolean {
  return TYPE_META[type].isDualModule
}

export function normalizeUnitType(type: LegacyConveyorType): ConveyorType {
  if (type === 'curve') return 'turn'
  return type
}

export function normalizeUnit(
  unit: ConveyorUnit & { type?: LegacyConveyorType; interfaceUnit?: InterfaceUnitType | null },
): ConveyorUnit {
  const type = normalizeUnitType(unit.type as LegacyConveyorType)
  const interfaceUnit = unit.interfaceUnit ?? null
  return { ...unit, type, interfaceUnit }
}

export function normalizeLine<
  T extends {
    units: ConveyorUnit[]
    gridSize?: { cols: number; rows: number }
    baseUnitId?: string | null
  },
>(line: T): T {
  const units = line.units.map((unit) => normalizeUnit(unit))
  const baseUnitId =
    line.baseUnitId && units.some((unit) => unit.id === line.baseUnitId)
      ? line.baseUnitId
      : null

  return {
    ...line,
    gridSize: { ...DEFAULT_GRID_SIZE },
    units,
    baseUnitId,
  }
}

export function unitTitle(unit: ConveyorUnit): string {
  const parts = [unit.name, typeLabel(unit.type)]
  if (showsRotation(unit.type)) {
    parts.push(`${unit.rotation}°`)
  }
  if (isDualModule(unit.type)) {
    parts.push('2모듈 겹침')
  }
  if (unit.interfaceUnit) {
    parts.push(`IF:${unit.interfaceUnit}`)
  }
  return parts.join(' · ')
}
