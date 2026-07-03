import type { ConveyorLine, ConveyorUnit, PortDirection } from '../types/conveyor'
import type {
  PortProperties,
  JunctionRoutingProperties,
  TransitLinkedUnitsProperties,
  StkProperties,
  StkRoutingProperties,
  UnitRole,
  UnitRoleProperties,
} from '../types/unitProperties'
import { DEFAULT_STK_CAPACITY } from '../constants/unitRoles'
import { DEFAULT_GRID_SIZE } from '../constants/grid'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { isFlowCapableUnit, listReachableOutputDestinations } from './flowEntries'
import {
  computeJunctionThroughFlow,
  computeJunctionDivertFlow,
  flowEntryDir,
  flowExitDir,
  isPerpendicularFlow,
  type FlowDir,
} from './flowDirection'
import { resolveOutputDestinationId, findUnitByRef } from './unitRefs'
import {
  areGridAdjacent,
  findUnitAtCell,
  getOrthogonalNeighborUnits,
  getUnitFootprint,
  updateUnitInLine,
} from './units'

export type UnitLineContext = Pick<ConveyorLine, 'units' | 'baseUnitId'> & {
  gridSize?: ConveyorLine['gridSize']
}

function lineGridSize(line: { gridSize?: ConveyorLine['gridSize'] }) {
  return line.gridSize ?? DEFAULT_GRID_SIZE
}

export interface PortValidationIssue {
  severity: 'warning' | 'error'
  message: string
}

/** UI·라벨용 — name이 유일한 표시 식별자 */
export function unitDisplayCode(unit: ConveyorUnit): string {
  return unit.name?.trim() || unit.code?.trim() || ''
}

/** legacy code → name 통합, code는 name과 동기화 */
export function syncUnitCodeWithName(unit: ConveyorUnit): ConveyorUnit {
  const name = unit.name?.trim()
  const code = unit.code?.trim()
  const resolved = name || code || ''
  if (!resolved) return unit
  return { ...unit, name: resolved, code: resolved }
}

export function isTurnRoutingUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'turn' || unit.type === 'junction'
}

export function isStkRoutingSourceUnit(_unit: ConveyorUnit): boolean {
  return false
}

export function portRoleFromDirection(direction: PortDirection): UnitRole {
  return direction === 'OUT' ? 'PORT_OUT' : 'PORT_IN'
}

export function inferUnitRole(
  unit: ConveyorUnit,
  line?: UnitLineContext,
): UnitRole {
  if (isPortUnit(unit)) {
    return portRoleFromDirection(unit.portDirection ?? 'IN')
  }
  if (isStorageUnit(unit)) return 'STORAGE'
  if (unit.flowRole === 'entry') return 'INPUT'
  if (unit.flowRole === 'exit') return 'OUTPUT'
  if (unit.role) {
    if (unit.role === 'STORAGE') return 'TRANSFER'
    return unit.role
  }
  if (line?.baseUnitId === unit.id) return 'INPUT'
  return 'TRANSFER'
}

/** 직선 CV — 투입구·출고구일 때만 외부 연동 유닛(OHT/AGV 등) 지정 */
export function canSelectInterfaceUnit(unit: ConveyorUnit): boolean {
  if (unit.type !== 'straight') return false
  if (unit.flowRole === 'entry' || unit.role === 'INPUT') return true
  if (unit.flowRole === 'exit' || unit.role === 'OUTPUT') return true
  return false
}

/** flowRole(투입·출고 지정) ↔ role(투입구·출고구·경유) — CV 유닛만 동기화 */
export function syncFlowRoleUnitRole(
  unit: ConveyorUnit,
  patch: Partial<Pick<ConveyorUnit, 'flowRole' | 'role'>>,
): Partial<Pick<ConveyorUnit, 'flowRole' | 'role' | 'interfaceUnit'>> {
  if (isPortUnit(unit) || isStorageUnit(unit) || !isFlowCapableUnit(unit)) {
    return patch
  }

  const clearInterface =
    unit.type === 'straight' &&
    (unit.interfaceUnit != null ||
      unit.flowRole != null ||
      unit.role === 'INPUT' ||
      unit.role === 'OUTPUT')

  if ('flowRole' in patch) {
    const flowRole = patch.flowRole ?? null
    if (flowRole === 'entry') return { flowRole: 'entry', role: 'INPUT' }
    if (flowRole === 'exit') return { flowRole: 'exit', role: 'OUTPUT' }
    const role =
      unit.role === 'INPUT' || unit.role === 'OUTPUT'
        ? ('TRANSFER' as UnitRole)
        : (unit.role ?? 'TRANSFER')
    return {
      flowRole: null,
      role,
      ...(clearInterface ? { interfaceUnit: null } : {}),
    }
  }

  if ('role' in patch && patch.role) {
    const role = patch.role
    if (role === 'INPUT') return { role: 'INPUT', flowRole: 'entry' }
    if (role === 'OUTPUT') return { role: 'OUTPUT', flowRole: 'exit' }
    if (unit.flowRole === 'entry' || unit.flowRole === 'exit') {
      return {
        role,
        flowRole: null,
        ...(clearInterface ? { interfaceUnit: null } : {}),
      }
    }
    if (role === 'TRANSFER' && clearInterface) {
      return { role, interfaceUnit: null }
    }
    return { role }
  }

  return patch
}

function migratePortProperties(raw: UnitRoleProperties | null | undefined): PortProperties | null {
  if (!raw || typeof raw !== 'object') return null
  if ('capacity' in raw) return null
  if (
    'targetStkPolicy' in raw &&
    !('linkedUnitId' in raw) &&
    !('linkedStkId' in raw) &&
    !('outputDestination' in raw)
  ) {
    return null
  }

  const legacy = raw as PortProperties & { linkedStkId?: string }
  return {
    enabled: legacy.enabled ?? true,
    linkedUnitId: legacy.linkedUnitId ?? '',
    outputDestination: legacy.outputDestination ?? '',
    description: legacy.description ?? '',
  }
}

function normalizePortPropertyRefs(
  line: UnitLineContext,
  port: ConveyorUnit,
  properties: PortProperties,
): PortProperties {
  const linkedUnitId = resolvePortLineCvId(line, port, properties.linkedUnitId)

  let outputDestination = resolveOutputDestinationId(
    line,
    port.id,
    properties.outputDestination ?? '',
  )
  if (outputDestination) {
    const reachable = new Set(
      listReachableOutputDestinations(line as ConveyorLine, port.id).map(
        (unit) => unit.id,
      ),
    )
    if (!reachable.has(outputDestination)) {
      outputDestination = ''
    }
  }

  return {
    ...properties,
    linkedUnitId,
    outputDestination,
  }
}

export function getPortProperties(unit: ConveyorUnit): PortProperties | null {
  if (!isPortUnit(unit)) return null
  if (!unit.properties) return null
  if ('capacity' in unit.properties) return null

  const migrated = migratePortProperties(unit.properties)
  if (migrated) return migrated

  const raw = unit.properties as unknown as Record<string, unknown>
  if (
    typeof raw.outputDestination === 'string' ||
    typeof raw.linkedUnitId === 'string' ||
    typeof raw.linkedStkId === 'string'
  ) {
    return migratePortProperties({
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      linkedUnitId:
        typeof raw.linkedUnitId === 'string' ? raw.linkedUnitId : '',
      outputDestination:
        typeof raw.outputDestination === 'string' ? raw.outputDestination : '',
      description: typeof raw.description === 'string' ? raw.description : '',
    })
  }

  return null
}

export function getOutputPortProperties(unit: ConveyorUnit): PortProperties | null {
  if (unit.role !== 'PORT_OUT') return null
  return getPortProperties(unit)
}

/** 포트에 인접한 STK (연동 유닛과 별도 — STK가 포트 제어 기준) */
export function resolvePortAdjacentStk(
  line: UnitLineContext,
  port: ConveyorUnit,
): ConveyorUnit | null {
  const { cols, rows } = lineGridSize(line)
  return (
    getOrthogonalNeighborUnits(line.units, port, cols, rows).find(isStorageUnit) ??
    null
  )
}

/** STK에 인접한 포트 목록 — 멀티셀 스토커 전체 외곽을 순회 (포트 선택 모달용) */
export function resolveAdjacentPortsForStk(
  line: UnitLineContext,
  storage: ConveyorUnit,
): ConveyorUnit[] {
  const fp = getUnitFootprint(storage)
  const seen = new Set<string>()
  const ports: ConveyorUnit[] = []
  const offsets = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
  for (let dy = 0; dy < fp.rows; dy++) {
    for (let dx = 0; dx < fp.cols; dx++) {
      const cx = storage.gridX + dx
      const cy = storage.gridY + dy
      for (const [ox, oy] of offsets) {
        const nx = cx + ox
        const ny = cy + oy
        // 스토커 자신의 풋프린트 내부 제외
        if (nx >= storage.gridX && nx < storage.gridX + fp.cols &&
            ny >= storage.gridY && ny < storage.gridY + fp.rows) continue
        const neighbor = findUnitAtCell(line.units, nx, ny)
        if (neighbor && isPortUnit(neighbor) && !seen.has(neighbor.id)) {
          seen.add(neighbor.id)
          ports.push(neighbor)
        }
      }
    }
  }
  return ports
}

export function isJunctionUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'junction'
}

/** 분기·회전 연동 유닛 — 출고점 CV·포트만 허용 */
export function isTransitLinkedUnitCandidate(unit: ConveyorUnit): boolean {
  if (isPortUnit(unit)) return true
  return unit.flowRole === 'exit'
}

export function listJunctionLinkedUnitCandidates(
  line: UnitLineContext,
  junction: ConveyorUnit,
): ConveyorUnit[] {
  const { cols, rows } = lineGridSize(line)
  return getOrthogonalNeighborUnits(line.units, junction, cols, rows)
    .filter(
      (unit) =>
        unit.id !== junction.id &&
        !isStorageUnit(unit) &&
        unit.type !== 'junction',
    )
    .sort((a, b) =>
      unitDisplayCode(a).localeCompare(unitDisplayCode(b), undefined, {
        numeric: true,
      }),
    )
}

/** 분기·회전 — 인접 출고점·포트 연동 후보 */
export function listTransitLinkedUnitCandidates(
  line: UnitLineContext,
  unit: ConveyorUnit,
): ConveyorUnit[] {
  if (!isTurnRoutingUnit(unit)) return []
  const { cols, rows } = lineGridSize(line)
  return getOrthogonalNeighborUnits(line.units, unit, cols, rows)
    .filter(
      (candidate) =>
        candidate.id !== unit.id && isTransitLinkedUnitCandidate(candidate),
    )
    .sort((a, b) =>
      unitDisplayCode(a).localeCompare(unitDisplayCode(b), undefined, {
        numeric: true,
      }),
    )
}

function coerceTransitLinkedUnits(
  raw: TransitLinkedUnitsProperties | null | undefined,
): TransitLinkedUnitsProperties | null {
  if (!raw) return null
  const linkedUnitIds = normalizeRequestUnitIds(raw.linkedUnitIds)
  return { linkedUnitIds }
}

export function defaultTransitLinkedUnitsProperties(): TransitLinkedUnitsProperties {
  return { linkedUnitIds: [] }
}

export function getTransitLinkedUnitsProperties(
  unit: ConveyorUnit,
  line?: UnitLineContext,
): TransitLinkedUnitsProperties | null {
  if (!isTurnRoutingUnit(unit)) return null
  const coerced = coerceTransitLinkedUnits(unit.transitLinkedUnits)
  if (coerced) return coerced
  if (line && isJunctionUnit(unit) && unit.junctionRouting) {
    const legacyIds = getJunctionRequestUnitIds(unit.junctionRouting)
    if (legacyIds.length > 0) return { linkedUnitIds: legacyIds }
  }
  return defaultTransitLinkedUnitsProperties()
}

export function getTransitLinkedUnitIds(
  line: UnitLineContext,
  unit: ConveyorUnit,
): string[] {
  const props = getTransitLinkedUnitsProperties(unit, line)
  if (!props) return []
  const allowed = new Set(
    listTransitLinkedUnitCandidates(line, unit).map((candidate) => candidate.id),
  )
  return [...new Set(props.linkedUnitIds)].filter((id) => allowed.has(id))
}

/** 교차 흐름 — 연동 유닛 2개 이상일 때 앞 2개 사용 */
export function getTransitLinkedCrossPair(
  line: UnitLineContext,
  junction: ConveyorUnit,
): [string, string] | null {
  if (!isJunctionUnit(junction)) return null
  const ids = getTransitLinkedUnitIds(line, junction)
  if (ids.length < 2) return null
  return [ids[0]!, ids[1]!]
}

export function validateTransitLinkedUnits(
  line: UnitLineContext,
  unit: ConveyorUnit,
): Array<{ severity: 'warning' | 'error'; message: string }> {
  if (!isTurnRoutingUnit(unit)) return []

  const issues: Array<{ severity: 'warning' | 'error'; message: string }> = []
  const { cols, rows } = lineGridSize(line)
  const allowed = new Set(
    listTransitLinkedUnitCandidates(line, unit).map((candidate) => candidate.id),
  )
  const linkedUnitIds = getTransitLinkedUnitIds(line, unit)

  if (linkedUnitIds.length === 0) {
    issues.push({
      severity: 'warning',
      message: '연동할 출고점 또는 포트를 1개 이상 선택하세요.',
    })
    return issues
  }

  for (const linkedUnitId of linkedUnitIds) {
    if (!allowed.has(linkedUnitId)) {
      issues.push({
        severity: 'error',
        message: '연동 유닛은 인접한 출고점 또는 포트만 선택할 수 있습니다.',
      })
      continue
    }
    if (!areGridAdjacent(line.units, unit.id, linkedUnitId, cols, rows)) {
      issues.push({
        severity: 'warning',
        message: '연동 유닛과 그리드상 인접 배치가 필요합니다.',
      })
    }
  }

  return issues
}

function normalizeRequestUnitIds(
  value: unknown,
  legacySingle?: string,
): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && Boolean(id))
  }
  if (typeof value === 'string' && value) {
    return [value]
  }
  if (legacySingle) return [legacySingle]
  return []
}

export function getJunctionRequestUnitIds(props: JunctionRoutingProperties): string[] {
  const legacy =
    typeof props.requestUnitId === 'string' ? props.requestUnitId : undefined
  return [...new Set(normalizeRequestUnitIds(props.requestUnitIds, legacy))].slice(0, 2)
}

function syncJunctionRoutingIds(
  props: Partial<JunctionRoutingProperties> & {
    ldUnitId?: string
    uldUnitId?: string
  },
): JunctionRoutingProperties {
  const legacy =
    props.requestUnitId ?? props.uldUnitId ?? props.ldUnitId ?? undefined
  const ids = [...new Set(normalizeRequestUnitIds(props.requestUnitIds, legacy))].slice(
    0,
    2,
  )
  return {
    description: props.description,
    requestUnitIds: ids,
    requestUnitId: ids[0] ?? '',
  }
}

export function findFeederAdjacentToJunction(
  junction: ConveyorUnit,
  unitId: string,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit | null {
  if (junction.connections.includes(unitId)) {
    return unitMap.get(unitId) ?? null
  }

  const queue = [unitId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const unit = unitMap.get(id)
    if (!unit) continue

    for (const neighborId of unit.connections) {
      if (neighborId === junction.id) return unit
      if (!visited.has(neighborId) && unitMap.has(neighborId)) {
        queue.push(neighborId)
      }
    }
  }

  return null
}

export function listJunctionBranchUnitIds(
  line: UnitLineContext,
  junction: ConveyorUnit,
  requestUnitId: string,
): string[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const feeder = findFeederAdjacentToJunction(junction, requestUnitId, unitMap)
  if (!feeder) return requestUnitId ? [requestUnitId] : []
  return walkAxisAlignedBranchUnits(junction, feeder, unitMap).map((unit) => unit.id)
}

/** 분기 직진에 수직인 측면 — 요청 CV가 분기로 들어오는 방향(N/E/S/W) */
export function junctionRequestPerpendicularDirKeyForUnit(
  line: UnitLineContext,
  junction: ConveyorUnit,
  unitId: string,
): string | null {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const through = computeJunctionThroughFlow(junction, unitMap, line as ConveyorLine)
  if (!through.inDir) return null

  const feeder = findFeederAdjacentToJunction(junction, unitId, unitMap)
  if (!feeder) return null

  const entryDir = flowEntryDir(feeder, junction)
  if (!entryDir || !isPerpendicularFlow(through.inDir, entryDir)) return null
  return entryDir
}

type JunctionBranchAxis = 'horizontal' | 'vertical'

function junctionBranchAxisFromFeeder(
  feeder: ConveyorUnit,
  junction: ConveyorUnit,
): JunctionBranchAxis | null {
  const dx = feeder.gridX - junction.gridX
  const dy = feeder.gridY - junction.gridY
  if (dx !== 0 && dy === 0) return 'horizontal'
  if (dx === 0 && dy !== 0) return 'vertical'
  return null
}

function walkAxisAlignedBranchUnits(
  junction: ConveyorUnit,
  feederAdjacent: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  const axis = junctionBranchAxisFromFeeder(feederAdjacent, junction)
  const alongBranch =
    axis === 'horizontal'
      ? new Set<FlowDir>(['E', 'W'])
      : axis === 'vertical'
        ? new Set<FlowDir>(['N', 'S'])
        : null
  if (!alongBranch) return [feederAdjacent]

  const collected: ConveyorUnit[] = []
  const visited = new Set<string>([junction.id])

  function visit(current: ConveyorUnit, prevId: string) {
    if (visited.has(current.id)) return
    visited.add(current.id)
    collected.push(current)

    for (const neighborId of current.connections) {
      if (neighborId === prevId || neighborId === junction.id) continue
      const next = unitMap.get(neighborId)
      if (!next || isStorageUnit(next) || isPortUnit(next) || next.type === 'junction') {
        continue
      }

      const stepDir = flowExitDir(current, next)
      if (stepDir && alongBranch.has(stepDir)) {
        visit(next, current.id)
      }
    }
  }

  visit(feederAdjacent, junction.id)
  return collected
}

function walkPerpendicularBranchUnits(
  junction: ConveyorUnit,
  feederAdjacent: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  return walkAxisAlignedBranchUnits(junction, feederAdjacent, unitMap)
}

function sortUnitsByDisplayCode(units: ConveyorUnit[]): ConveyorUnit[] {
  return [...units].sort((a, b) =>
    unitDisplayCode(a).localeCompare(unitDisplayCode(b), undefined, {
      numeric: true,
    }),
  )
}

export function isJunctionRequestUnitCandidate(
  line: UnitLineContext,
  junction: ConveyorUnit,
  candidateId: string,
): boolean {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  return (
    computeJunctionDivertFlow(
      junction,
      unitMap,
      line as ConveyorLine,
      candidateId,
    ) != null
  )
}

export function isJunctionStraightLineRequestUnit(
  line: UnitLineContext,
  junction: ConveyorUnit,
  unitId: string,
): boolean {
  return listJunctionRequestSecondaryUnitCandidates(line, junction).some(
    (unit) => unit.id === unitId,
  )
}

export function listJunctionRequestUnitCandidates(
  line: UnitLineContext,
  junction: ConveyorUnit,
): ConveyorUnit[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const linked = listJunctionLinkedUnitCandidates(line, junction)
  const perpendicularFeeders = linked.filter((unit) =>
    isJunctionRequestUnitCandidate(line, junction, unit.id),
  )

  const byId = new Map<string, ConveyorUnit>()
  for (const feeder of perpendicularFeeders) {
    for (const unit of walkPerpendicularBranchUnits(junction, feeder, unitMap)) {
      byId.set(unit.id, unit)
    }
  }

  return sortUnitsByDisplayCode([...byId.values()])
}

/** 분기 요청 CV 2 — 분기와 가로·세로 직선으로 연결된 CV (연장선 포함) */
export function listJunctionRequestSecondaryUnitCandidates(
  line: UnitLineContext,
  junction: ConveyorUnit,
): ConveyorUnit[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const linked = listJunctionLinkedUnitCandidates(line, junction)
  const byId = new Map<string, ConveyorUnit>()

  for (const feeder of linked) {
    for (const unit of walkAxisAlignedBranchUnits(junction, feeder, unitMap)) {
      byId.set(unit.id, unit)
    }
  }

  return sortUnitsByDisplayCode([...byId.values()])
}

export function defaultJunctionRoutingProperties(
  line: UnitLineContext,
  junction: ConveyorUnit,
): JunctionRoutingProperties {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const candidates = listJunctionLinkedUnitCandidates(line, junction)
  const through = computeJunctionThroughFlow(junction, unitMap, line as ConveyorLine)

  const perpendicular = candidates.find((candidate) => {
    if (!through.inDir) return false
    const divert = computeJunctionDivertFlow(junction, unitMap, line as ConveyorLine, candidate.id)
    return divert != null
  })

  return syncJunctionRoutingIds(
    perpendicular ? { requestUnitIds: [perpendicular.id] } : {},
  )
}

function coerceJunctionRouting(
  raw: JunctionRoutingProperties | null | undefined,
): JunctionRoutingProperties | null {
  if (!raw) return null
  return syncJunctionRoutingIds(raw)
}

export function validateJunctionConfiguration(
  line: UnitLineContext,
  junction: ConveyorUnit,
): Array<{ severity: 'warning' | 'error'; message: string }> {
  const props = getJunctionRoutingProperties(junction, line)
  if (!props) return []

  const issues: Array<{ severity: 'warning' | 'error'; message: string }> = []
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const { cols, rows } = lineGridSize(line)
  const allowed = new Set(
    listJunctionLinkedUnitCandidates(line, junction).map((unit) => unit.id),
  )

  const requestUnitIds = getJunctionRequestUnitIds(props)

  if (requestUnitIds.length === 0) {
    issues.push({
      severity: 'warning',
      message: '분기 요청 컨베이어를 1개 이상 지정하세요.',
    })
    return issues
  }

  if (requestUnitIds.length > 2) {
    issues.push({
      severity: 'error',
      message: '분기 요청 컨베이어는 최대 2개까지 지정할 수 있습니다.',
    })
  }

  for (let index = 0; index < requestUnitIds.length; index++) {
    const requestUnitId = requestUnitIds[index]!
    const feeder = findFeederAdjacentToJunction(junction, requestUnitId, unitMap)
    const isPrimary = index === 0

    if (isPrimary) {
      if (!feeder || !isJunctionRequestUnitCandidate(line, junction, feeder.id)) {
        issues.push({
          severity: 'error',
          message:
            '분기 요청 컨베이어 1은 직진에 수직인 인접 분기 CV 또는 그 연장선이어야 합니다.',
        })
        continue
      }

      const perpKey = junctionRequestPerpendicularDirKeyForUnit(line, junction, requestUnitId)
      if (!perpKey) {
        issues.push({
          severity: 'error',
          message: '분기 요청 컨베이어 1은 주행 방향과 수직인 인접 CV여야 합니다.',
        })
      }
    } else if (!isJunctionStraightLineRequestUnit(line, junction, requestUnitId)) {
      issues.push({
        severity: 'error',
        message:
          '분기 요청 컨베이어 2는 분기와 가로·세로 직선으로 연결된 CV만 선택할 수 있습니다.',
      })
      continue
    }

    if (!feeder) {
      issues.push({
        severity: 'error',
        message: '분기 요청 컨베이어가 분기 모듈과 연결되어 있지 않습니다.',
      })
      continue
    }

    if (!allowed.has(feeder.id)) {
      issues.push({
        severity: 'error',
        message: '분기 요청 컨베이어가 분기 모듈과 인접하지 않습니다.',
      })
    }

    if (!areGridAdjacent(line.units, junction.id, feeder.id, cols, rows)) {
      issues.push({
        severity: 'warning',
        message: '분기 요청 컨베이어와 그리드상 인접 배치가 필요합니다.',
      })
    }
  }

  return issues
}

/** 포트 다음 물류 방향 — 인접 컨베이어만 (STK 제외) */
export function listPortLinkedUnitCandidates(
  line: UnitLineContext,
  port: ConveyorUnit,
): ConveyorUnit[] {
  const { cols, rows } = lineGridSize(line)
  return getOrthogonalNeighborUnits(line.units, port, cols, rows)
    .filter((unit) => !isPortUnit(unit) && isFlowCapableUnit(unit))
    .sort((a, b) =>
      unitDisplayCode(a).localeCompare(unitDisplayCode(b), undefined, {
        numeric: true,
      }),
    )
}

export function resolvePortLineCvId(
  line: UnitLineContext,
  port: ConveyorUnit,
  ref: string | null | undefined,
): string {
  const unit = findUnitByRef(line, ref)
  if (!unit || !isFlowCapableUnit(unit)) return ''
  const allowed = new Set(
    listPortLinkedUnitCandidates(line, port).map((candidate) => candidate.id),
  )
  return allowed.has(unit.id) ? unit.id : ''
}

function connectedLinkCandidates(
  line: UnitLineContext,
  port?: ConveyorUnit,
): ConveyorUnit[] {
  if (!port) return []
  return listPortLinkedUnitCandidates(line, port)
}

export function defaultPortProperties(
  line: UnitLineContext,
  port?: ConveyorUnit,
): PortProperties {
  const candidates = connectedLinkCandidates(line, port)
  const preferred = candidates[0] ?? null

  return {
    enabled: true,
    linkedUnitId: preferred?.id ?? '',
    outputDestination: '',
    description: '',
  }
}

/** UI·패치용 — 저장값 우선, 없으면 빈 포트 속성 */
export function readPortProperties(
  line: UnitLineContext,
  port: ConveyorUnit,
): PortProperties {
  const existing = getPortProperties(port)
  const base = existing ?? defaultPortProperties(line, port)
  return normalizePortPropertyRefs(line, port, base)
}

export function mergePortProperties(
  line: UnitLineContext,
  port: ConveyorUnit,
  patch: Partial<PortProperties>,
): PortProperties {
  const merged = { ...readPortProperties(line, port), ...patch }
  return normalizePortPropertyRefs(line, port, merged)
}

export function updatePortPropertiesInLine(
  line: ConveyorLine,
  portId: string,
  patch: Partial<PortProperties>,
): ConveyorLine {
  const port = line.units.find((unit) => unit.id === portId)
  if (!port || !isPortUnit(port)) return line

  const direction = port.portDirection ?? 'IN'
  return updateUnitInLine(line, portId, {
    role: portRoleFromDirection(direction),
    properties: mergePortProperties(line, port, patch),
  })
}

/** @deprecated defaultPortProperties 사용 */
export function defaultOutputPortProperties(
  line: UnitLineContext,
  port?: ConveyorUnit,
): PortProperties {
  return defaultPortProperties(line, port)
}

export function defaultStkProperties(line: UnitLineContext): StkProperties {
  const inputSources = line.units
    .filter((unit) => inferUnitRole(unit, line) === 'INPUT' || inferUnitRole(unit, line) === 'PORT_IN')
    .map((unit) => unit.id)
  const outputPorts = line.units
    .filter((unit) => inferUnitRole(unit, line) === 'PORT_OUT')
    .map((unit) => unit.id)

  return {
    capacity: DEFAULT_STK_CAPACITY,
    currentLoad: 0,
    stkOrder: 1,
    enabled: true,
    inputSources,
    outputPorts,
    description: '',
  }
}

export function defaultPropertiesForRole(
  role: UnitRole,
  line: UnitLineContext,
  unit?: ConveyorUnit,
): UnitRoleProperties | null {
  if (role === 'STORAGE') return defaultStkProperties(line)
  if (role === 'PORT_IN' || role === 'PORT_OUT') return defaultPortProperties(line, unit)
  return null
}

export function getJunctionRoutingProperties(
  unit: ConveyorUnit,
  line?: UnitLineContext,
): JunctionRoutingProperties | null {
  if (!isJunctionUnit(unit)) return null
  const coerced = coerceJunctionRouting(unit.junctionRouting)
  if (coerced) return coerced
  if (line) return defaultJunctionRoutingProperties(line, unit)
  return null
}

export function getStkProperties(unit: ConveyorUnit): StkProperties | null {
  if (!isStorageUnit(unit)) return null
  if (!unit.properties || !('capacity' in unit.properties)) return null
  return unit.properties
}

export function computeStkLoadRate(stk: ConveyorUnit): number {
  const props = getStkProperties(stk)
  if (!props || props.capacity <= 0) return 0
  return Math.round((props.currentLoad / props.capacity) * 100)
}

export function validatePortConfiguration(
  line: ConveyorLine,
  port: ConveyorUnit,
): PortValidationIssue[] {
  if (!isPortUnit(port)) return []

  const issues: PortValidationIssue[] = []
  const direction = port.portDirection ?? 'IN'
  const expectedRole = portRoleFromDirection(direction)

  if (port.role && port.role !== expectedRole) {
    issues.push({
      severity: 'warning',
      message: `역할과 방향이 일치하지 않습니다. 방향 ${direction} → ${expectedRole === 'PORT_IN' ? '투입고' : '출고구'}`,
    })
  }

  const props = getPortProperties(port)
  if (!props?.linkedUnitId) {
    return issues
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const linked = unitMap.get(props.linkedUnitId)
  if (!linked || !isFlowCapableUnit(linked)) {
    issues.push({ severity: 'warning', message: '연동 컨베이어를 찾을 수 없습니다.' })
    return issues
  }

  const { cols, rows } = lineGridSize(line)
  if (!areGridAdjacent(line.units, port.id, props.linkedUnitId, cols, rows)) {
    issues.push({
      severity: 'warning',
      message: '연동 유닛과 그리드상 연결이 없습니다. 인접 배치 후 연결하세요.',
    })
  }

  return issues
}

export function normalizeUnitRoleFields(
  unit: ConveyorUnit,
  line: UnitLineContext,
): ConveyorUnit {
  let role = inferUnitRole(unit, line)
  let properties = unit.properties ?? null
  let transitLinkedUnits = unit.transitLinkedUnits ?? null
  let junctionRouting = unit.junctionRouting ?? null
  let portDirection = unit.portDirection

  if (isPortUnit(unit)) {
    portDirection = unit.portDirection ?? 'IN'
    const portRole = portRoleFromDirection(portDirection)
    if (properties && 'capacity' in properties) {
      properties = null
    }
    if (!properties) {
      properties = defaultPortProperties(line, unit)
    } else {
      const migrated = migratePortProperties(properties as UnitRoleProperties)
      if (migrated) {
        properties = {
          ...defaultPortProperties(line, unit),
          ...migrated,
        }
      } else {
        const raw = properties as unknown as Record<string, unknown>
        const salvagedDestination =
          typeof raw.outputDestination === 'string' ? raw.outputDestination : ''
        properties = {
          ...defaultPortProperties(line, unit),
          ...(salvagedDestination
            ? { outputDestination: salvagedDestination }
            : {}),
        }
      }
    }
    properties = normalizePortPropertyRefs(line, unit, properties)
    return {
      ...unit,
      code: syncUnitCodeWithName(unit).code,
      portDirection,
      role: portRole,
      properties,
      transitLinkedUnits: null,
      junctionRouting: null,
    }
  }

  if (isStorageUnit(unit)) {
    if (!properties || !('capacity' in properties)) {
      properties = defaultStkProperties(line)
    }
    return syncUnitCodeWithName({
      ...unit,
      code: unit.code?.trim() || unit.name,
      role: 'STORAGE',
      properties,
      transitLinkedUnits: null,
      junctionRouting: null,
      portDirection: null,
    })
  }

  if (isTurnRoutingUnit(unit)) {
    const legacyStkRouting =
      (unit as ConveyorUnit & { stkRouting?: StkRoutingProperties | null }).stkRouting ??
      (unit.properties && 'targetStkPolicy' in unit.properties
        ? (unit.properties as unknown as StkRoutingProperties)
        : null)
    if (legacyStkRouting && !transitLinkedUnits && isJunctionUnit(unit) && junctionRouting) {
      const legacyIds = getJunctionRequestUnitIds(junctionRouting)
      if (legacyIds.length > 0) {
        transitLinkedUnits = { linkedUnitIds: legacyIds }
      }
    }
    transitLinkedUnits =
      coerceTransitLinkedUnits(transitLinkedUnits) ??
      defaultTransitLinkedUnitsProperties()
    junctionRouting = null
    if (legacyStkRouting && role === 'TRANSFER') {
      properties = null
    }
  } else {
    transitLinkedUnits = null
    junctionRouting = null
  }

  if (role === 'STORAGE' && !properties) {
    properties = defaultStkProperties(line)
  }

  if (role !== 'STORAGE' && role !== 'PORT_IN' && role !== 'PORT_OUT') {
    properties = null
  }

  const syncedFlowRole = unit.flowRole ?? null
  if (syncedFlowRole === 'entry') role = 'INPUT'
  else if (syncedFlowRole === 'exit') role = 'OUTPUT'

  return syncUnitCodeWithName({
    ...unit,
    code: unit.code?.trim() || unit.name,
    role,
    flowRole: syncedFlowRole,
    properties,
    transitLinkedUnits,
    junctionRouting,
    portDirection,
  })
}

export function normalizeLineRoleFields<
  T extends {
    units: ConveyorUnit[]
    baseUnitId?: string | null
    gridSize?: ConveyorLine['gridSize']
  },
>(line: T): T {
  const context: UnitLineContext = {
    units: line.units,
    baseUnitId: line.baseUnitId,
    gridSize: line.gridSize,
  }
  return {
    ...line,
    units: line.units.map((unit) => normalizeUnitRoleFields(unit, context)),
  }
}
