import type { ConveyorLine, ConveyorUnit, PortDirection } from '../types/conveyor'
import type {
  PortProperties,
  StkProperties,
  StkRoutingProperties,
  UnitRole,
  UnitRoleProperties,
} from '../types/unitProperties'
import { parseTrailingNumber } from './sequentialNaming'
import { DEFAULT_STK_CAPACITY } from '../constants/unitRoles'
import { DEFAULT_GRID_SIZE } from '../constants/grid'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { isFlowCapableUnit, listReachableOutputDestinations } from './flowEntries'
import { resolveOutputDestinationId, findUnitByRef } from './unitRefs'
import {
  areGridAdjacent,
  getOrthogonalNeighborUnits,
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

/** UI·라벨용 — 캔버스와 동일하게 name 우선 */
export function unitDisplayCode(unit: ConveyorUnit): string {
  return unit.name?.trim() || unit.code?.trim() || ''
}

/** CV 순번 유닛 — name과 code 불일치 시 name 기준으로 맞춤 */
export function syncUnitCodeWithName(unit: ConveyorUnit): ConveyorUnit {
  const name = unit.name?.trim()
  if (!name) return unit

  if (unit.type === 'port' || unit.type === 'storage') {
    return { ...unit, code: unit.code?.trim() || name }
  }

  if (parseTrailingNumber(name)) {
    return { ...unit, code: name }
  }

  return { ...unit, code: unit.code?.trim() || name }
}

export function isTurnRoutingUnit(unit: ConveyorUnit): boolean {
  return unit.type === 'turn' || unit.type === 'junction'
}

export function isStkRoutingSourceUnit(unit: ConveyorUnit): boolean {
  return isTurnRoutingUnit(unit) && Boolean(unit.stkRouting?.enabled)
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
  if (unit.role) return unit.role
  if (isStorageUnit(unit)) return 'STORAGE'
  if (unit.flowRole === 'entry') return 'INPUT'
  if (unit.flowRole === 'exit') return 'OUTPUT'
  if (line?.baseUnitId === unit.id) return 'INPUT'
  return 'TRANSFER'
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

export function defaultStkRoutingProperties(line: UnitLineContext): StkRoutingProperties {
  const stkIds = line.units.filter(isStorageUnit).map((unit) => unit.id)
  return {
    enabled: true,
    priority: 1,
    targetStkPolicy: 'LOAD_RATE_FIRST',
    allowedStkIds: stkIds,
    description: '',
  }
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

export function getStkRoutingProperties(unit: ConveyorUnit): StkRoutingProperties | null {
  if (!isTurnRoutingUnit(unit)) return null
  return unit.stkRouting ?? null
}

export function getStkProperties(unit: ConveyorUnit): StkProperties | null {
  if (unit.role !== 'STORAGE' || !unit.properties) return null
  if ('capacity' in unit.properties) return unit.properties
  return null
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
  const role = inferUnitRole(unit, line)
  let properties = unit.properties ?? null
  let stkRouting = unit.stkRouting ?? null
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
      stkRouting: null,
    }
  }

  if (isTurnRoutingUnit(unit)) {
    if (
      !stkRouting &&
      unit.properties &&
      'targetStkPolicy' in unit.properties
    ) {
      stkRouting = unit.properties as unknown as StkRoutingProperties
      if (role === 'TRANSFER' || role === 'INPUT' || role === 'PORT_IN') {
        properties = null
      }
    }
    stkRouting = stkRouting ?? defaultStkRoutingProperties(line)
  } else {
    stkRouting = null
  }

  if (role === 'STORAGE' && !properties) {
    properties = defaultStkProperties(line)
  }

  if (role !== 'STORAGE' && role !== 'PORT_IN' && role !== 'PORT_OUT') {
    properties = null
  }

  return syncUnitCodeWithName({
    ...unit,
    code: unit.code?.trim() || unit.name,
    role,
    properties,
    stkRouting,
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
