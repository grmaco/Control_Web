import type {
  ConveyorLine,
  ConveyorType,
  ConveyorUnit,
  InterfaceUnitType,
  LegacyConveyorType,
  PortDirection,
  PortLinkedUnit,
  PortRecipe,
  StorageMaintenanceArea,
  StorageRobotCount,
  StorageShape,
} from '../types/conveyor'
import type { FlowDir } from '../utils/flowDirection'
import { formatTurnFlowAngleLabel } from '../utils/turnArc'
import { migrateLineFlowRoles } from '../utils/flowEntries'
import { normalizeLineRoleFields } from '../utils/unitPropertyHelpers'
import { syncAllConnections } from '../utils/units'
import {
  DEFAULT_PORT_DIRECTION,
  DEFAULT_PORT_RECIPE,
} from './port'
import {
  DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
  DEFAULT_WAREHOUSE_ROBOT_COUNT,
  DEFAULT_WAREHOUSE_SHAPE,
  warehouseMaintenanceAreaLabel,
  warehouseShapeLabel,
} from './warehouseUnit'
import { DEFAULT_GRID_SIZE } from './grid'

export const CONVEYOR_TYPES: ConveyorType[] = ['straight', 'turn', 'junction', 'lift']

/** 라인 빌더 팔레트 (컨베이어 + 포트 + 적재창고) */
export const BUILDER_PALETTE_TYPES: ConveyorType[] = [
  ...CONVEYOR_TYPES,
  'port',
  'storage',
]

const TYPE_LABELS: Record<ConveyorType, string> = {
  straight: '직선',
  turn: '회전',
  junction: '분기',
  lift: '리프트',
  port: '포트',
  storage: '적재창고',
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
    description: '직교 분기 — 평시 직진, 분기 요청 CV 지정 시 수직 전환',
  },
  lift: {
    showsRotation: true,
    isDualModule: false,
    description: '수직 이송 리프트',
  },
  port: {
    showsRotation: false,
    isDualModule: false,
    description: 'IN/OUT 방향 · 레시피 · 연동 유닛(OHT/STK/AGV)',
  },
  storage: {
    showsRotation: false,
    isDualModule: false,
    description: '3×3 정사각 · 형상 · ROBOT 수량 · 유지보수 영역',
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

export function isPort(type: ConveyorType): boolean {
  return type === 'port'
}

export function isPortUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'port'
}

export function isStorage(type: ConveyorType): boolean {
  return type === 'storage'
}

export function isStorageUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'storage'
}

export function isLiftUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'lift'
}

export interface TurnFlowDisplay {
  inDir: FlowDir | null
  outDir: FlowDir | null
}

/** 리프트는 mm, 회전 유닛은 입고 방향 기준 상대 각도(있으면), 없으면 저장 rotation */
export function formatRotationDisplay(
  unit: ConveyorUnit,
  flow?: TurnFlowDisplay | null,
): string {
  if (unit.type === 'lift') return `${unit.rotation}mm`
  if (unit.type === 'junction') return ''
  if (unit.type === 'turn') {
    const flowAngle = formatTurnFlowAngleLabel(flow?.inDir, flow?.outDir)
    if (flowAngle) return flowAngle
  }
  return `${unit.rotation}°`
}

/** 그리드 셀 안에 타입명(리프트, 포트 등) 표시 여부 */
export function showsTypeLabelInCell(type: ConveyorType): boolean {
  return type !== 'lift' && type !== 'port' && type !== 'storage'
}

export function normalizeUnitType(type: LegacyConveyorType): ConveyorType {
  if (type === 'curve') return 'turn'
  return type
}

export function normalizeUnit(
  unit: ConveyorUnit & {
    type?: LegacyConveyorType
    interfaceUnit?: InterfaceUnitType | null
    portDirection?: PortDirection | null
    portRecipe?: PortRecipe | null
    portLinkedUnit?: PortLinkedUnit | null
    storageShape?: StorageShape | null
    storageRobotCount?: StorageRobotCount | null
    storageMaintenanceArea?: StorageMaintenanceArea | null
  },
): ConveyorUnit {
  const type = normalizeUnitType(unit.type as LegacyConveyorType)
  const interfaceUnit = unit.interfaceUnit ?? null

  if (type === 'port') {
    return {
      ...unit,
      type,
      interfaceUnit: null,
      portDirection: unit.portDirection ?? DEFAULT_PORT_DIRECTION,
      portRecipe: unit.portRecipe ?? DEFAULT_PORT_RECIPE,
      portLinkedUnit: null,
      storageShape: null,
      storageRobotCount: null,
      storageMaintenanceArea: null,
      testMaterial: unit.testMaterial ?? 0,
      flowRole: null,
    }
  }

  if (type === 'storage') {
    return {
      ...unit,
      type,
      interfaceUnit: null,
      portDirection: null,
      portRecipe: null,
      portLinkedUnit: null,
      storageShape: unit.storageShape ?? DEFAULT_WAREHOUSE_SHAPE,
      storageRobotCount: unit.storageRobotCount ?? DEFAULT_WAREHOUSE_ROBOT_COUNT,
      storageMaintenanceArea:
        unit.storageMaintenanceArea ?? DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
      testMaterial: unit.testMaterial ?? 0,
      flowRole: null,
    }
  }

  return {
    ...unit,
    type,
    interfaceUnit,
    portDirection: null,
    portRecipe: null,
    portLinkedUnit: null,
    storageShape: null,
    storageRobotCount: null,
    storageMaintenanceArea: null,
    testMaterial: unit.testMaterial ?? 0,
    flowRole: unit.flowRole ?? null,
  }
}

export function normalizeLine<
  T extends {
    units: ConveyorUnit[]
    gridSize?: { cols: number; rows: number }
    baseUnitId?: string | null
  },
>(line: T): T {
  const units = line.units.map((unit) => normalizeUnit(unit))
  const migrated = migrateLineFlowRoles({ ...line, units })
  const withRoles = normalizeLineRoleFields({ ...migrated, units: migrated.units })

  const normalized = {
    ...migrated,
    ...withRoles,
    gridSize: { ...DEFAULT_GRID_SIZE },
    baseUnitId: null,
  }

  return syncAllConnections(normalized as unknown as ConveyorLine) as unknown as T
}

export function unitTitle(unit: ConveyorUnit, flow?: TurnFlowDisplay | null): string {
  const parts = [unit.name]
  if (showsTypeLabelInCell(unit.type)) {
    parts.push(typeLabel(unit.type))
  }
  if (showsRotation(unit.type) && unit.type !== 'junction') {
    const rotationLabel = formatRotationDisplay(unit, flow)
    if (rotationLabel) parts.push(rotationLabel)
  }
  if (isDualModule(unit.type)) {
    parts.push('2모듈 겹침')
  }
  if (isPortUnit(unit)) {
    if (unit.portDirection) {
      parts.push(unit.portDirection === 'OUT' ? '출고구' : '투입고')
    }
    if (unit.portRecipe) parts.push(unit.portRecipe)
  } else if (isStorageUnit(unit)) {
    if (unit.storageShape) parts.push(warehouseShapeLabel(unit.storageShape))
    if (unit.storageRobotCount) parts.push(`ROBOT ${unit.storageRobotCount}`)
    if (unit.storageMaintenanceArea) {
      parts.push(warehouseMaintenanceAreaLabel(unit.storageMaintenanceArea))
    }
  } else if (unit.interfaceUnit) {
    parts.push(`IF:${unit.interfaceUnit}`)
  }
  return parts.join(' · ')
}
