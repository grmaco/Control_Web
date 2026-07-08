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

function sortByGrid(units: ConveyorUnit[]): ConveyorUnit[] {
  return [...units].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
}

/** 물류 시작점(투입) — flowRole=entry, 없으면 legacy baseUnitId */
export function getEntryUnits(line: ConveyorLine): ConveyorUnit[] {
  const entries = sortByGrid(
    line.units.filter((unit) => unit.flowRole === 'entry' && isFlowCapableUnit(unit)),
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
    line.units.filter((unit) => unit.flowRole === 'exit' && isFlowCapableUnit(unit)),
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
