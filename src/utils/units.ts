import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_PORT_DIRECTION,
  DEFAULT_PORT_LINKED_UNIT,
  DEFAULT_PORT_RECIPE,
} from '../constants/port'
import {
  DEFAULT_WAREHOUSE_MAINTENANCE_AREA,
  DEFAULT_WAREHOUSE_ROBOT_COUNT,
  DEFAULT_WAREHOUSE_SHAPE,
} from '../constants/warehouseUnit'
import { isPort, isStorage, showsRotation } from '../constants/conveyorTypes'
import type {
  ConveyorLine,
  ConveyorType,
  ConveyorUnit,
  Rotation,
} from '../types/conveyor'
import { parseTrailingNumber } from './sequentialNaming'
import {
  findUnitAtCell,
  getUnitFootprint,
  isFootprintAvailable,
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
  let prefix = 'CV'
  let padWidth = 2

  for (const unit of units) {
    const parsed = parseTrailingNumber(unit.name)
    if (!parsed) continue
    if (parsed.number > maxNumber) {
      maxNumber = parsed.number
      prefix = parsed.prefix
      padWidth = parsed.padWidth
    }
  }

  const next = maxNumber > 0 ? maxNumber + 1 : 1
  return `${prefix}${String(next).padStart(padWidth, '0')}`
}

export function nextPortName(units: ConveyorUnit[]): string {
  const numbers = units
    .map((u) => /^PT-(\d+)$/.exec(u.name)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `PT-${String(next).padStart(2, '0')}`
}

export function nextStorageName(units: ConveyorUnit[]): string {
  const numbers = units
    .map((u) => /^ST-(\d+)$/.exec(u.name)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1
  return `ST-${String(next).padStart(2, '0')}`
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
    return {
      ...base,
      name: nextPortName(units),
      interfaceUnit: null,
      portDirection: DEFAULT_PORT_DIRECTION,
      portRecipe: DEFAULT_PORT_RECIPE,
      portLinkedUnit: DEFAULT_PORT_LINKED_UNIT,
      storageShape: null,
      storageRobotCount: null,
      storageMaintenanceArea: null,
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
  }
}

const ADJACENT_OFFSETS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const

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
  for (const [dx, dy] of ADJACENT_OFFSETS) {
    const nx = unit.gridX + dx
    const ny = unit.gridY + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    const neighbor = findUnitAt(units, nx, ny)
    if (neighbor) adjacentIds.add(neighbor.id)
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
  const units = syncConnectionsForUnit(
    [...line.units, unit],
    unit.id,
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
      | 'testMaterial'
    >
  >,
): ConveyorLine {
  const units = line.units.map((u) => {
    if (u.id !== unitId) return u

    const nextType = patch.type ?? u.type
    let next: ConveyorUnit = { ...u, ...patch, updatedAt: new Date().toISOString() }

    if (nextType === 'port') {
      next = {
        ...next,
        type: 'port',
        interfaceUnit: null,
        portDirection: patch.portDirection ?? u.portDirection ?? DEFAULT_PORT_DIRECTION,
        portRecipe: patch.portRecipe ?? u.portRecipe ?? DEFAULT_PORT_RECIPE,
        portLinkedUnit: patch.portLinkedUnit ?? u.portLinkedUnit ?? DEFAULT_PORT_LINKED_UNIT,
        storageShape: null,
        storageRobotCount: null,
        storageMaintenanceArea: null,
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
      }
    }

    return next
  })
  return { ...line, units, updatedAt: new Date().toISOString() }
}

export function rotateUnit(unit: ConveyorUnit): Rotation | null {
  if (!showsRotation(unit.type)) return null
  return ((unit.rotation + 90) % 360) as Rotation
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
