import type { ConveyorLine, ConveyorType, ConveyorUnit, PortDirection, Rotation } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { getEntryUnits, getExitUnits, isFlowCapableUnit } from './flowEntries'
import { getUnitFootprint } from './unitFootprint'
import { computeFlowOrder, parseTrailingNumber } from './sequentialNaming'
import { getTurnOpenings, isValidTurnFlow } from './turnArc'
import {
  computeOutboundLinks,
  type OutboundLink,
} from './outboundFlow'
import { getPortProperties, resolvePortAdjacentStk, getTransitLinkedCrossPair, listJunctionBranchUnitIds } from './unitPropertyHelpers'

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

/** CV 물류 직진 축 — in/out 방향 집합 (동일 축 CV끼리만 매칭) */
export function cvThroughFlowAxisKey(flow: UnitFlowDirs | null | undefined): string | null {
  if (!flow) return null
  const dirs = [flow.inDir, flow.outDir].filter((dir): dir is FlowDir => dir != null)
  if (dirs.length === 0) return null
  return [...new Set(dirs)].sort().join('|')
}

/** 시뮬 경로 구간 역할 — flowRole=entry/exit만 시작·종료점 배지 */
export function simulationPathFlowRole(
  unit: ConveyorUnit,
  inDir: FlowDir | null,
  outDir: FlowDir | null,
  existing?: UnitFlowDirs | null,
): UnitFlowDirs['role'] {
  if (inDir && outDir) return 'through'
  if (!inDir && outDir) {
    return unit.flowRole === 'entry' ? 'start' : (existing?.role ?? 'through')
  }
  if (inDir && !outDir) {
    return unit.flowRole === 'exit' ? 'end' : (existing?.role ?? 'through')
  }
  return existing?.role ?? 'single'
}

const FLOW_ARROW_TYPES = new Set<ConveyorType>([
  'straight',
  'turn',
  'junction',
  'lift',
])

/** 이전 → 현재 유닛 진입 방향 (어느 변에서 들어오는지) */
export function flowEntryDir(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const adjacent = flowEntryDirAdjacent(from, to)
  if (adjacent) return adjacent
  const toward = dirToward(from, to)
  return toward ? oppositeFlowDir(toward) : null
}

/** 현재 → 다음 유닛 이탈 방향 */
export function flowExitDir(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const adjacent = flowExitDirAdjacent(from, to)
  if (adjacent) return adjacent
  return dirToward(from, to)
}

function flowEntryDirAdjacent(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
  const dx = to.gridX - from.gridX
  const dy = to.gridY - from.gridY
  if (dx === 1) return 'W'
  if (dx === -1) return 'E'
  if (dy === 1) return 'N'
  if (dy === -1) return 'S'
  return null
}

function flowExitDirAdjacent(from: ConveyorUnit, to: ConveyorUnit): FlowDir | null {
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

/** 미니맵 — 자재 진행 방향 (화살표·롤러 공통). 종료점(in만 있음)은 inDir의 반대 */
export function unitTravelDir(
  flow: Pick<UnitFlowDirs, 'inDir' | 'outDir'>,
): FlowDir | null {
  if (flow.outDir) return flow.outDir
  if (flow.inDir) return oppositeFlowDir(flow.inDir)
  return null
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

/** 포트 IN/OUT — STK는 인접 셀, 연동 CV는 라인측 다음 물류 방향 */
export function computePortFlowDirs(
  port: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  outboundLink: OutboundLink | null | undefined,
  line: ConveyorLine,
): UnitFlowDirs | null {
  if (!isPortUnit(port)) return null

  const props = getPortProperties(port)
  let lineCv: ConveyorUnit | null = null
  if (props?.linkedUnitId) {
    const candidate = unitMap.get(props.linkedUnitId) ?? null
    if (candidate && isFlowCapableUnit(candidate)) lineCv = candidate
  }
  if (!lineCv) {
    lineCv = findConnectedNeighbor(port, unitMap, isFlowCapableUnit)
  }

  const direction = port.portDirection ?? 'IN'

  // STK 반대편에 라인 CV가 없는 단독 포트(연동 유닛·프로브 직접 투입 구성).
  // IN 포트: 외부→포트→STK로 자재가 들어가므로 화살표가 STK를 가리킴.
  // OUT 포트: STK→포트→외부로 자재가 나가므로 화살표는 STK 반대 방향(반출 방향)을 가리킴.
  if (!lineCv) {
    const standaloneStk = resolvePortAdjacentStk(line, port)
    if (!standaloneStk) return null
    const towardStk = dirToward(port, standaloneStk)
    if (!towardStk) return null
    const outDir = direction === 'OUT' ? oppositeFlowDir(towardStk) : towardStk
    return {
      inDir: null,
      outDir,
      cvNumber: null,
      role: 'single',
      portDirection: direction,
    }
  }
  const towardCv = dirToward(port, lineCv)
  if (!towardCv) return null

  if (direction === 'OUT' && outboundLink?.next) {
    const outDir = dirToward(port, outboundLink.next)
    if (outDir) {
      return {
        inDir: oppositeFlowDir(outDir),
        outDir,
        cvNumber: null,
        role: 'start',
        portDirection: direction,
      }
    }
  }

  const stk = resolvePortAdjacentStk(line, port)
  if (direction === 'IN') {
    const outDir = stk ? dirToward(port, stk) : oppositeFlowDir(towardCv)
    if (!outDir) return null
    return {
      inDir: towardCv,
      outDir,
      cvNumber: null,
      role: 'through',
      portDirection: direction,
    }
  }

  const outDir = towardCv
  const towardStk = stk ? dirToward(port, stk) : null
  const inDir = towardStk ? oppositeFlowDir(towardStk) : oppositeFlowDir(towardCv)

  return {
    inDir,
    outDir,
    cvNumber: null,
    role: 'start',
    portDirection: direction,
  }
}

function flowDirsFromOutboundLink(
  unit: ConveyorUnit,
  link: OutboundLink,
): UnitFlowDirs | null {
  const inDir = link.prev ? flowEntryDir(link.prev, unit) : null
  const outDir = link.next ? flowExitDir(unit, link.next) : null
  if (!inDir && !outDir) return null

  let role: UnitFlowDirs['role'] = 'through'
  if (!inDir && outDir) role = 'start'
  else if (inDir && !outDir) role = 'end'

  return {
    inDir,
    outDir,
    cvNumber: cvSequenceNumber(unit),
    role,
  }
}

export function computePortFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = new Map<string, UnitFlowDirs>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const outboundLinks = computeOutboundLinks(line)

  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    const flow = computePortFlowDirs(
      unit,
      unitMap,
      outboundLinks.get(unit.id),
      line,
    )
    if (flow) result.set(unit.id, flow)
  }

  return result
}

export function computeMinimapFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = computeUnitFlowMap(line)
  const outboundLinks = computeOutboundLinks(line)

  for (const [id, link] of outboundLinks) {
    const unit = line.units.find((item) => item.id === id)
    if (!unit) continue
    if (isPortUnit(unit)) {
      const unitMap = new Map(line.units.map((item) => [item.id, item]))
      const portFlow = computePortFlowDirs(unit, unitMap, link, line)
      if (portFlow) result.set(id, portFlow)
      continue
    }
    const outboundFlow = flowDirsFromOutboundLink(unit, link)
    if (outboundFlow) result.set(id, outboundFlow)
  }

  for (const [id, flow] of computePortFlowMap(line)) {
    if (!result.has(id)) result.set(id, flow)
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

function isFlowChainUnit(unit: ConveyorUnit): boolean {
  return FLOW_ARROW_TYPES.has(unit.type)
}

function pickNeighborsFromEntryWalk(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { prev: ConveyorUnit | null; next: ConveyorUnit | null } {
  for (const entry of getEntryUnits(line)) {
    const { orderedUnitIds } = computeFlowOrder(line, entry.id)
    const index = orderedUnitIds.indexOf(unit.id)
    if (index < 0) continue

    let prev: ConveyorUnit | null = null
    let next: ConveyorUnit | null = null

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = unitMap.get(orderedUnitIds[i])
      if (candidate && unit.connections.includes(candidate.id) && isFlowChainUnit(candidate)) {
        prev = candidate
        break
      }
    }

    for (let i = index + 1; i < orderedUnitIds.length; i += 1) {
      const candidate = unitMap.get(orderedUnitIds[i])
      if (candidate && unit.connections.includes(candidate.id) && isFlowChainUnit(candidate)) {
        next = candidate
        break
      }
    }

    if (prev || next) return { prev, next }
  }

  return { prev: null, next: null }
}

/** STK 등 적재창고를 한 칸 거쳐 이어진 CV 이웃 (CV24—STK—CV25 등) */
function pickNeighborThroughStorage(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  direction: 'prev' | 'next',
): ConveyorUnit | null {
  const cvNum = cvSequenceNumber(unit)

  for (const id of unit.connections) {
    const storage = unitMap.get(id)
    if (!storage || !isStorageUnit(storage)) continue

    for (const bridgeId of storage.connections) {
      const candidate = unitMap.get(bridgeId)
      if (!candidate || candidate.id === unit.id || !isFlowChainUnit(candidate)) continue

      const candidateCv = cvSequenceNumber(candidate)
      if (cvNum != null && candidateCv != null) {
        if (direction === 'prev' && candidateCv < cvNum) return candidate
        if (direction === 'next' && candidateCv > cvNum) return candidate
      } else if (direction === 'next') {
        return candidate
      }
    }
  }

  return null
}

/**
 * 포트 LOAD/UNLOAD 연동 CV — IN: CV→포트, OUT: 포트→CV.
 * CV 순번 ±1보다 우선 (예: CV10 LOAD → 30101, CV11이 아님).
 */
function pickPortLinkedFlowOverrides(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  base: { prev: ConveyorUnit | null; next: ConveyorUnit | null },
): { prev: ConveyorUnit | null; next: ConveyorUnit | null } {
  let portPrev: ConveyorUnit | null = null
  let portNext: ConveyorUnit | null = null

  for (const id of unit.connections) {
    const neighbor = unitMap.get(id)
    if (!neighbor || !isPortUnit(neighbor)) continue

    const props = getPortProperties(neighbor)
    if (!props?.linkedUnitId || props.linkedUnitId !== unit.id) continue

    const direction = neighbor.portDirection ?? 'IN'
    if (direction === 'IN') portNext = neighbor
    else portPrev = neighbor
  }

  return {
    prev: portPrev ?? base.prev,
    next: portNext ?? base.next,
  }
}

/**
 * 물류 이전/다음 — 연결된 CV 중 순번 ±1 우선.
 * STK#2 버퍼(CV24~27)처럼 STK를 사이에 둔 구간은 entry walk·STK 경유로 보완.
 */
function pickFlowNeighborsByCvOrder(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { prev: ConveyorUnit | null; next: ConveyorUnit | null } {
  const neighbors = getConnectedNeighbors(unit, unitMap).filter(isFlowChainUnit)
  const cvNum = cvSequenceNumber(unit)

  if (cvNum != null) {
    let prev: ConveyorUnit | null = null
    let next: ConveyorUnit | null = null

    for (const neighbor of neighbors) {
      const neighborCv = cvSequenceNumber(neighbor)
      if (neighborCv === cvNum - 1) prev = neighbor
      if (neighborCv === cvNum + 1) next = neighbor
    }

    if (!prev) prev = pickNeighborThroughStorage(unit, unitMap, 'prev')
    if (!next) next = pickNeighborThroughStorage(unit, unitMap, 'next')

    if (!prev || !next) {
      const walk = pickNeighborsFromEntryWalk(unit, unitMap, line)
      if (!prev) prev = walk.prev
      if (!next) next = walk.next
    }

    if (!prev && !next) {
      const sorted = neighbors
        .map((neighbor) => ({ neighbor, cv: cvSequenceNumber(neighbor) }))
        .filter((item): item is { neighbor: ConveyorUnit; cv: number } => item.cv != null)
        .sort((a, b) => a.cv - b.cv)

      const lower = sorted.filter((item) => item.cv < cvNum).at(-1)
      const higher = sorted.find((item) => item.cv > cvNum)
      if (lower) prev = lower.neighbor
      if (higher) next = higher.neighbor
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

  return pickNeighborsFromEntryWalk(unit, unitMap, line)
}

function pickFlowNeighbors(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { prev: ConveyorUnit | null; next: ConveyorUnit | null } {
  return pickPortLinkedFlowOverrides(
    unit,
    unitMap,
    pickFlowNeighborsByCvOrder(unit, unitMap, line),
  )
}

function pickFlowPredecessor(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): ConveyorUnit | null {
  const { prev } = pickFlowNeighbors(unit, unitMap, line)
  if (prev) return prev

  const entries = getEntryUnits(line)
  for (const entry of entries) {
    const { orderedUnitIds } = computeFlowOrder(line, entry.id)
    const index = orderedUnitIds.indexOf(unit.id)
    if (index <= 0) continue

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = unitMap.get(orderedUnitIds[i])
      if (candidate && unit.connections.includes(candidate.id)) {
        return candidate
      }
    }
  }

  return pickNeighborThroughStorage(unit, unitMap, 'prev')
}

function pickFlowSuccessor(
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): ConveyorUnit | null {
  const { next } = pickFlowNeighbors(unit, unitMap, line)
  if (next) return next

  const entries = getEntryUnits(line)
  for (const entry of entries) {
    const { orderedUnitIds } = computeFlowOrder(line, entry.id)
    const index = orderedUnitIds.indexOf(unit.id)
    if (index < 0 || index >= orderedUnitIds.length - 1) continue

    for (let i = index + 1; i < orderedUnitIds.length; i += 1) {
      const candidate = unitMap.get(orderedUnitIds[i])
      if (candidate && unit.connections.includes(candidate.id)) {
        return candidate
      }
    }
  }

  return pickNeighborThroughStorage(unit, unitMap, 'next')
}

/** 분기 유닛 — 평시 경유(직진) 물류 방향 */
export function computeJunctionThroughFlow(
  junction: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { inDir: FlowDir | null; outDir: FlowDir | null } {
  const { prev, next } = pickFlowNeighbors(junction, unitMap, line)
  const inDir = prev ? flowEntryDir(prev, junction) : null
  let outDir = next ? flowExitDir(junction, next) : null

  if (inDir && outDir && !isPerpendicularFlow(inDir, outDir)) {
    return { inDir, outDir }
  }

  if (inDir) {
    const straightOut = oppositeFlowDir(inDir)
    const neighbors = getConnectedNeighbors(junction, unitMap)
    const collinear = neighbors.find((neighbor) => {
      if (neighbor.id === prev?.id) return false
      return flowExitDir(junction, neighbor) === straightOut
    })
    if (collinear) {
      return { inDir, outDir: straightOut }
    }
  }

  return { inDir, outDir }
}

/** 분기 요청 CV 기준 수직 전환 물류 (시뮬·검증용) */
export function computeJunctionDivertFlow(
  junction: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
  requestUnitId: string,
): { inDir: FlowDir | null; outDir: FlowDir | null } | null {
  const requestUnit = unitMap.get(requestUnitId)
  if (!requestUnit) return null

  const through = computeJunctionThroughFlow(junction, unitMap, line)
  const toRequest = flowExitDir(junction, requestUnit)
  if (through.inDir && toRequest && isPerpendicularFlow(through.inDir, toRequest)) {
    return { inDir: through.inDir, outDir: toRequest }
  }

  const fromRequest = flowEntryDir(requestUnit, junction)
  if (fromRequest && through.outDir && isPerpendicularFlow(fromRequest, through.outDir)) {
    return { inDir: fromRequest, outDir: through.outDir }
  }

  const toThrough = through.outDir
    ? oppositeFlowDir(through.outDir)
    : through.inDir
      ? oppositeFlowDir(through.inDir)
      : null
  if (fromRequest && toThrough && isPerpendicularFlow(fromRequest, toThrough)) {
    return { inDir: fromRequest, outDir: toThrough }
  }

  return null
}

/** 분기 요청 CV1 → CV2 교차 물류 (양쪽 요청 시) */
export function computeJunctionCrossRequestFlow(
  junction: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
  requestUnitId1: string,
  requestUnitId2: string,
): { inDir: FlowDir | null; outDir: FlowDir | null } | null {
  const req1 = unitMap.get(requestUnitId1)
  const req2 = unitMap.get(requestUnitId2)
  if (!req1 || !req2) return null

  const inDir = flowEntryDir(req1, junction)
  const outDir = flowExitDir(junction, req2)
  if (!inDir || !outDir) return null

  const through = computeJunctionThroughFlow(junction, unitMap, line)
  if (through.inDir && inDir === through.inDir && outDir === through.outDir) {
    return null
  }

  return { inDir, outDir }
}

/** 분기 유닛 — 평시 직진, 분기 요청 CV는 시뮬 경로에서 수직 전환 */
function computeJunctionUnitFlow(
  junction: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { inDir: FlowDir | null; outDir: FlowDir | null } {
  return computeJunctionThroughFlow(junction, unitMap, line)
}

/** 회전·분기 유닛 — 연결 이웃 + rotation 기준 in/out */
function computeBranchUnitFlow(
  branch: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  line: ConveyorLine,
): { inDir: FlowDir | null; outDir: FlowDir | null } {
  const neighbors = getConnectedNeighbors(branch, unitMap)
  if (neighbors.length === 0) return { inDir: null, outDir: null }

  const prev = pickFlowPredecessor(branch, unitMap, line)
  if (!prev) return { inDir: null, outDir: null }

  const inDir = flowEntryDir(prev, branch)
  if (!inDir) return { inDir: null, outDir: null }

  let outDir = pickTurnOutDir(
    branch,
    inDir,
    neighbors,
    prev.id,
    branch.rotation,
  )

  if (!outDir) {
    const next = pickFlowSuccessor(branch, unitMap, line)
    if (next && next.id !== prev.id) {
      outDir = flowExitDir(branch, next)
    }
  }

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

/** 투입·출고 유닛 기준 — START/END 배지 (복수) */
function resolveGlobalFlowEndpoints(line: ConveyorLine): {
  startIds: string[]
  endIds: string[]
} {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  const startIds = getEntryUnits(line)
    .filter((unit) => FLOW_ARROW_TYPES.has(unit.type))
    .map((unit) => unit.id)

  let endIds = getExitUnits(line)
    .filter((unit) => FLOW_ARROW_TYPES.has(unit.type))
    .map((unit) => unit.id)

  if (endIds.length === 0) {
    const tails = new Set<string>()
    for (const entry of getEntryUnits(line)) {
      const { orderedUnitIds, disconnectedUnitIds } = computeFlowOrder(
        line,
        entry.id,
      )
      const disconnected = new Set(disconnectedUnitIds)
      const connectedFlowIds = orderedUnitIds.filter((id) => {
        if (disconnected.has(id)) return false
        const unit = unitMap.get(id)
        return unit != null && FLOW_ARROW_TYPES.has(unit.type)
      })
      const last = connectedFlowIds[connectedFlowIds.length - 1]
      if (last) tails.add(last)
    }
    endIds = [...tails]
  }

  return { startIds, endIds }
}

function applyGlobalStartEndRoles(
  result: Map<string, UnitFlowDirs>,
  line: ConveyorLine,
): void {
  ensureEndpointUnitsInFlowMap(result, line)

  const { startIds, endIds } = resolveGlobalFlowEndpoints(line)
  if (startIds.length === 0 && endIds.length === 0) return

  const startSet = new Set(startIds)
  const endSet = new Set(endIds)

  for (const [id, flow] of result) {
    if (startSet.has(id)) {
      flow.role = 'start'
    } else if (endSet.has(id)) {
      flow.role = 'end'
    } else if (flow.role === 'start' || flow.role === 'end') {
      if (flow.inDir && flow.outDir) flow.role = 'through'
      else flow.role = 'single'
    }
  }

  // flowRole=entry/exit — in/out 추론과 무관하게 항상 시작·종료 (복수 투입점)
  for (const unit of getEntryUnits(line)) {
    const flow = result.get(unit.id)
    if (flow) flow.role = 'start'
  }
  for (const unit of getExitUnits(line)) {
    const flow = result.get(unit.id)
    if (flow) flow.role = 'end'
  }
}

/** flowRole=entry/exit — 이웃 없어도 START/END 콜아웃 대상에 포함 */
function ensureEndpointUnitsInFlowMap(
  result: Map<string, UnitFlowDirs>,
  line: ConveyorLine,
): void {
  const addIfMissing = (unit: ConveyorUnit) => {
    if (!FLOW_ARROW_TYPES.has(unit.type)) return
    if (result.has(unit.id)) return
    result.set(unit.id, {
      inDir: null,
      outDir: null,
      cvNumber: cvSequenceNumber(unit),
      role: 'single',
    })
  }

  for (const unit of getEntryUnits(line)) addIfMissing(unit)
  for (const unit of getExitUnits(line)) addIfMissing(unit)
}

export function computeUnitFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  const result = new Map<string, UnitFlowDirs>()
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  for (const unit of line.units) {
    if (!FLOW_ARROW_TYPES.has(unit.type)) continue

    let inDir: FlowDir | null = null
    let outDir: FlowDir | null = null

    if (unit.type === 'junction') {
      const junctionFlow = computeJunctionUnitFlow(unit, unitMap, line)
      inDir = junctionFlow.inDir
      outDir = junctionFlow.outDir
    } else if (unit.type === 'turn') {
      const branchFlow = computeBranchUnitFlow(unit, unitMap, line)
      inDir = branchFlow.inDir
      outDir = branchFlow.outDir
    } else {
      const { prev, next } = pickFlowNeighbors(unit, unitMap, line)
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

/**
 * 경로 시뮬레이션 — 방문한 구간만 실제 경로의 이전·다음 이웃으로 in/out 덮어씀.
 * 회전·분기 유닛은 시뮬레이션이 해당 칸에 도달할 때 화살표(곡선·각도)가 갱신됨.
 */
export function overlaySimulationPathOnFlowMap(
  line: ConveyorLine,
  base: Map<string, UnitFlowDirs>,
  pathUnitIds: string[],
  stepIndex: number,
): Map<string, UnitFlowDirs> {
  if (pathUnitIds.length === 0 || stepIndex < 0) return base

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const result = new Map(base)
  const lastIndex = Math.min(stepIndex, pathUnitIds.length - 1)

  for (let i = 0; i <= lastIndex; i += 1) {
    const unitId = pathUnitIds[i]
    const unit = unitMap.get(unitId)
    if (!unit || !FLOW_ARROW_TYPES.has(unit.type)) continue

    const prev = i > 0 ? unitMap.get(pathUnitIds[i - 1]!) : null
    const next =
      i < pathUnitIds.length - 1 ? unitMap.get(pathUnitIds[i + 1]!) : null

    let inDir = prev ? flowEntryDir(prev, unit) : null
    let outDir = next ? flowExitDir(unit, next) : null

    if (unit.type === 'junction' && i > 0 && i < pathUnitIds.length - 1) {
      const crossPair = getTransitLinkedCrossPair(line, unit)
      if (crossPair) {
        const [req1, req2] = crossPair
        const before = pathUnitIds[i - 1]!
        const after = pathUnitIds[i + 1]!
        const req1Branch = new Set(listJunctionBranchUnitIds(line, unit, req1))
        const req2Branch = new Set(listJunctionBranchUnitIds(line, unit, req2))
        if (req1Branch.has(before) && req2Branch.has(after)) {
          const cross = computeJunctionCrossRequestFlow(unit, unitMap, line, req1, req2)
          if (cross?.inDir && cross.outDir) {
            inDir = cross.inDir
            outDir = cross.outDir
          }
        }
      }
    }

    if (!inDir && !outDir) continue

    const existing = base.get(unitId)
    const role = simulationPathFlowRole(unit, inDir, outDir, existing)

    result.set(unitId, {
      inDir,
      outDir,
      cvNumber: existing?.cvNumber ?? cvSequenceNumber(unit),
      role,
      portDirection: existing?.portDirection,
    })
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
