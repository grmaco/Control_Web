import { v4 as uuidv4 } from 'uuid'
import type { ConveyorLine, Rotation } from '../types/conveyor'
import type { OhtRailType, OhtRailUnit, OhtUnit } from '../types/oht'
import {
  OHT_DIR_OFFSET,
  OHT_DIR_OPPOSITE,
  ohtRailFootprint,
  ohtRailOpenings,
} from '../constants/ohtRail'

// ── 구 타입 → 신 타입 마이그레이션 ───────────────────────────────────────────

const LEGACY_TYPE_MAP: Record<string, OhtRailType> = {
  curve:    'curve90',
  branchT:  'branchR',
  branchX:  'branchR',
  branchY:  'yBypass',
  cross:    'doubleBranch2',
  railGate: 'straight',
}

function migrateRailType(type: string): OhtRailType {
  return (LEGACY_TYPE_MAP[type] ?? type) as OhtRailType
}

// ── 읽기 헬퍼 ─────────────────────────────────────────────────────────────────

export function getOhtRails(line: ConveyorLine): OhtRailUnit[] {
  return (line.ohtRails ?? []).map((rail) => ({
    ...rail,
    type: migrateRailType(rail.type as string),
  }))
}

export function getOhtUnits(line: ConveyorLine): OhtUnit[] {
  return line.ohtUnits ?? []
}

export function findOhtRailAt(
  rails: OhtRailUnit[],
  gridX: number,
  gridY: number,
): OhtRailUnit | undefined {
  return rails.find((rail) => {
    const fp = ohtRailFootprint(rail.type, rail.rotation)
    return fp.some(({ dx, dy }) => rail.gridX + dx === gridX && rail.gridY + dy === gridY)
  })
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
 * type/rotation 을 제공하면 멀티셀 푸트프린트 전체를 검사한다.
 * 생략하면 앵커 1칸만 검사 (드래그 오버 미리보기 용).
 */
export function canPlaceOhtRailAt(
  line: ConveyorLine,
  gridX: number,
  gridY: number,
  excludeRailId?: string,
  type?: OhtRailType,
  rotation?: Rotation,
): boolean {
  const rails = getOhtRails(line)
  const fp =
    type != null
      ? ohtRailFootprint(type, rotation ?? 0)
      : [{ dx: 0, dy: 0 }]
  for (const { dx, dy } of fp) {
    const fx = gridX + dx
    const fy = gridY + dy
    if (!withinBounds(line, fx, fy)) return false
    const occupant = findOhtRailAt(rails, fx, fy)
    if (occupant && occupant.id !== excludeRailId) return false
  }
  return true
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
  if (!canPlaceOhtRailAt(line, gridX, gridY, undefined, type, 0)) return null
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
  if (!canPlaceOhtRailAt(line, gridX, gridY, railId, rail.type, rail.rotation)) return null
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
