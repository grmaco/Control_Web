import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { OhtRailUnit, OhtDir } from '../types/oht'
import { getUnitFootprint } from './unitFootprint'
import { getOhtRails, getOhtUnits, ohtRailConnectedDirs } from './ohtLayer'
import { OHT_DIR_OFFSET, ohtRailOpenings } from '../constants/ohtRail'

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** OHT 한 틱 = 레일 한 노드 이동 */
export const OHT_SIM_STEP_MS = 600
/** 연동 유닛 도착 후 LD/ULD 인터페이스 대기 */
export const OHT_INTERFACE_MS = 1400

// ── 레일 그래프 ───────────────────────────────────────────────────────────────

export interface OhtRailGraph {
  nodes: Map<string, OhtRailUnit>
  adjacency: Map<string, string[]>
  cellIndex: Map<string, string>
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`
}

export function buildOhtRailGraph(line: ConveyorLine): OhtRailGraph {
  const rails = getOhtRails(line)
  const nodes = new Map<string, OhtRailUnit>()
  const cellIndex = new Map<string, string>()
  for (const rail of rails) {
    nodes.set(rail.id, rail)
    cellIndex.set(cellKey(rail.gridX, rail.gridY), rail.id)
  }

  const adjacency = new Map<string, string[]>()
  for (const rail of rails) {
    const connectedDirs = ohtRailConnectedDirs(rail, rails)
    const neighbors: string[] = []
    for (const dir of connectedDirs) {
      const offset = OHT_DIR_OFFSET[dir as keyof typeof OHT_DIR_OFFSET]
      const neighborId = cellIndex.get(
        cellKey(rail.gridX + offset.dx, rail.gridY + offset.dy),
      )
      if (neighborId) neighbors.push(neighborId)
    }
    adjacency.set(rail.id, neighbors)
  }
  return { nodes, adjacency, cellIndex }
}

// ── 연동 유닛(목적지) 해석 ─────────────────────────────────────────────────────

export interface OhtTarget {
  unitId: string
  name: string
  railNodeIds: string[]
  centerGridX: number
  centerGridY: number
}

function unitFootprintCells(unit: ConveyorUnit): Array<{ x: number; y: number }> {
  const fp = getUnitFootprint(unit)
  const cells: Array<{ x: number; y: number }> = []
  for (let dy = 0; dy < fp.rows; dy += 1) {
    for (let dx = 0; dx < fp.cols; dx += 1) {
      cells.push({ x: unit.gridX + dx, y: unit.gridY + dy })
    }
  }
  return cells
}

/** interfaceUnit==='OHT' && status==='running' 유닛 → 목적지 */
export function resolveOhtTargets(line: ConveyorLine, graph: OhtRailGraph): OhtTarget[] {
  const targets: OhtTarget[] = []
  for (const unit of line.units) {
    if (unit.interfaceUnit !== 'OHT') continue
    if (unit.status !== 'running') continue
    const railNodeIds = new Set<string>()
    for (const cell of unitFootprintCells(unit)) {
      // 유닛 셀과 인접한 4방향 레일만 검사 (유닛 자체 셀 제외)
      const adjacentCells = [
        { cx: cell.x,     cy: cell.y - 1, dirToUnit: 'S' as OhtDir }, // 북쪽 레일 → 유닛이 남쪽
        { cx: cell.x,     cy: cell.y + 1, dirToUnit: 'N' as OhtDir }, // 남쪽 레일 → 유닛이 북쪽
        { cx: cell.x - 1, cy: cell.y,     dirToUnit: 'E' as OhtDir }, // 서쪽 레일 → 유닛이 동쪽
        { cx: cell.x + 1, cy: cell.y,     dirToUnit: 'W' as OhtDir }, // 동쪽 레일 → 유닛이 서쪽
      ]
      for (const { cx, cy, dirToUnit } of adjacentCells) {
        const railId = graph.cellIndex.get(cellKey(cx, cy))
        if (!railId) continue
        const rail = graph.nodes.get(railId)
        if (!rail) continue
        // 레일 개구부가 유닛 방향을 향하고 있어야 인터페이스 가능
        const openings = ohtRailOpenings(rail.type, rail.rotation)
        if (!openings.includes(dirToUnit)) continue
        // 고립 노드(이웃 없음)는 도달 불가 → 제외
        const adj = graph.adjacency.get(railId) ?? []
        if (adj.length === 0) continue
        railNodeIds.add(railId)
      }
    }

    if (railNodeIds.size > 0) {
      const fp = getUnitFootprint(unit)
      targets.push({
        unitId: unit.id,
        name: unit.name,
        railNodeIds: [...railNodeIds],
        centerGridX: unit.gridX + (fp.cols - 1) / 2,
        centerGridY: unit.gridY + (fp.rows - 1) / 2,
      })
    }
  }
  return targets
}

// ── 경로 탐색 (BFS) ───────────────────────────────────────────────────────────

/**
 * from → goalIds 최단 경로 (from 제외, goal 포함).
 * forbidFirstStep: 첫 스텝에서 이 노드 ID로 돌아가지 않음 (이전 노드 기반 역주행 방지).
 * forbidFirstDir: 첫 스텝에서 이 방향으로 이동하지 않음 (방향 기반 초기 출발 강제).
 *   → forbidFirstStep은 실제 이전 노드가 있을 때, forbidFirstDir은 레일 끝·초기 상태일 때 사용.
 */
export function bfsRailPath(
  graph: OhtRailGraph,
  fromId: string,
  goalIds: Set<string>,
  forbidFirstStep?: string,
  forbidFirstDir?: OhtDir,
): string[] | null {
  if (goalIds.has(fromId)) return []
  const fromRail = forbidFirstDir ? graph.nodes.get(fromId) : null
  const queue: string[] = [fromId]
  const prev = new Map<string, string | null>([[fromId, null]])
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of graph.adjacency.get(cur) ?? []) {
      if (prev.has(next)) continue
      if (cur === fromId) {
        if (forbidFirstStep && next === forbidFirstStep) continue
        if (forbidFirstDir && fromRail) {
          const nextRail = graph.nodes.get(next)
          if (nextRail) {
            const dx = nextRail.gridX - fromRail.gridX
            const dy = nextRail.gridY - fromRail.gridY
            const dir: OhtDir | null =
              dx < 0 ? 'W' : dx > 0 ? 'E' : dy < 0 ? 'N' : dy > 0 ? 'S' : null
            if (dir === forbidFirstDir) continue
          }
        }
      }
      prev.set(next, cur)
      if (goalIds.has(next)) {
        const path: string[] = []
        let node: string | null = next
        while (node != null && node !== fromId) {
          path.unshift(node)
          node = prev.get(node) ?? null
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

export function nearestRailNode(
  graph: OhtRailGraph,
  gridX: number,
  gridY: number,
): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const rail of graph.nodes.values()) {
    const dist = Math.abs(rail.gridX - gridX) + Math.abs(rail.gridY - gridY)
    if (dist < bestDist) {
      bestDist = dist
      best = rail.id
    }
  }
  return best
}

// ── 대차 상태 ──────────────────────────────────────────────────────────────────

export type OhtPhase = 'idle' | 'moving' | 'interfacing'

export interface OhtVehicleState {
  id: string
  name: string
  nodeId: string | null
  prevNodeId: string | null
  phase: OhtPhase
  carrying: boolean
  targetUnitId: string | null
  path: string[]
  pathIndex: number
  interfaceElapsedMs: number
  targetCursor: number
  targetUnitCenter: { gridX: number; gridY: number } | null
  /**
   * 인터페이스 완료 후 첫 이동 틱의 출발 좌표(모듈 중심).
   * 이 값이 있으면 overlay는 railPrev 대신 이 좌표에서 보간 시작.
   * 첫 이동 스텝 소비 후 null로 초기화.
   */
  departGrid: { gridX: number; gridY: number } | null
  /**
   * 현재 nodeId에 진입하기 직전 노드 ID.
   * prevNodeId와 달리 "방향 정보"를 유지 — 역주행 방지 BFS에 사용.
   * prevNodeId는 렌더 보간용으로 인터페이스 중 nodeId와 같게 설정될 수 있으나,
   * entryFromId는 실제 이동 경로에서 온 방향을 추적한다.
   */
  entryFromId: string | null
  /**
   * 초기 출발 방향 금지 방향 (rotation 기반).
   * entryFromId가 null일 때 (레일 끝에 배치되어 뒤쪽 노드가 없는 경우)
   * BFS 첫 스텝에서 이 방향으로 이동하지 않도록 강제.
   * rotation=90(동향) → 금지 방향='W' (서쪽으로 가지 않음).
   */
  forbidStartDir: OhtDir | null
}

/**
 * rotation → 첫 스텝에서 금지할 방향.
 * rotation=0(북향) → 남쪽(S) 방향 첫 스텝 금지 (뒤로 가지 않음).
 */
const ROTATION_TO_FORBID_DIR: Record<0 | 90 | 180 | 270, OhtDir> = {
  0:   'S', // 북향(↑) 출발 → 남쪽으로 가는 것 금지
  90:  'W', // 동향(→) 출발 → 서쪽으로 가는 것 금지
  180: 'N', // 남향(↓) 출발 → 북쪽으로 가는 것 금지
  270: 'E', // 서향(←) 출발 → 동쪽으로 가는 것 금지
}

export function initOhtVehicles(line: ConveyorLine, graph: OhtRailGraph): OhtVehicleState[] {
  return getOhtUnits(line).map((unit, i) => {
    const startNode =
      graph.cellIndex.get(cellKey(unit.gridX, unit.gridY)) ??
      nearestRailNode(graph, unit.gridX, unit.gridY)

    // 초기 entryFromId: rotation 반대 방향의 이웃 레일 노드 (있을 때만)
    let entryFromId: string | null = null
    const forbidStartDir: OhtDir = ROTATION_TO_FORBID_DIR[unit.rotation]
    if (startNode) {
      const startRail = graph.nodes.get(startNode)
      if (startRail) {
        const offset = OHT_DIR_OFFSET[forbidStartDir]
        const behindKey = cellKey(startRail.gridX + offset.dx, startRail.gridY + offset.dy)
        entryFromId = graph.cellIndex.get(behindKey) ?? null
      }
    }

    return {
      id: unit.id,
      name: unit.name,
      nodeId: startNode,
      prevNodeId: startNode,
      phase: 'idle',
      carrying: false,
      targetUnitId: null,
      path: [],
      pathIndex: 0,
      interfaceElapsedMs: 0,
      targetCursor: i,
      targetUnitCenter: null,
      departGrid: null,
      entryFromId,
      // 레일 끝에 배치해서 entryFromId를 못 찾아도 방향 기반 제약으로 폴백
      forbidStartDir,
    }
  })
}

/**
 * 다음 목적지를 라운드로빈으로 골라 경로 설정.
 * - entryFromId 있음: 노드 기반 역주행 방지 (실제 이전 노드 차단)
 * - entryFromId 없음: forbidStartDir 방향 기반 역주행 방지 (레일 끝 배치 시 rotation 강제)
 * - 두 방법 모두 막히면 제한 없는 BFS로 폴백.
 */
function assignNextTarget(
  vehicle: OhtVehicleState,
  graph: OhtRailGraph,
  targets: OhtTarget[],
): OhtVehicleState {
  if (targets.length === 0 || vehicle.nodeId == null) {
    return { ...vehicle, phase: 'idle', path: [], pathIndex: 0, targetUnitId: null }
  }
  for (let attempt = 0; attempt < targets.length; attempt += 1) {
    const cursor = (vehicle.targetCursor + attempt) % targets.length
    const target = targets[cursor]!
    const goalSet = new Set(target.railNodeIds)

    let path: string[] | null = null
    if (vehicle.entryFromId) {
      // 이미 한 번 이상 이동 → 이전 노드 기반 역주행 방지
      path =
        bfsRailPath(graph, vehicle.nodeId, goalSet, vehicle.entryFromId) ??
        bfsRailPath(graph, vehicle.nodeId, goalSet)
    } else if (vehicle.forbidStartDir) {
      // 초기 상태 (레일 끝 배치 등) → 방향 기반 역주행 방지 (rotation 설정 반영)
      path =
        bfsRailPath(graph, vehicle.nodeId, goalSet, undefined, vehicle.forbidStartDir) ??
        bfsRailPath(graph, vehicle.nodeId, goalSet)
    } else {
      path = bfsRailPath(graph, vehicle.nodeId, goalSet)
    }

    if (path && path.length > 0) {
      return {
        ...vehicle,
        phase: 'moving',
        targetUnitId: target.unitId,
        targetUnitCenter: { gridX: target.centerGridX, gridY: target.centerGridY },
        // departGrid는 caller(interface 완료 시)가 설정 — 여기서 초기화하지 않음
        path,
        pathIndex: 0,
        targetCursor: (cursor + 1) % targets.length,
      }
    }
  }
  return { ...vehicle, phase: 'idle', path: [], pathIndex: 0, targetUnitId: null }
}

/** 한 틱 진행 — 모든 대차 상태 갱신 */
export function advanceOhtVehicles(
  vehicles: OhtVehicleState[],
  graph: OhtRailGraph,
  targets: OhtTarget[],
  stepMs: number = OHT_SIM_STEP_MS,
  interfaceMs: number = OHT_INTERFACE_MS,
): OhtVehicleState[] {
  // ── 충돌 방지: 이번 틱에서 각 노드를 점유할 대차를 순서대로 예약 ──────────
  // 초기값: 현재 모든 대차의 위치 (자기 위치 제외는 이동 처리 시 수행)
  const claimedNodes = new Set<string>()
  for (const v of vehicles) {
    if (v.nodeId) claimedNodes.add(v.nodeId)
  }

  return vehicles.map((v) => {
    if (v.nodeId == null) return v

    // ── idle → 목적지 배정 ────────────────────────────────────────────────
    if (v.phase === 'idle') {
      return assignNextTarget({ ...v, prevNodeId: v.nodeId }, graph, targets)
    }

    // ── moving ───────────────────────────────────────────────────────────
    if (v.phase === 'moving') {
      if (v.pathIndex >= v.path.length) {
        // 경로 끝 → 다음 틱에 interfacing (마지막 엣지 애니메이션 보장)
        return { ...v, phase: 'interfacing', interfaceElapsedMs: 0, prevNodeId: v.nodeId }
      }
      const nextNode = v.path[v.pathIndex]!
      // 충돌 방지: 목적지 노드가 다른 대차에 의해 점유 중이면 대기
      if (claimedNodes.has(nextNode)) {
        // 내 현재 위치는 유지
        return v
      }
      // 이동: 이전 위치 해제 → 새 위치 예약
      claimedNodes.delete(v.nodeId)
      claimedNodes.add(nextNode)
      return {
        ...v,
        prevNodeId: v.nodeId,
        nodeId: nextNode,
        pathIndex: v.pathIndex + 1,
        entryFromId: v.nodeId, // 실제 진입 방향 갱신
        departGrid: null,       // 첫 스텝 이후 출발점 초기화
        interfaceElapsedMs: 0,
      }
    }

    // ── interfacing ───────────────────────────────────────────────────────
    if (v.phase === 'interfacing') {
      const elapsed = v.interfaceElapsedMs + stepMs
      if (elapsed < interfaceMs) {
        return { ...v, interfaceElapsedMs: elapsed, prevNodeId: v.nodeId }
      }

      // 완료 → 적재/하역 토글, 모듈 위치를 출발점으로 기억
      const toggled: OhtVehicleState = {
        ...v,
        carrying: !v.carrying,
        interfaceElapsedMs: 0,
        prevNodeId: v.nodeId,
        departGrid: v.targetUnitCenter, // 모듈 중심 → 다음 스텝 출발 좌표
        // entryFromId: 그대로 유지 (도착 시 설정된 진입 방향)
      }
      const assigned = assignNextTarget(toggled, graph, targets)

      // 인터페이스 완료 틱에 첫 스텝 즉시 소비
      // → overlay가 "모듈 중심 → path[0]" 방향(순방향)으로 보간
      // → "arrival_node → path[0]" 처럼 보이는 역방향 snap 제거
      if (assigned.phase === 'moving' && assigned.path.length > 0) {
        const firstNode = assigned.path[0]!
        if (!claimedNodes.has(firstNode)) {
          claimedNodes.delete(v.nodeId)
          claimedNodes.add(firstNode)
          return {
            ...assigned,
            prevNodeId: assigned.nodeId,  // arrival_node (렌더 폴백용)
            nodeId: firstNode,
            pathIndex: 1,
            departGrid: v.targetUnitCenter, // 모듈 중심에서 출발
            entryFromId: assigned.nodeId,   // arrival_node: 진입 방향 갱신
          }
        }
        // firstNode가 점유 중 → 한 틱 더 interfacing 유지 (다음 틱 재시도)
        return {
          ...toggled,
          phase: 'interfacing',
          interfaceElapsedMs: interfaceMs - stepMs,
        }
      }
      return assigned
    }

    return v
  })
}

/** 대차의 현재 셀 좌표 (렌더용) */
export function ohtVehicleCell(
  vehicle: OhtVehicleState,
  graph: OhtRailGraph,
): { gridX: number; gridY: number } | null {
  if (vehicle.nodeId == null) return null
  const rail = graph.nodes.get(vehicle.nodeId)
  if (!rail) return null
  return { gridX: rail.gridX, gridY: rail.gridY }
}

export function ohtVehiclePrevCell(
  vehicle: OhtVehicleState,
  graph: OhtRailGraph,
): { gridX: number; gridY: number } | null {
  const id = vehicle.prevNodeId ?? vehicle.nodeId
  if (id == null) return null
  const rail = graph.nodes.get(id)
  if (!rail) return null
  return { gridX: rail.gridX, gridY: rail.gridY }
}
