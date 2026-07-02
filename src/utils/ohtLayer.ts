import { v4 as uuidv4 } from 'uuid'
import type { ConveyorLine, Rotation } from '../types/conveyor'
import type { OhtRailType, OhtRailUnit, OhtUnit } from '../types/oht'
import {
  OHT_DIR_OFFSET,
  OHT_DIR_OPPOSITE,
  ohtRailOpenings,
} from '../constants/ohtRail'

// ── 읽기 헬퍼 ─────────────────────────────────────────────────────────────────

export function getOhtRails(line: ConveyorLine): OhtRailUnit[] {
  return line.ohtRails ?? []
}

export function getOhtUnits(line: ConveyorLine): OhtUnit[] {
  return line.ohtUnits ?? []
}

export function findOhtRailAt(
  rails: OhtRailUnit[],
  gridX: number,
  gridY: number,
): OhtRailUnit | undefined {
  return rails.find((rail) => rail.gridX === gridX && rail.gridY === gridY)
}

export function findOhtUnitAt(
  units: OhtUnit[],
  gridX: number,
  gridY: number,
): OhtUnit | undefined {
  return units.find((unit) => unit.gridX === gridX && unit.gridY === gridY)
}

function withinBounds(line: ConveyorLine, gridX: number, gridY: number): boolean {
  return (
    gridX >= 0 &&
    gridY >= 0 &&
    gridX < line.gridSize.cols &&
    gridY < line.gridSize.rows
  )
}

/**
 * OHT 레일 배치 가능 여부.
 * 레일은 컨베이어 위에 겹쳐지는 별도 레이어이므로 컨베이어 units[]와는 충돌하지 않는다.
 * OHT 레일끼리만 같은 칸 중복 배치를 막는다.
 */
export function canPlaceOhtRailAt(
  line: ConveyorLine,
  gridX: number,
  gridY: number,
  excludeRailId?: string,
): boolean {
  if (!withinBounds(line, gridX, gridY)) return false
  const occupant = findOhtRailAt(getOhtRails(line), gridX, gridY)
  if (!occupant) return true
  return occupant.id === excludeRailId
}

export function canPlaceOhtUnitAt(
  line: ConveyorLine,
  gridX: number,
  gridY: number,
  excludeUnitId?: string,
): boolean {
  if (!withinBounds(line, gridX, gridY)) return false
  const occupant = findOhtUnitAt(getOhtUnits(line), gridX, gridY)
  if (!occupant) return true
  return occupant.id === excludeUnitId
}

// ── 명명 ──────────────────────────────────────────────────────────────────────

export function nextOhtUnitName(units: OhtUnit[]): string {
  let max = 0
  for (const unit of units) {
    const match = /^OHT-(\d+)$/.exec(unit.name)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `OHT-${String(max + 1).padStart(2, '0')}`
}

// ── 쓰기 (모두 순수 함수 · 새 line 반환) ──────────────────────────────────────

export function addOhtRailToLine(
  line: ConveyorLine,
  type: OhtRailType,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  if (!canPlaceOhtRailAt(line, gridX, gridY)) return null
  const now = new Date().toISOString()
  const rail: OhtRailUnit = {
    id: uuidv4(),
    gridX,
    gridY,
    type,
    rotation: 0,
    createdAt: now,
    updatedAt: now,
  }
  return {
    ...line,
    ohtRails: [...getOhtRails(line), rail],
    updatedAt: now,
  }
}

export function moveOhtRailInLine(
  line: ConveyorLine,
  railId: string,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  const rails = getOhtRails(line)
  const rail = rails.find((item) => item.id === railId)
  if (!rail) return null
  if (rail.gridX === gridX && rail.gridY === gridY) return line
  if (!canPlaceOhtRailAt(line, gridX, gridY, railId)) return null
  const now = new Date().toISOString()
  return {
    ...line,
    ohtRails: rails.map((item) =>
      item.id === railId ? { ...item, gridX, gridY, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function rotateOhtRailInLine(
  line: ConveyorLine,
  railId: string,
): ConveyorLine | null {
  const rails = getOhtRails(line)
  const rail = rails.find((item) => item.id === railId)
  if (!rail) return null
  const now = new Date().toISOString()
  const rotation = ((rail.rotation + 90) % 360) as Rotation
  return {
    ...line,
    ohtRails: rails.map((item) =>
      item.id === railId ? { ...item, rotation, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function removeOhtRailFromLine(
  line: ConveyorLine,
  railId: string,
): ConveyorLine {
  const now = new Date().toISOString()
  return {
    ...line,
    ohtRails: getOhtRails(line).filter((item) => item.id !== railId),
    updatedAt: now,
  }
}

export function addOhtUnitToLine(
  line: ConveyorLine,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  if (!canPlaceOhtUnitAt(line, gridX, gridY)) return null
  const now = new Date().toISOString()
  const units = getOhtUnits(line)
  const unit: OhtUnit = {
    id: uuidv4(),
    name: nextOhtUnitName(units),
    gridX,
    gridY,
    rotation: 0,
    createdAt: now,
    updatedAt: now,
  }
  return {
    ...line,
    ohtUnits: [...units, unit],
    updatedAt: now,
  }
}

export function moveOhtUnitInLine(
  line: ConveyorLine,
  unitId: string,
  gridX: number,
  gridY: number,
): ConveyorLine | null {
  const units = getOhtUnits(line)
  const unit = units.find((item) => item.id === unitId)
  if (!unit) return null
  if (unit.gridX === gridX && unit.gridY === gridY) return line
  if (!canPlaceOhtUnitAt(line, gridX, gridY, unitId)) return null
  const now = new Date().toISOString()
  return {
    ...line,
    ohtUnits: units.map((item) =>
      item.id === unitId ? { ...item, gridX, gridY, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function renameOhtUnitInLine(
  line: ConveyorLine,
  unitId: string,
  name: string,
): ConveyorLine {
  const now = new Date().toISOString()
  return {
    ...line,
    ohtUnits: getOhtUnits(line).map((item) =>
      item.id === unitId ? { ...item, name, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function rotateOhtUnitInLine(
  line: ConveyorLine,
  unitId: string,
): ConveyorLine | null {
  const units = getOhtUnits(line)
  const unit = units.find((item) => item.id === unitId)
  if (!unit) return null
  const now = new Date().toISOString()
  const rotation = ((unit.rotation + 90) % 360) as Rotation
  return {
    ...line,
    ohtUnits: units.map((item) =>
      item.id === unitId ? { ...item, rotation, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function setOhtUnitRotation(
  line: ConveyorLine,
  unitId: string,
  rotation: Rotation,
): ConveyorLine | null {
  const units = getOhtUnits(line)
  const unit = units.find((item) => item.id === unitId)
  if (!unit) return null
  const now = new Date().toISOString()
  return {
    ...line,
    ohtUnits: units.map((item) =>
      item.id === unitId ? { ...item, rotation, updatedAt: now } : item,
    ),
    updatedAt: now,
  }
}

export function removeOhtUnitFromLine(
  line: ConveyorLine,
  unitId: string,
): ConveyorLine {
  const now = new Date().toISOString()
  return {
    ...line,
    ohtUnits: getOhtUnits(line).filter((item) => item.id !== unitId),
    updatedAt: now,
  }
}

// ── 인접·연결 (개구부 기반) ────────────────────────────────────────────────────

/**
 * 한 레일의 각 개구부 방향에 대해, 그 방향으로 마주보는 개구부를 가진 인접 레일이 있는지.
 * 렌더 연속성(연결선) 및 Phase 2 경로그래프 간선 판정에 사용.
 */
export function ohtRailConnectedDirs(
  rail: OhtRailUnit,
  rails: OhtRailUnit[],
): Set<string> {
  const connected = new Set<string>()
  const openings = ohtRailOpenings(rail.type, rail.rotation)
  for (const dir of openings) {
    const offset = OHT_DIR_OFFSET[dir]
    const neighbor = findOhtRailAt(
      rails,
      rail.gridX + offset.dx,
      rail.gridY + offset.dy,
    )
    if (!neighbor) continue
    const neighborOpenings = ohtRailOpenings(neighbor.type, neighbor.rotation)
    if (neighborOpenings.includes(OHT_DIR_OPPOSITE[dir])) {
      connected.add(dir)
    }
  }
  return connected
}
