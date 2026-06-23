import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { FlowRole } from '../types/conveyor'
import { DEFAULT_GRID_SIZE } from '../constants/grid'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { resolveOutputDestinationId } from './unitRefs'
import { getOrthogonalNeighborUnits } from './units'

const FLOW_CAPABLE_TYPES = new Set<ConveyorUnit['type']>([
  'straight',
  'turn',
  'junction',
  'lift',
])

export function isFlowCapableUnit(unit: ConveyorUnit): boolean {
  return FLOW_CAPABLE_TYPES.has(unit.type)
}

/** OUT 포트에서 컨베이어 네트워크로 도달 가능한 CV (STK·포트 제외) */
export function listReachableOutputDestinations(
  line: ConveyorLine,
  portId: string,
): ConveyorUnit[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const port = unitMap.get(portId)
  if (!port || !isPortUnit(port)) return []

  const visited = new Set<string>([port.id])
  const queue: ConveyorUnit[] = []
  const { cols, rows } = line.gridSize ?? DEFAULT_GRID_SIZE

  for (const neighbor of getOrthogonalNeighborUnits(line.units, port, cols, rows)) {
    if (isStorageUnit(neighbor) || isPortUnit(neighbor)) continue
    queue.push(neighbor)
  }

  const candidates: ConveyorUnit[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)

    if (isFlowCapableUnit(current)) {
      candidates.push(current)
    }

    for (const neighborId of current.connections) {
      if (visited.has(neighborId)) continue
      const neighbor = unitMap.get(neighborId)
      if (!neighbor || isStorageUnit(neighbor) || isPortUnit(neighbor)) continue
      queue.push(neighbor)
    }
  }

  return candidates.sort((a, b) => {
    const labelA = a.name?.trim() || a.code?.trim() || ''
    const labelB = b.name?.trim() || b.code?.trim() || ''
    return labelA.localeCompare(labelB, undefined, { numeric: true })
  })
}

function outputDestinationCandidateIds(
  line: ConveyorLine,
  portId: string,
): Set<string> {
  return new Set(listReachableOutputDestinations(line, portId).map((unit) => unit.id))
}

/** 출고 포트 목적지 CV 후보 — 포트에서 도달 가능한 CV만 */
export function isOutputDestinationCandidate(
  line: ConveyorLine,
  unit: ConveyorUnit,
  portId: string,
): boolean {
  if (unit.id === portId || !isFlowCapableUnit(unit)) return false
  return outputDestinationCandidateIds(line, portId).has(unit.id)
}

/** 출고구 드롭다운 — 포트에서 도달 가능한 CV + 현재 지정값 */
export function buildOutputDestinationOptions(
  line: ConveyorLine,
  portId: string,
  currentDestinationId?: string,
): ConveyorUnit[] {
  const seen = new Set<string>()
  const options: ConveyorUnit[] = []

  const add = (candidate: ConveyorUnit | undefined) => {
    if (!candidate || candidate.id === portId || seen.has(candidate.id)) return
    if (!isFlowCapableUnit(candidate)) return
    seen.add(candidate.id)
    options.push(candidate)
  }

  for (const unit of listReachableOutputDestinations(line, portId)) {
    add(unit)
  }

  if (currentDestinationId) {
    const resolvedId = resolveOutputDestinationId(line, portId, currentDestinationId)
    add(line.units.find((unit) => unit.id === resolvedId))
  }

  return options.sort((a, b) => {
    const labelA = a.name?.trim() || a.code?.trim() || ''
    const labelB = b.name?.trim() || b.code?.trim() || ''
    return labelA.localeCompare(labelB, undefined, { numeric: true })
  })
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
      unit.id === line.baseUnitId ? { ...unit, flowRole: 'entry' as FlowRole } : unit,
    ),
    baseUnitId: null,
  }
}
