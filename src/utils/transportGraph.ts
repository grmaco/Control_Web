import type { ConveyorLine, ConveyorStatus, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { isFlowCapableUnit } from './flowEntries'
import { getOrthogonalNeighborUnits } from './units'
import { findUnitAtCell, getFootprintCells, getUnitFootprint } from './unitFootprint'
import { getEffectiveTurnOpenings } from './turnArc'
import { computeMinimapFlowMap, type FlowDir, type UnitFlowDirs } from './flowDirection'

const FLOW_DIR_DELTA: Record<FlowDir, readonly [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
}

/**
 * 두 유닛이 현재 격자에서 직교로 맞닿아 있는지 (다칸 유닛 footprint 고려).
 * connections는 배치 후 재동기화가 누락되면 과거 인접이 남을 수 있으므로,
 * 반송 그래프는 connections를 그대로 믿지 않고 현재 좌표로 인접을 재확인한다.
 */
function unitsOrthogonallyAdjacent(a: ConveyorUnit, b: ConveyorUnit): boolean {
  const bCells = new Set(
    getFootprintCells(b.gridX, b.gridY, getUnitFootprint(b)).map(
      (cell) => `${cell.gridX},${cell.gridY}`,
    ),
  )
  for (const cell of getFootprintCells(a.gridX, a.gridY, getUnitFootprint(a))) {
    for (const [dx, dy] of Object.values(FLOW_DIR_DELTA)) {
      if (bCells.has(`${cell.gridX + dx},${cell.gridY + dy}`)) return true
    }
  }
  return false
}

/** 유닛 중심 기준 a→b 방위 (다칸 footprint 포함) — dirToward와 동일 규칙 */
function cardinalBetween(a: ConveyorUnit, b: ConveyorUnit): FlowDir | null {
  const fa = getUnitFootprint(a)
  const fb = getUnitFootprint(b)
  const dx = b.gridX + fb.cols / 2 - (a.gridX + fa.cols / 2)
  const dy = b.gridY + fb.rows / 2 - (a.gridY + fa.rows / 2)
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

/**
 * 포트·STK 한 칸 브릿지는 직선 통과(CV—STK—CV처럼 들어온 방향과 나가는 방향이
 * 같은 축)만 인정한다. 옆구리 U턴·수직 연결을 허용하면 서로 다른/평행 라인의
 * 분기끼리 이어져 우회 A*가 엉뚱한 라인으로 점프한다.
 */
function isStraightBridge(
  from: ConveyorUnit,
  via: ConveyorUnit,
  to: ConveyorUnit,
): boolean {
  const inDir = cardinalBetween(from, via)
  const outDir = cardinalBetween(via, to)
  return inDir != null && inDir === outDir
}

const lineFlowMapCache = new WeakMap<ConveyorLine, Map<string, UnitFlowDirs>>()

/** 라인별 흐름맵 캐시 — 우회 매 틱 재계산 방지 (line 객체 단위, 편집 시 재계산) */
function getLineFlowMap(line: ConveyorLine): Map<string, UnitFlowDirs> {
  let fm = lineFlowMapCache.get(line)
  if (!fm) {
    fm = computeMinimapFlowMap(line)
    lineFlowMapCache.set(line, fm)
  }
  return fm
}

/** 직선 컨베이어 흐름 축 — in/out 방향 기준 (H=가로, V=세로) */
function straightFlowAxis(flow: UnitFlowDirs | undefined): 'H' | 'V' | null {
  const dir = flow?.inDir ?? flow?.outDir
  if (dir === 'E' || dir === 'W') return 'H'
  if (dir === 'N' || dir === 'S') return 'V'
  return null
}

function sideOnAxis(side: FlowDir, axis: 'H' | 'V'): boolean {
  return axis === 'H' ? side === 'E' || side === 'W' : side === 'N' || side === 'S'
}

/**
 * 직선↔직선만 흐름 축을 검사한다. 흐름이 다른 두 직선이 옆에 붙어 있어도
 * (예: 가로 직선 CV12 ↔ 세로 직선 CV14) 수직 방향으로는 못 넘긴다.
 *
 * 단, 한쪽이라도 분기(junction)·회전(turn)이면 적용하지 않는다. 방향 전환은
 * 분기·회전이 담당하므로, 분기에서 우회로(옆 라인)로 자재를 빼는 경로(예: CV05
 * 오류 시 CV08 분기 → CV14 우회)까지 막지 않기 위함이다. 축이 계산되지 않은
 * 직선은 과차단 방지로 통과를 허용한다.
 */
function straightFlowAllowsTraversal(
  line: ConveyorLine,
  fromUnit: ConveyorUnit,
  toUnit: ConveyorUnit,
): boolean {
  // 양쪽이 모두 직선일 때만 흐름 축 제약 — 분기·회전이 끼면 허용
  if (fromUnit.type !== 'straight' || toUnit.type !== 'straight') return true
  const flowMap = getLineFlowMap(line)

  if (fromUnit.type === 'straight') {
    const axis = straightFlowAxis(flowMap.get(fromUnit.id))
    const side = cardinalBetween(fromUnit, toUnit)
    if (axis != null && side != null && !sideOnAxis(side, axis)) return false
  }
  if (toUnit.type === 'straight') {
    const axis = straightFlowAxis(flowMap.get(toUnit.id))
    const side = cardinalBetween(toUnit, fromUnit)
    if (axis != null && side != null && !sideOnAxis(side, axis)) return false
  }
  return true
}

/** 회전 유닛이 형상상 실제로 잇는 개구부 쪽 인접 유닛 ID (사용자 설정 포함) */
function turnOpeningNeighborIds(
  line: ConveyorLine,
  turn: ConveyorUnit,
): Set<string> {
  const ids = new Set<string>()
  for (const dir of getEffectiveTurnOpenings(turn)) {
    const [dx, dy] = FLOW_DIR_DELTA[dir]
    const cellUnit = findUnitAtCell(line.units, turn.gridX + dx, turn.gridY + dy)
    if (cellUnit) ids.add(cellUnit.id)
  }
  return ids
}

/**
 * 회전(turn) 유닛은 rotation으로 정해진 두 변(개구부)만 잇는다. connections는
 * 4방향 직교 인접 전체라, 개구부가 아닌 변으로도 엣지가 생기면 우회(reroute)
 * A*가 실제로 통하지 않는(연결되지 않은) 분기로 점프한다. 인접 한 쌍의 통과를
 * 회전 형상으로 막아 잘못된 점프를 차단한다. (직선·분기는 다방향이라 제외)
 */
function turnGeometryAllowsTraversal(
  line: ConveyorLine,
  fromUnit: ConveyorUnit,
  toUnit: ConveyorUnit,
): boolean {
  if (
    fromUnit.type === 'turn' &&
    !turnOpeningNeighborIds(line, fromUnit).has(toUnit.id)
  ) {
    return false
  }
  if (
    toUnit.type === 'turn' &&
    !turnOpeningNeighborIds(line, toUnit).has(fromUnit.id)
  ) {
    return false
  }
  return true
}

/** 엣지 상태 — 대기·가동·오류·점검 */
export type TransportEdgeState = ConveyorStatus

export const TRANSPORT_EDGE_STATE_LABELS: Record<TransportEdgeState, string> = {
  idle: '대기',
  running: '가동',
  error: '오류',
  maintenance: '점검',
}

export interface TransportGraphNode {
  unitId: string
  unit: ConveyorUnit
}

export interface TransportEdge {
  fromId: string
  toId: string
  state: TransportEdgeState
}

export interface TransportGraph {
  entryUnitId: string
  nodes: Map<string, TransportGraphNode>
  /** fromId → 나가는 엣지 목록 */
  outgoing: Map<string, TransportEdge[]>
}

function lineGridSize(line: { gridSize?: ConveyorLine['gridSize'] }) {
  return {
    cols: line.gridSize?.cols ?? 1,
    rows: line.gridSize?.rows ?? 1,
  }
}

function isInboundOutPort(unit: ConveyorUnit): boolean {
  return isPortUnit(unit) && (unit.portDirection ?? 'IN') === 'OUT'
}

/** 반송 그래프 노드 — 직선·분기·회전·리프트만 (포트·적재창고 제외) */
function isInboundConveyorTransitNode(
  unit: ConveyorUnit,
  unitId: string,
  entryUnitId: string,
): boolean {
  if (isPortUnit(unit) || isStorageUnit(unit)) return false
  if (unitId === entryUnitId) return isFlowCapableUnit(unit)
  if (unit.flowRole === 'exit') return isFlowCapableUnit(unit)
  if (isInboundOutPort(unit)) return false
  return isFlowCapableUnit(unit)
}

function listDirectNeighborIds(
  line: ConveyorLine,
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  const candidateIds = new Set<string>(unit.connections)

  if (unit.type === 'junction' || unit.type === 'turn') {
    const { cols, rows } = lineGridSize(line)
    for (const neighbor of getOrthogonalNeighborUnits(
      line.units,
      unit,
      cols,
      rows,
    )) {
      candidateIds.add(neighbor.id)
    }
  }

  // connections에 남은 유령 인접(이동 후 재동기화 누락 등)을 걸러내기 위해
  // 현재 좌표 기준으로 실제 맞닿은 유닛만 직접 이웃으로 인정한다.
  return [...candidateIds].filter((id) => {
    const other = unitMap.get(id)
    return other != null && unitsOrthogonallyAdjacent(unit, other)
  })
}

/**
 * 그래프 이웃 — 포트·적재창고는 노드로 두지 않고 한 칸 직선 브릿지로 CV↔CV만 연결.
 * (옆구리·U턴 브릿지는 isStraightBridge로 차단)
 */
function listInboundGraphNeighborIds(
  line: ConveyorLine,
  unit: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
  entryUnitId: string,
): string[] {
  const result = new Set<string>()

  for (const neighborId of listDirectNeighborIds(line, unit, unitMap)) {
    const neighbor = unitMap.get(neighborId)
    if (!neighbor) continue

    // 인접하더라도 회전 유닛의 개구부가 아닌 변이면 통과 불가 (잘못된 점프 차단)
    if (!turnGeometryAllowsTraversal(line, unit, neighbor)) continue
    // 직선은 자기 흐름 축으로만 — 흐름 다른 직선으로 수직 점프 차단
    if (!straightFlowAllowsTraversal(line, unit, neighbor)) continue

    if (
      isInboundConveyorTransitNode(neighbor, neighborId, entryUnitId)
    ) {
      result.add(neighborId)
      continue
    }

    if (!isPortUnit(neighbor) && !isStorageUnit(neighbor)) continue

    for (const bridgedId of listDirectNeighborIds(line, neighbor, unitMap)) {
      if (bridgedId === unit.id) continue
      const bridged = unitMap.get(bridgedId)
      if (
        bridged &&
        isInboundConveyorTransitNode(bridged, bridgedId, entryUnitId) &&
        isStraightBridge(unit, neighbor, bridged)
      ) {
        result.add(bridgedId)
      }
    }
  }

  return [...result]
}

export function resolveTransportEdgeState(
  toUnit: ConveyorUnit,
): TransportEdgeState {
  return toUnit.status
}

/** 경로 탐색 — 오류 엣지만 제외 */
export function isPathfindingTraversableEdge(state: TransportEdgeState): boolean {
  return state !== 'error'
}

/** 런타임 이동 — 가동 엣지만 즉시 통과 */
export function isRuntimeTraversableEdge(state: TransportEdgeState): boolean {
  return state === 'running'
}

function edgeKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`
}

/**
 * 투입 반송 그래프 — CV(직선·분기·회전·리프트)만 노드. 포트·적재창고는 경유지로 쓰지 않음.
 * 분기·회전은 connections + 격자 직교 이웃으로 확장.
 */
export function buildInboundTransportGraph(
  line: ConveyorLine,
  entryUnitId: string,
  unitMap?: Map<string, ConveyorUnit>,
): TransportGraph | null {
  const map = unitMap ?? new Map(line.units.map((unit) => [unit.id, unit]))
  const entry = map.get(entryUnitId)
  if (!entry) return null
  if (!isInboundConveyorTransitNode(entry, entryUnitId, entryUnitId)) {
    return null
  }

  const nodes = new Map<string, TransportGraphNode>()
  const outgoing = new Map<string, TransportEdge[]>()
  const seenEdgeKeys = new Set<string>()

  const ensureNode = (unit: ConveyorUnit) => {
    if (!nodes.has(unit.id)) {
      nodes.set(unit.id, { unitId: unit.id, unit })
    }
  }

  const queue = [entryUnitId]
  const visited = new Set<string>([entryUnitId])

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const current = map.get(currentId)
    if (!current) continue
    ensureNode(current)

    for (const neighborId of listInboundGraphNeighborIds(
      line,
      current,
      map,
      entryUnitId,
    )) {
      const neighbor = map.get(neighborId)
      if (!neighbor) continue

      const key = edgeKey(currentId, neighborId)
      if (!seenEdgeKeys.has(key)) {
        seenEdgeKeys.add(key)
        ensureNode(neighbor)
        const edge: TransportEdge = {
          fromId: currentId,
          toId: neighborId,
          state: resolveTransportEdgeState(neighbor),
        }
        const list = outgoing.get(currentId) ?? []
        list.push(edge)
        outgoing.set(currentId, list)
      }

      if (!visited.has(neighborId)) {
        visited.add(neighborId)
        queue.push(neighborId)
      }
    }
  }

  return { entryUnitId, nodes, outgoing }
}

function gridHeuristic(
  unitMap: Map<string, ConveyorUnit>,
  fromId: string,
  toId: string,
): number {
  const from = unitMap.get(fromId)
  const to = unitMap.get(toId)
  if (!from || !to) return 0
  return Math.abs(from.gridX - to.gridX) + Math.abs(from.gridY - to.gridY)
}

export type TransportPathResult = {
  pathUnitIds: string[]
  totalCost: number
}

/**
 * A* — 오류 엣지 제외, idle/maintenance는 경로에 포함(런타임 대기).
 * 목적지 유닛이 오류여도 도달 가능(종착 허용).
 */
export function astarTransportPath(
  graph: TransportGraph,
  startId: string,
  goalId: string,
  unitMap: Map<string, ConveyorUnit>,
): TransportPathResult | null {
  if (startId === goalId) return { pathUnitIds: [startId], totalCost: 0 }
  if (!graph.nodes.has(startId) || !graph.nodes.has(goalId)) return null

  const open = new Set<string>([startId])
  const gScore = new Map<string, number>([[startId, 0]])
  const fScore = new Map<string, number>([
    [startId, gridHeuristic(unitMap, startId, goalId)],
  ])
  const cameFrom = new Map<string, string | null>([[startId, null]])

  while (open.size > 0) {
    let currentId: string | null = null
    let bestF = Number.POSITIVE_INFINITY
    for (const candidateId of open) {
      const f = fScore.get(candidateId) ?? Number.POSITIVE_INFINITY
      if (f < bestF) {
        bestF = f
        currentId = candidateId
      }
    }
    if (currentId == null) break

    if (currentId === goalId) {
      const path: string[] = []
      let cursor: string | null = goalId
      while (cursor) {
        path.unshift(cursor)
        cursor = cameFrom.get(cursor) ?? null
      }
      return {
        pathUnitIds: path,
        totalCost: gScore.get(goalId) ?? path.length - 1,
      }
    }

    open.delete(currentId)
    const currentG = gScore.get(currentId) ?? Number.POSITIVE_INFINITY

    for (const edge of graph.outgoing.get(currentId) ?? []) {
      const enteringGoal = edge.toId === goalId
      if (!enteringGoal && !isPathfindingTraversableEdge(edge.state)) continue

      const tentativeG = currentG + 1
      const neighborId = edge.toId
      if (tentativeG >= (gScore.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        continue
      }

      cameFrom.set(neighborId, currentId)
      gScore.set(neighborId, tentativeG)
      fScore.set(
        neighborId,
        tentativeG + gridHeuristic(unitMap, neighborId, goalId),
      )
      open.add(neighborId)
    }
  }

  return null
}

export type TransportReachability = {
  dist: Map<string, number>
  prev: Map<string, string | null>
}

/** 오류 엣지 제외 다익스트라 — 미리보기·목적지 후보용 */
export function dijkstraOnTransportGraph(
  graph: TransportGraph,
  startId: string,
): TransportReachability {
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const settled = new Set<string>()

  for (const nodeId of graph.nodes.keys()) {
    dist.set(nodeId, Number.POSITIVE_INFINITY)
    prev.set(nodeId, null)
  }
  dist.set(startId, 0)

  const queue = new Set<string>([startId])

  while (queue.size > 0) {
    let currentId: string | null = null
    let currentDist = Number.POSITIVE_INFINITY
    for (const candidateId of queue) {
      const candidateDist = dist.get(candidateId) ?? Number.POSITIVE_INFINITY
      if (candidateDist < currentDist) {
        currentDist = candidateDist
        currentId = candidateId
      }
    }
    if (currentId == null || currentDist === Number.POSITIVE_INFINITY) break

    queue.delete(currentId)
    if (settled.has(currentId)) continue
    settled.add(currentId)

    for (const edge of graph.outgoing.get(currentId) ?? []) {
      if (!isPathfindingTraversableEdge(edge.state)) continue
      const alt = currentDist + 1
      if (alt < (dist.get(edge.toId) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.toId, alt)
        prev.set(edge.toId, currentId)
        queue.add(edge.toId)
      }
    }
  }

  return { dist, prev }
}

export function getTransportEdge(
  graph: TransportGraph,
  fromId: string,
  toId: string,
): TransportEdge | null {
  return (graph.outgoing.get(fromId) ?? []).find((edge) => edge.toId === toId) ?? null
}

export function refreshTransportEdgeStates(
  graph: TransportGraph,
  unitMap: Map<string, ConveyorUnit>,
): void {
  for (const edges of graph.outgoing.values()) {
    for (const edge of edges) {
      const toUnit = unitMap.get(edge.toId)
      if (toUnit) {
        edge.state = resolveTransportEdgeState(toUnit)
      }
    }
  }
  for (const node of graph.nodes.values()) {
    const unit = unitMap.get(node.unitId)
    if (unit) node.unit = unit
  }
}
