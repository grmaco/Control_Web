import type { ConveyorLine, ConveyorUnit, FlowRole } from '../types/conveyor'

const FLOW_CAPABLE_TYPES = new Set<ConveyorUnit['type']>([
  'straight',
  'turn',
  'junction',
  'lift',
])

export function isFlowCapableUnit(unit: ConveyorUnit): boolean {
  return FLOW_CAPABLE_TYPES.has(unit.type)
}

/**
 * 투입/출고 지정(flowRole) 가능 유닛 — 일반 컨베이어 유닛 + 포트.
 * 포트는 STK 반대편에 라인 CV가 없어도(연동 유닛 또는 프로브로 자재를 직접
 * 받는 구성) 투입·출고점으로 지정할 수 있어야 한다.
 * (conveyorTypes.ts가 이 파일의 migrateLineFlowRoles를 import하므로
 * 순환 참조 방지를 위해 isPortUnit을 import하지 않고 타입을 직접 비교)
 */
export function isFlowRoleCapableUnit(unit: ConveyorUnit): boolean {
  return isFlowCapableUnit(unit) || unit.type === 'port'
}

function sortByGrid(units: ConveyorUnit[]): ConveyorUnit[] {
  return [...units].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
}

/** 물류 시작점(투입) — flowRole=entry, 없으면 legacy baseUnitId */
export function getEntryUnits(line: ConveyorLine): ConveyorUnit[] {
  const entries = sortByGrid(
    line.units.filter((unit) => unit.flowRole === 'entry' && isFlowRoleCapableUnit(unit)),
  )
  if (entries.length > 0) return entries

  if (line.baseUnitId) {
    const legacy = line.units.find((unit) => unit.id === line.baseUnitId)
    if (legacy && isFlowCapableUnit(legacy)) return [legacy]
  }

  return []
}

/** 물류 종료점(출고) */
export function getExitUnits(line: ConveyorLine): ConveyorUnit[] {
  return sortByGrid(
    line.units.filter((unit) => unit.flowRole === 'exit' && isFlowRoleCapableUnit(unit)),
  )
}

export function hasFlowEntries(line: ConveyorLine): boolean {
  return getEntryUnits(line).length > 0
}

export function formatFlowRoleLabel(role: FlowRole | null | undefined): string {
  if (role === 'entry') return '투입'
  if (role === 'exit') return '출고'
  return ''
}

/** baseUnitId → flowRole entry 마이그레이션 */
export function migrateLineFlowRoles<
  T extends { units: ConveyorUnit[]; baseUnitId?: string | null },
>(line: T): T {
  const hasEntry = line.units.some((unit) => unit.flowRole === 'entry')
  if (hasEntry || !line.baseUnitId) return line

  const baseExists = line.units.some((unit) => unit.id === line.baseUnitId)
  if (!baseExists) return { ...line, baseUnitId: null }

  return {
    ...line,
    units: line.units.map((unit) =>
      unit.id === line.baseUnitId
        ? { ...unit, flowRole: 'entry' as FlowRole, role: 'INPUT' as const }
        : unit,
    ),
    baseUnitId: null,
  }
}
