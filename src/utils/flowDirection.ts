import type { ConveyorLine, ConveyorType, ConveyorUnit, PortDirection } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { getUnitFootprint } from './unitFootprint'
import { parseTrailingNumber } from './sequentialNaming'

export type FlowDir = 'N' | 'E' | 'S' | 'W'

export interface UnitFlowDirs {
  inDir: FlowDir | null
  outDir: FlowDir | null
  /** CV 순번 (표시용) */
  cvNumber: number | null
  /** 물류 구간 역할 */
  role: 'start' | 'end' | 'through' | 'single'
  /** 포트 IN/OUT (미니맵 표시용) */
  portDirection?: PortDirection | null
}

const FLOW_ARROW_TYPES = new Set<ConveyorType>([
  'straight',
  'turn',
  'junction',
  'lift',
])

/** 이전 → 현재 유닛 진입 방향 (어느 변에서 들어오는지) */
export function flowEntryDir(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const dx = to.gridX - from.gridX
  const dy = to.gridY - from.gridY
  if (dx === 1) return 'W'
  if (dx === -1) return 'E'
  if (dy === 1) return 'N'
  if (dy === -1) return 'S'
  return null
}

/** 현재 → 다음 유닛 이탈 방향 */
export function flowExitDir(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const dx = to.gridX - from.gridX
  const dy = to.gridY - from.gridY
  if (dx === 1) return 'E'
  if (dx === -1) return 'W'
  if (dy === 1) return 'S'
  if (dy === -1) return 'N'
  return null
}

export function isPerpendicularFlow(inDir: FlowDir, outDir: FlowDir): boolean {
  const horizontal = inDir === 'E' || inDir === 'W'
  const outHorizontal = outDir === 'E' || outDir === 'W'
  return horizontal !== outHorizontal
}

export function oppositeFlowDir(dir: FlowDir): FlowDir {
  switch (dir) {
    case 'N':
      return 'S'
    case 'S':
      return 'N'
    case 'E':
      return 'W'
    case 'W':
      return 'E'
  }
}

function getUnitCenter(unit: ConveyorUnit): { x: number; y: number } {
  const footprint = getUnitFootprint(unit)
  return {
    x: unit.gridX + footprint.cols / 2,
    y: unit.gridY + footprint.rows / 2,
  }
}

/** 유닛 중심 기준 from → to 방향 (적재창고 등 다칸 유닛 포함) */
export function dirToward(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const a = getUnitCenter(from)
  const b = getUnitCenter(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

function findConnectedNeighbor(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  predicate: (neighbor: ConveyorUnit) => boolean,
): ConveyorUnit | null {
  for (const id of unit.connections) {
    const neighbor = unitMap.get(id)
    if (neighbor && predicate(neighbor)) return neighbor
  }
  return null
}

/** 포트 IN/OUT — IN은 적재창고 방향, OUT은 IN의 반대 방향 */
export function computePortFlowDirs(
  port: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): UnitFlowDirs | null {
  if (!isPortUnit(port)) return null

  const storage = findConnectedNeighbor(port, unitMap, isStorageUnit)
  const direction = port.portDirection ?? 'IN'

  const towardStorage = storage ? dirToward(port, storage) : null
  if (!towardStorage) return null

  const outDir = direction === 'IN' ? towardStorage : oppositeFlowDir(towardStorage)
  const inDir = oppositeFlowDir(outDir)

  return {
    inDir,
    outDir,
    cvNumber: null,
    role: 'through',
    portDirection: direction,
  }
}

export function computePortFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = new Map<string, UnitFlowDirs>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    const flow = computePortFlowDirs(unit, unitMap)
    if (flow) result.set(unit.id, flow)
  }

  return result
}

export function computeMinimapFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = computeUnitFlowMap(line)
  for (const [id, flow] of computePortFlowMap(line)) {
    result.set(id, flow)
  }
  return result
}

function cvSequenceNumber(unit: ConveyorUnit): number | null {
  return parseTrailingNumber(unit.name)?.number ?? null
}

function getConnectedNeighbors(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): ConveyorUnit[] {
  return unit.connections
    .map((id) => unitMap.get(id))
    .filter((neighbor): neighbor is ConveyorUnit => Boolean(neighbor))
}

/**
 * 물류 이전/다음 — **물리적으로 연결된 이웃** 중 CV 순번이 ±1인 경우만.
 * CV10↔CV14처럼 번호가 뛰는 구간은 별도 라인으로 취급 (화살표 연결 안 함).
 */
function pickFlowNeighbors(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): { prev: ConveyorUnit | null; next: ConveyorUnit | null } {
  const neighbors = getConnectedNeighbors(unit, unitMap)
  const cvNum = cvSequenceNumber(unit)

  if (cvNum != null) {
    let prev: ConveyorUnit | null = null
    let next: ConveyorUnit | null = null

    for (const neighbor of neighbors) {
      const neighborCv = cvSequenceNumber(neighbor)
      if (neighborCv === cvNum - 1) prev = neighbor
      if (neighborCv === cvNum + 1) next = neighbor
    }

    return { prev, next }
  }

  // CV 이름 없는 회전/분기 — 연결된 CV 이웃 중 순번 차이가 정확히 1인 쌍만 잇기
  const cvNeighbors = neighbors
    .map((neighbor) => ({ neighbor, cv: cvSequenceNumber(neighbor) }))
    .filter((item): item is { neighbor: ConveyorUnit; cv: number } => item.cv != null)
    .sort((a, b) => a.cv - b.cv)

  for (let i = 0; i < cvNeighbors.length - 1; i += 1) {
    const left = cvNeighbors[i]
    const right = cvNeighbors[i + 1]
    if (right.cv - left.cv === 1) {
      return { prev: left.neighbor, next: right.neighbor }
    }
  }

  if (cvNeighbors.length === 1) {
    const only = cvNeighbors[0].neighbor
    const onlyCv = cvNeighbors[0].cv
    const hasLower = neighbors.some(
      (n) => cvSequenceNumber(n) === onlyCv - 1,
    )
    const hasHigher = neighbors.some(
      (n) => cvSequenceNumber(n) === onlyCv + 1,
    )
    if (hasLower) return { prev: only, next: null }
    if (hasHigher) return { prev: null, next: only }
  }

  return { prev: null, next: null }
}

export function computeUnitFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = new Map<string, UnitFlowDirs>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  for (const unit of line.units) {
    if (!FLOW_ARROW_TYPES.has(unit.type)) continue

    const { prev, next } = pickFlowNeighbors(unit, unitMap)
    const inDir = prev ? flowEntryDir(prev, unit) : null
    const outDir = next ? flowExitDir(unit, next) : null

    if (!inDir && !outDir) continue

    const cvNumber = cvSequenceNumber(unit)
    let role: UnitFlowDirs['role'] = 'single'
    if (inDir && outDir) role = 'through'
    else if (!inDir && outDir) role = 'start'
    else if (inDir && !outDir) role = 'end'

    result.set(unit.id, { inDir, outDir, cvNumber, role })
  }

  return result
}

export interface FlowSegment {
  startCv: number
  endCv: number
  label: string
}

/** 연속 CV 구간 목록 (예: CV01→CV10, CV14→CV18) */
export function computeFlowSegments(line: ConveyorLine): FlowSegment[] {
  const flowMap = computeUnitFlowMap(line)
  const cvUnits = line.units
    .filter((unit) => {
      const cv = parseTrailingNumber(unit.name)?.number
      return cv != null && flowMap.has(unit.id)
    })
    .map((unit) => ({
      unit,
      cv: parseTrailingNumber(unit.name)!.number,
    }))
    .sort((a, b) => a.cv - b.cv)

  if (cvUnits.length === 0) return []

  const segments: FlowSegment[] = []
  let segStart = cvUnits[0].cv
  let segEnd = cvUnits[0].cv

  for (let i = 1; i < cvUnits.length; i += 1) {
    const prev = cvUnits[i - 1]
    const curr = cvUnits[i]
    const prevFlow = flowMap.get(prev.unit.id)
    const linked =
      prevFlow?.outDir != null &&
      flowMap.get(curr.unit.id)?.inDir != null &&
      curr.cv === prev.cv + 1

    if (linked) {
      segEnd = curr.cv
    } else {
      segments.push(formatSegment(segStart, segEnd))
      segStart = curr.cv
      segEnd = curr.cv
    }
  }
  segments.push(formatSegment(segStart, segEnd))
  return segments
}

function formatSegment(startCv: number, endCv: number): FlowSegment {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    startCv,
    endCv,
    label:
      startCv === endCv
        ? `CV${pad(startCv)}`
        : `CV${pad(startCv)} → CV${pad(endCv)}`,
  }
}
