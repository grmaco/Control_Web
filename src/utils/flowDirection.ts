import type { ConveyorLine, ConveyorType, ConveyorUnit, PortDirection, Rotation } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { getUnitFootprint } from './unitFootprint'
import { computeFlowOrder, parseTrailingNumber } from './sequentialNaming'
import { getTurnOpenings, isValidTurnFlow } from './turnArc'

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

/** 기준 CV 물류 순서상 이전 연결 유닛 (회전·분기 in 방향) */
function pickFlowPredecessor(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): ConveyorUnit | null {
  const { prev } = pickFlowNeighbors(unit, unitMap)
  if (prev) return prev

  if (!line.baseUnitId) return null

  const { orderedUnitIds } = computeFlowOrder(line, line.baseUnitId)
  const index = orderedUnitIds.indexOf(unit.id)
  if (index <= 0) return null

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = unitMap.get(orderedUnitIds[i])
    if (candidate && unit.connections.includes(candidate.id)) {
      return candidate
    }
  }

  return null
}

/** 회전 유닛 — 연결 이웃(CV03 등) + rotation(270°→CV05, 180°→CV13) 기준 in/out */
function computeTurnUnitFlow(
  turn: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { inDir: FlowDir | null; outDir: FlowDir | null } {
  const neighbors = getConnectedNeighbors(turn, unitMap)
  if (neighbors.length === 0) return { inDir: null, outDir: null }

  const prev = pickFlowPredecessor(turn, unitMap, line)
  if (!prev) return { inDir: null, outDir: null }

  const inDir = flowEntryDir(prev, turn)
  if (!inDir) return { inDir: null, outDir: null }

  const outDir = pickTurnOutDir(
    turn,
    inDir,
    neighbors,
    prev.id,
    turn.rotation,
  )

  return { inDir, outDir }
}

/** 회전 유닛 출구 — 후보 이웃 중 rotation 규칙으로 방향 선택 */
function resolveTurnOutAmongOptions(
  inDir: FlowDir,
  options: { neighbor: ConveyorUnit; dir: FlowDir }[],
  rotation: Rotation,
): FlowDir | null {
  if (options.length === 0) return null
  if (options.length === 1) return options[0].dir

  const [openA, openB] = getTurnOpenings(rotation)

  if (inDir === openA || inDir === openB) {
    const pairedOut = inDir === openA ? openB : openA
    const paired = options.find((item) => item.dir === pairedOut)
    if (paired) return paired.dir
  }

  const atOpenings = options.filter(
    (item) => item.dir === openA || item.dir === openB,
  )

  if (atOpenings.length === 1) return atOpenings[0].dir

  if (atOpenings.length > 1) {
    if (rotation === 180) {
      const opposite = oppositeFlowDir(inDir)
      const oppositeMatch = atOpenings.find((item) => item.dir === opposite)
      if (oppositeMatch) return oppositeMatch.dir
    }

    if (rotation === 90) {
      const perpendicular = atOpenings.find((item) =>
        isPerpendicularFlow(inDir, item.dir),
      )
      if (perpendicular) return perpendicular.dir
    }

    return atOpenings[0].dir
  }

  const drawable = options.filter((item) => isValidTurnFlow(inDir, item.dir))
  if (drawable.length === 1) return drawable[0].dir

  if (drawable.length > 1) {
    if (rotation === 180) {
      const opposite = oppositeFlowDir(inDir)
      const oppositeMatch = drawable.find((item) => item.dir === opposite)
      if (oppositeMatch) return oppositeMatch.dir
    }

    if (rotation === 90) {
      const perpendicular = drawable.find((item) =>
        isPerpendicularFlow(inDir, item.dir),
      )
      if (perpendicular) return perpendicular.dir
    }

    return drawable[0].dir
  }

  return options[0].dir
}

function pickTurnOutDir(
  turn: ConveyorUnit,
  inDir: FlowDir,
  neighbors: ConveyorUnit[],
  prevId: string,
  rotation: Rotation,
): FlowDir | null {
  const options = neighbors
    .filter((neighbor) => neighbor.id !== prevId)
    .map((neighbor) => ({
      neighbor,
      dir: flowExitDir(turn, neighbor),
    }))
    .filter((item): item is { neighbor: ConveyorUnit; dir: FlowDir } => item.dir != null)

  if (options.length === 0) return null

  const outAt270 = resolveTurnOutAmongOptions(inDir, options, 90)

  /** 270° — 기준 출구 (예: CV05) */
  if (rotation === 270) {
    return outAt270
  }

  /** 90° — 270° 출구의 반대 방향 */
  if (rotation === 90) {
    if (outAt270) {
      const mirrored = oppositeFlowDir(outAt270)
      const mirroredOption = options.find((item) => item.dir === mirrored)
      if (mirroredOption) return mirroredOption.dir
    }
    return resolveTurnOutAmongOptions(inDir, options, 270)
  }

  return resolveTurnOutAmongOptions(inDir, options, rotation)
}

/** 기준 CV BFS 체인 기준 — 시작·종료는 각 1개만 */
function resolveGlobalFlowEndpoints(line: ConveyorLine): {
  startId: string | null
  endId: string | null
} {
  if (!line.baseUnitId) return { startId: null, endId: null }

  const { orderedUnitIds, disconnectedUnitIds } = computeFlowOrder(
    line,
    line.baseUnitId,
  )
  if (orderedUnitIds.length === 0) return { startId: null, endId: null }

  const disconnected = new Set(disconnectedUnitIds)
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  const connectedFlowIds = orderedUnitIds.filter((id) => {
    if (disconnected.has(id)) return false
    const unit = unitMap.get(id)
    return unit != null && FLOW_ARROW_TYPES.has(unit.type)
  })

  if (connectedFlowIds.length === 0) {
    return { startId: null, endId: null }
  }

  const base = unitMap.get(line.baseUnitId)
  const startId =
    base != null &&
    !disconnected.has(line.baseUnitId) &&
    FLOW_ARROW_TYPES.has(base.type)
      ? line.baseUnitId
      : connectedFlowIds[0]

  return {
    startId,
    endId: connectedFlowIds[connectedFlowIds.length - 1],
  }
}

function applyGlobalStartEndRoles(
  result: Map<string, UnitFlowDirs>,
  line: ConveyorLine,
): void {
  const { startId, endId } = resolveGlobalFlowEndpoints(line)
  if (startId == null && endId == null) return

  for (const [id, flow] of result) {
    if (id === startId) {
      flow.role = flow.outDir ? 'start' : flow.inDir ? 'end' : 'single'
    } else if (id === endId) {
      flow.role = flow.inDir ? 'end' : flow.outDir ? 'start' : 'single'
    } else if (flow.role === 'start' || flow.role === 'end') {
      if (flow.inDir && flow.outDir) flow.role = 'through'
      else flow.role = 'single'
    }
  }
}

export function computeUnitFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = new Map<string, UnitFlowDirs>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  for (const unit of line.units) {
    if (!FLOW_ARROW_TYPES.has(unit.type)) continue

    let inDir: FlowDir | null = null
    let outDir: FlowDir | null = null

    if (unit.type === 'turn') {
      const turnFlow = computeTurnUnitFlow(unit, unitMap, line)
      inDir = turnFlow.inDir
      outDir = turnFlow.outDir
    } else {
      const { prev, next } = pickFlowNeighbors(unit, unitMap)
      inDir = prev ? flowEntryDir(prev, unit) : null
      outDir = next ? flowExitDir(unit, next) : null
    }

    if (!inDir && !outDir) continue

    const cvNumber = cvSequenceNumber(unit)
    let role: UnitFlowDirs['role'] = 'single'
    if (inDir && outDir) role = 'through'
    else if (!inDir && outDir) role = 'start'
    else if (inDir && !outDir) role = 'end'

    result.set(unit.id, { inDir, outDir, cvNumber, role })
  }

  applyGlobalStartEndRoles(result, line)

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
