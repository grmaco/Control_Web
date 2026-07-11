import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_PORT_DIRECTION,
  DEFAULT_PORT_NUMBER_START,
  DEFAULT_PORT_RECIPE,
} from '../constants/port'
import {
  DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
  DEFAULT_WAREHOUSE_ROBOT_COUNT,
  DEFAULT_WAREHOUSE_SHAPE,
  DEFAULT_WAREHOUSE_WIDTH_CELLS,
  WAREHOUSE_FOOTPRINT_SIZE,
  WAREHOUSE_MAX_WIDTH_CELLS,
} from '../constants/warehouseUnit'
import { isPort, isStorage, showsRotation } from '../constants/conveyorTypes'
import type {
  ConveyorLine,
  ConveyorType,
  ConveyorUnit,
  ConveyorStatus,
  Rotation,
  TestMaterialFlag,
} from '../types/conveyor'
import { parseTrailingNumber, formatConveyorName } from './sequentialNaming'
import { defaultPropertiesForRole, normalizeUnitRoleFields } from './unitPropertyHelpers'
import {
  findUnitAtCell,
  getUnitFootprint,
  isFootprintAvailable,
  storageWidthOf,
} from './unitFootprint'

export {
  BUILDER_PALETTE_TYPES,
  CONVEYOR_TYPES,
  isDualModule,
  isPort,
  isPortUnit,
  isStorage,
  isStorageUnit,
  normalizeLine,
  normalizeUnit,
  showsRotation,
  typeDescription,
  typeLabel,
  unitTitle,
} from '../constants/conveyorTypes'

export {
  findUnitAtCell,
  getFootprintCells,
  getUnitFootprint,
  isFootprintAvailable,
  isUnitAnchor,
  unitOccupiesCell,
} from './unitFootprint'

export function nextUnitName(units: ConveyorUnit[]): string {
  let maxNumber = 0

  for (const unit of units) {
    if (isPort(unit.type) || isStorage(unit.type)) continue
    const parsed = parseTrailingNumber(unit.name)
    if (!parsed || parsed.prefix !== 'CV') continue
    if (parsed.number > maxNumber) maxNumber = parsed.number
  }

  return formatConveyorName(maxNumber + 1)
}

function parsePortSequenceNumber(unit: ConveyorUnit): number | null {
  for (const raw of [unit.code, unit.name]) {
    if (!raw?.trim()) continue
    const base = raw.replace(/\s+(IN|OUT)$/i, '').trim()
    const match = /^(\d+)$/.exec(base)
    if (match) return Number(match[1])
  }
  return null
}

export function nextPortName(units: ConveyorUnit[]): string {
  let maxNumber = DEFAULT_PORT_NUMBER_START - 1

  for (const unit of units) {
    if (!isPort(unit.type)) continue
    const number = parsePortSequenceNumber(unit)
    if (number != null && number >= DEFAULT_PORT_NUMBER_START && number > maxNumber) {
      maxNumber = number
    }
  }

  return String(maxNumber + 1)
}

export function nextStorageName(units: ConveyorUnit[]): string {
  const numbers = units
    .map((u) => /^(?:STK|ST)-(\d+)$/.exec(u.name)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `STK-${String(next).padStart(2, '0')}`
}

export function createUnit(
  type: ConveyorType,
  gridX: number,
  gridY: number,
  units: ConveyorUnit[],
): ConveyorUnit {
  const now = new Date().toISOString()
  const base = {
    id: uuidv4(),
    gridX,
    gridY,
    type,
    rotation: 0 as Rotation,
    connections: [] as string[],
    status: 'idle' as const,
    testMaterial: 0 as const,
    createdAt: now,
    updatedAt: now,
  }

  if (isPort(type)) {
    const portCode = nextPortName(units)
    return {
      ...base,
      name: portCode,
      code: portCode,
      interfaceUnit: null,
      portDirection: DEFAULT_PORT_DIRECTION,
      portRecipe: DEFAULT_PORT_RECIPE,
      portLinkedUnit: null,
      storageShape: null,
      storageRobotCount: null,
      storageMaintenanceArea: null,
      storageWidthCells: null,
    }
  }

  if (isStorage(type)) {
    return {
      ...base,
      name: nextStorageName(units),
      interfaceUnit: null,
      portDirection: null,
      portRecipe: null,
      portLinkedUnit: null,
      storageShape: DEFAULT_WAREHOUSE_SHAPE,
      storageRobotCount: DEFAULT_WAREHOUSE_ROBOT_COUNT,
      storageMaintenanceArea: DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
      storageWidthCells: DEFAULT_WAREHOUSE_WIDTH_CELLS,
    }
  }

  return {
    ...base,
    name: nextUnitName(units),
    interfaceUnit: null,
    portDirection: null,
    portRecipe: null,
    portLinkedUnit: null,
    storageShape: null,
    storageRobotCount: null,
    storageMaintenanceArea: null,
    storageWidthCells: null,
  }
}

const ADJACENT_OFFSETS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const

/** 현재 그리드 좌표 기준 직교 인접 유닛 (저장된 connections 무시) */
export function getOrthogonalNeighborUnits(
  units: ConveyorUnit[],
  unit: ConveyorUnit,
  cols: number,
  rows: number,
): ConveyorUnit[] {
  const neighbors: ConveyorUnit[] = []
  const seen = new Set<string>()

  for (const [dx, dy] of ADJACENT_OFFSETS) {
    const nx = unit.gridX + dx
    const ny = unit.gridY + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const neighbor = findUnitAt(units, nx, ny)
    if (neighbor && neighbor.id !== unit.id && !seen.has(neighbor.id)) {
      seen.add(neighbor.id)
      neighbors.push(neighbor)
    }
  }

  return neighbors
}

export function areGridAdjacent(
  units: ConveyorUnit[],
  aId: string,
  bId: string,
  cols: number,
  rows: number,
): boolean {
  const a = units.find((unit) => unit.id === aId)
  if (!a) return false
  return getOrthogonalNeighborUnits(units, a, cols, rows).some(
    (neighbor) => neighbor.id === bId,
  )
}

function findUnitAt(
  units: ConveyorUnit[],
  gridX: number,
  gridY: number,
): ConveyorUnit | undefined {
  return findUnitAtCell(units, gridX, gridY)
}

function addConnection(unit: ConveyorUnit, targetId: string): ConveyorUnit {
  if (unit.connections.includes(targetId)) return unit
  return {
    ...unit,
    connections: [...unit.connections, targetId],
    updatedAt: new Date().toISOString(),
  }
}

function removeConnection(unit: ConveyorUnit, targetId: string): ConveyorUnit {
  return {
    ...unit,
    connections: unit.connections.filter((id) => id !== targetId),
    updatedAt: new Date().toISOString(),
  }
}

export function syncConnectionsForUnit(
  units: ConveyorUnit[],
  unitId: string,
  cols: number,
  rows: number,
): ConveyorUnit[] {
  const unit = units.find((u) => u.id === unitId)
  if (!unit) return units

  const adjacentIds = new Set<string>()
  for (const neighbor of getOrthogonalNeighborUnits(units, unit, cols, rows)) {
    adjacentIds.add(neighbor.id)
  }

  return units.map((u) => {
    if (u.id === unitId) {
      return {
        ...u,
        connections: [...adjacentIds],
        updatedAt: new Date().toISOString(),
      }
    }
    if (adjacentIds.has(u.id)) {
      return addConnection(u, unitId)
    }
    if (u.connections.includes(unitId) && !adjacentIds.has(u.id)) {
      return removeConnection(u, unitId)
    }
    return u
  })
}

export function syncAllConnections(line: ConveyorLine): ConveyorLine {
  let units = line.units.map((u) => ({ ...u, connections: [] as string[] }))
  for (const unit of units) {
    units = syncConnectionsForUnit(units, unit.id, line.gridSize.cols, line.gridSize.rows)
  }
  return { ...line, units, updatedAt: new Date().toISOString() }
}

export function addUnitToLine(
  line: ConveyorLine,
  type: ConveyorType,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  const footprint = getUnitFootprint(type)
  if (
    !isFootprintAvailable(
      line.units,
      gridX,
      gridY,
      footprint,
      line.gridSize.cols,
      line.gridSize.rows,
    )
  ) {
    return null
  }

  const unit = createUnit(type, gridX, gridY, line.units)
  const unitsWithNew = [...line.units, unit]
  const normalizedUnit = normalizeUnitRoleFields(unit, {
    units: unitsWithNew,
    baseUnitId: line.baseUnitId,
    gridSize: line.gridSize,
  })
  const units = syncConnectionsForUnit(
    [...line.units, normalizedUnit],
    normalizedUnit.id,
    line.gridSize.cols,
    line.gridSize.rows,
  )
  return { ...line, units, updatedAt: new Date().toISOString() }
}

export function moveUnitInLine(
  line: ConveyorLine,
  unitId: string,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  const unit = line.units.find((u) => u.id === unitId)
  if (!unit) return null
  if (unit.gridX === gridX && unit.gridY === gridY) return line

  const footprint = getUnitFootprint(unit)
  if (
    !isFootprintAvailable(
      line.units,
      gridX,
      gridY,
      footprint,
      line.gridSize.cols,
      line.gridSize.rows,
      unitId,
    )
  ) {
    return null
  }

  let units = line.units.map((u) =>
    u.id === unitId
      ? { ...u, gridX, gridY, updatedAt: new Date().toISOString() }
      : u,
  )

  units = syncConnectionsForUnit(units, unitId, line.gridSize.cols, line.gridSize.rows)
  return { ...line, units, updatedAt: new Date().toISOString() }
}

/** 선택된 유닛들을 anchor 기준 동일 Δ만큼 이동 */
export function moveUnitsInLine(
  line: ConveyorLine,
  unitIds: string[],
  anchorUnitId: string,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  if (unitIds.length === 0) return null

  const anchor = line.units.find((u) => u.id === anchorUnitId)
  if (!anchor) return null

  const dx = gridX - anchor.gridX
  const dy = gridY - anchor.gridY
  if (dx === 0 && dy === 0) return line

  const movingIds = new Set(unitIds)
  const moving = line.units.filter((u) => movingIds.has(u.id))
  if (moving.length !== unitIds.length) return null

  const staticUnits = line.units.filter((u) => !movingIds.has(u.id))

  for (const unit of moving) {
    const nextX = unit.gridX + dx
    const nextY = unit.gridY + dy
    if (
      !isFootprintAvailable(
        staticUnits,
        nextX,
        nextY,
        getUnitFootprint(unit),
        line.gridSize.cols,
        line.gridSize.rows,
      )
    ) {
      return null
    }
  }

  let units = line.units.map((u) =>
    movingIds.has(u.id)
      ? {
          ...u,
          gridX: u.gridX + dx,
          gridY: u.gridY + dy,
          updatedAt: new Date().toISOString(),
        }
      : u,
  )

  for (const id of unitIds) {
    units = syncConnectionsForUnit(units, id, line.gridSize.cols, line.gridSize.rows)
  }

  return { ...line, units, updatedAt: new Date().toISOString() }
}

export function canMoveUnitsInLine(
  line: ConveyorLine,
  unitIds: string[],
  anchorUnitId: string,
  gridX: number,
  gridY: number,
): boolean {
  return moveUnitsInLine(line, unitIds, anchorUnitId, gridX, gridY) !== null
}

export function removeUnitFromLine(line: ConveyorLine, unitId: string): ConveyorLine {
  const units = line.units
    .filter((u) => u.id !== unitId)
    .map((u) => removeConnection(u, unitId))
  return { ...line, units, updatedAt: new Date().toISOString() }
}

export function updateUnitInLine(
  line: ConveyorLine,
  unitId: string,
  patch: Partial<
    Pick<
      ConveyorUnit,
      | 'name'
      | 'type'
      | 'status'
      | 'rotation'
      | 'interfaceUnit'
      | 'portDirection'
      | 'portRecipe'
      | 'portLinkedUnit'
      | 'storageShape'
      | 'storageRobotCount'
      | 'storageMaintenanceArea'
      | 'storageWidthCells'
      | 'testMaterial'
      | 'flowRole'
      | 'code'
      | 'role'
      | 'properties'
      | 'transitLinkedUnits'
      | 'junctionRouting'
    >
  >,
): ConveyorLine {
  const units = line.units.map((u) => {
    if (u.id !== unitId) return u

    const nextType = patch.type ?? u.type
    let next: ConveyorUnit = { ...u, ...patch, updatedAt: new Date().toISOString() }

    if (patch.role != null && patch.role !== u.role && patch.properties == null) {
      next.properties = defaultPropertiesForRole(patch.role, line, next)
    }

    if (nextType === 'port') {
      next = {
        ...next,
        type: 'port',
        // 포트도 직선 CV처럼 연동 유닛(OHT 등) 지정 가능 — STK 반대편에 라인 CV
        // 없이 단독 배치될 때 자재 반입/반출 수단이 됨.
        // 'interfaceUnit' in patch로 명시적 null(해제)과 미지정을 구분 —
        // ??를 쓰면 "없음" 선택(null) 이 이전 값으로 되돌아가 해제가 안 됨.
        interfaceUnit: 'interfaceUnit' in patch ? patch.interfaceUnit ?? null : u.interfaceUnit,
        portDirection: patch.portDirection ?? u.portDirection ?? DEFAULT_PORT_DIRECTION,
        portRecipe: patch.portRecipe ?? u.portRecipe ?? DEFAULT_PORT_RECIPE,
        portLinkedUnit: null,
        storageShape: null,
        storageRobotCount: null,
        storageMaintenanceArea: null,
        storageWidthCells: null,
      }
    } else if (nextType === 'storage') {
      next = {
        ...next,
        type: 'storage',
        interfaceUnit: null,
        portDirection: null,
        portRecipe: null,
        portLinkedUnit: null,
        storageShape: patch.storageShape ?? u.storageShape ?? DEFAULT_WAREHOUSE_SHAPE,
        storageRobotCount:
          patch.storageRobotCount ?? u.storageRobotCount ?? DEFAULT_WAREHOUSE_ROBOT_COUNT,
        storageMaintenanceArea:
          patch.storageMaintenanceArea ??
          u.storageMaintenanceArea ??
          DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
        storageWidthCells: Math.max(
          WAREHOUSE_FOOTPRINT_SIZE,
          patch.storageWidthCells ?? u.storageWidthCells ?? WAREHOUSE_FOOTPRINT_SIZE,
        ),
      }
    } else {
      next = {
        ...next,
        portDirection: null,
        portRecipe: null,
        portLinkedUnit: null,
        storageShape: null,
        storageRobotCount: null,
        storageMaintenanceArea: null,
        storageWidthCells: null,
      }
    }

    if (next.type === 'turn' || next.type === 'junction') {
      const contextUnits = line.units.map((item) => (item.id === unitId ? next : item))
      next = normalizeUnitRoleFields(next, {
        units: contextUnits,
        baseUnitId: line.baseUnitId,
        gridSize: line.gridSize,
      })
    }

    return next
  })
  return { ...line, units, updatedAt: new Date().toISOString() }
}

/** 선택된 유닛들에 동일 상태 일괄 적용 */
export function updateUnitsStatusInLine(
  line: ConveyorLine,
  unitIds: string[],
  status: ConveyorStatus,
): ConveyorLine {
  if (unitIds.length === 0) return line

  const idSet = new Set(unitIds)
  const now = new Date().toISOString()

  return {
    ...line,
    units: line.units.map((unit) =>
      idSet.has(unit.id) ? { ...unit, status, updatedAt: now } : unit,
    ),
    updatedAt: now,
  }
}

/** 선택된 유닛들에 동일 테스트 자재 플래그 일괄 적용 */
export function updateUnitsTestMaterialInLine(
  line: ConveyorLine,
  unitIds: string[],
  testMaterial: TestMaterialFlag,
): ConveyorLine {
  if (unitIds.length === 0) return line

  const idSet = new Set(unitIds)
  const now = new Date().toISOString()

  return {
    ...line,
    units: line.units.map((unit) =>
      idSet.has(unit.id) ? { ...unit, testMaterial, updatedAt: now } : unit,
    ),
    updatedAt: now,
  }
}

export function rotateUnit(unit: ConveyorUnit): Rotation | null {
  if (!showsRotation(unit.type)) return null
  return ((unit.rotation + 90) % 360) as Rotation
}

/**
 * 회전 적용 — 적재창고처럼 가로≠세로 유닛은 90° 회전 시 실제 배치 폭/깊이가
 * 뒤바뀌므로, 회전 후 풋프린트가 그리드 안에 들어오고 다른 유닛과 겹치지
 * 않는지 확인한 뒤에만 적용한다. 다른 유닛(항상 1×1이거나 정사각)은 회전해도
 * 풋프린트가 바뀌지 않아 이 검사가 사실상 항상 통과한다.
 */
export function rotateUnitInLine(line: ConveyorLine, unitId: string): ConveyorLine | null {
  const unit = line.units.find((u) => u.id === unitId)
  if (!unit) return null
  const rotation = rotateUnit(unit)
  if (rotation === null) return null

  const rotatedFootprint = getUnitFootprint({ ...unit, rotation })
  if (
    !isFootprintAvailable(
      line.units,
      unit.gridX,
      unit.gridY,
      rotatedFootprint,
      line.gridSize.cols,
      line.gridSize.rows,
      unitId,
    )
  ) {
    return null
  }

  return updateUnitInLine(line, unitId, { rotation })
}

/**
 * 적재창고 가로 칸 수 변경 — 그리드 경계·다른 유닛과의 충돌을 확인한 뒤에만
 * 적용한다(회전과 동일한 안전장치). 세로(깊이)는 항상 고정이라 검사 대상이
 * 아니다. 최소 WAREHOUSE_FOOTPRINT_SIZE·최대 WAREHOUSE_MAX_WIDTH_CELLS로 clamp.
 */
export function resizeStorageWidthInLine(
  line: ConveyorLine,
  unitId: string,
  widthCells: number,
): ConveyorLine | null {
  const unit = line.units.find((u) => u.id === unitId)
  if (!unit || !isStorage(unit.type)) return null

  const clamped = Math.min(
    WAREHOUSE_MAX_WIDTH_CELLS,
    Math.max(WAREHOUSE_FOOTPRINT_SIZE, Math.round(widthCells)),
  )
  if (clamped === storageWidthOf(unit)) return line

  const nextFootprint = getUnitFootprint({ ...unit, storageWidthCells: clamped })
  if (
    !isFootprintAvailable(
      line.units,
      unit.gridX,
      unit.gridY,
      nextFootprint,
      line.gridSize.cols,
      line.gridSize.rows,
      unitId,
    )
  ) {
    return null
  }

  return updateUnitInLine(line, unitId, { storageWidthCells: clamped })
}

export function isCellOccupied(
  units: ConveyorUnit[],
  gridX: number,
  gridY: number,
  excludeUnitId?: string,
): boolean {
  const occupant = findUnitAtCell(units, gridX, gridY)
  if (!occupant) return false
  return occupant.id !== excludeUnitId
}

export function canPlaceAt(
  units: ConveyorUnit[],
  type: ConveyorType,
  gridX: number,
  gridY: number,
  gridCols: number,
  gridRows: number,
  excludeUnitId?: string,
): boolean {
  return isFootprintAvailable(
    units,
    gridX,
    gridY,
    getUnitFootprint(type),
    gridCols,
    gridRows,
    excludeUnitId,
  )
}
