import { v4 as uuidv4 } from 'uuid'
import { showsRotation } from '../constants/conveyorTypes'
import type {
  ConveyorLine,
  ConveyorType,
  ConveyorUnit,
  Rotation,
} from '../types/conveyor'

export {
  CONVEYOR_TYPES,
  isDualModule,
  normalizeLine,
  normalizeUnit,
  showsRotation,
  typeDescription,
  typeLabel,
  unitTitle,
} from '../constants/conveyorTypes'

export function nextUnitName(units: ConveyorUnit[]): string {
  const numbers = units
    .map((u) => /^CV-(\d+)$/.exec(u.name)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : units.length + 1
  return `CV-${String(next).padStart(2, '0')}`
}

export function createUnit(
  type: ConveyorType,
  gridX: number,
  gridY: number,
  units: ConveyorUnit[],
): ConveyorUnit {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name: nextUnitName(units),
    gridX,
    gridY,
    type,
    rotation: 0,
    connections: [],
    status: 'idle',
    interfaceUnit: null,
    createdAt: now,
    updatedAt: now,
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
  return units.find((u) => u.gridX === gridX && u.gridY === gridY)
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
  if (findUnitAt(line.units, gridX, gridY)) return null
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
  if (findUnitAt(line.units, gridX, gridY)) return null

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
  patch: Partial<Pick<ConveyorUnit, 'name' | 'type' | 'status' | 'rotation' | 'interfaceUnit'>>,
): ConveyorLine {
  const units = line.units.map((u) =>
    u.id === unitId
      ? { ...u, ...patch, updatedAt: new Date().toISOString() }
      : u,
  )
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
  return units.some(
    (u) => u.gridX === gridX && u.gridY === gridY && u.id !== excludeUnitId,
  )
}
