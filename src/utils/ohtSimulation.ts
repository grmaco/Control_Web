import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { OhtRailUnit, OhtDir } from '../types/oht'
import { getUnitFootprint } from './unitFootprint'
import { getOhtRails, getOhtUnits, ohtRailConnectedDirs } from './ohtLayer'
import { OHT_DIR_OFFSET, OHT_DIR_OPPOSITE, ohtRailOpenings } from '../constants/ohtRail'

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** OHT 한 틱 = 레일 한 노드 이동 */
export const OHT_SIM_STEP_MS = 600
/** 연동 유닛 도착 후 LD/ULD 인터페이스 대기 */
export const OHT_INTERFACE_MS = 1400
/** 자재 없는 모듈 앞 대기 상한 — 초과 시 다른 목적지로 재배정 */
export const OHT_MATERIAL_WAIT_TIMEOUT_MS = 5000

// ── 레일 그래프 ───────────────────────────────────────────────────────────────

export interface OhtRailGraph {
  nodes: Map<string, OhtRailUnit>
  adjacency: Map<string, string[]>
  cellIndex: Map<string, string>
  /** 단방향 흐름 그래프 — 노드 → 흐름 방향 이웃들 (경로탐색·화살표 렌더 공용) */
  directed: Map<string, string[]>
  /** 노드별 흐름 출구 방향 (레일 점 화살표 렌더용) */
  flowOutDirs: Map<string, OhtDir[]>
}

function cellKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`
}

/** OHT rotation → 바라보는(진행) 방향 */
const FACING_BY_ROTATION: Record<0 | 90 | 180 | 270, OhtDir> = {
  0: 'N',
  90: 'E',
  180: 'S',
  270: 'W',
}

/** 두 레일 노드 간 지배적 방향 (멀티셀 앵커 간 거리 1 초과 대응) */
function dirBetween(a: OhtRailUnit, b: OhtRailUnit): OhtDir | null {
  const dx = b.gridX - a.gridX
  const dy = b.gridY - a.gridY
  if (dx === 0 && dy === 0) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

/**
 * 단방향 흐름 유도 — 배치된 OHT의 초기 방향(rotation)을 씨앗으로,
 * 유턴 없이 도달 가능한 모든 엣지에 진행 방향을 전파한다.
 * 이미 반대 방향이 배정된 엣지는 건너뜀(먼저 배정된 방향 우선) → 루프가 한 방향으로 흐름.
 * OHT가 없으면 첫 레일 노드에서 임의 방향으로 씨앗을 잡는다.
 */
function orientRailGraph(
  line: ConveyorLine,
  nodes: Map<string, OhtRailUnit>,
  adjacency: Map<string, string[]>,
  cellIndex: Map<string, string>,
): { directed: Map<string, string[]>; flowOutDirs: Map<string, OhtDir[]> } {
  const oriented = new Set<string>() // 'fromId>toId'

  // 씨앗: OHT 위치 + rotation 방향 (호기명 순으로 우선)
  const seeds: Array<[string, OhtDir]> = []
  const units = [...getOhtUnits(line)].sort((a, b) => a.name.localeCompare(b.name))
  for (const unit of units) {
    const nodeId =
      cellIndex.get(cellKey(unit.gridX, unit.gridY)) ??
      nearestNodeIn(nodes, unit.gridX, unit.gridY)
    if (nodeId) seeds.push([nodeId, FACING_BY_ROTATION[unit.rotation]])
  }
  if (seeds.length === 0) {
    // OHT 없음 → 이웃 있는 첫 노드에서 한 방향으로 시작
    for (const [id, neighbors] of adjacency) {
      const first = neighbors[0]
      if (!first) continue
      const d = dirBetween(nodes.get(id)!, nodes.get(first)!)
      if (d) {
        seeds.push([id, d])
        break
      }
    }
  }

  // 걷기(walk) 방식: 한 번에 한 걸음씩 실제로 걸은 엣지만 방향 배정.
  // BFS 홍수 방식은 분기에서 갈라진 두 흐름이 루프 반대편에서 마주쳐
  // 서로를 향하는 화살표(흐름 막힘)를 만들 수 있음 — 걷기는 루프를
  // 한 방향으로 끝까지 돌아 닫으므로 직선 구간 방향이 항상 일관됨.
  // 분기의 나머지 출구는 대기열에 넣어 메인 루프가 닫힌 뒤 별도로 걸음
  // → 걷다가 이미 방향이 있는 구간을 만나면 합류(merge)로 종료.
  const pending: Array<[string, OhtDir]> = [...seeds]
  const maxSteps = adjacency.size * 4 + 16
  while (pending.length > 0) {
    let [id, dir] = pending.shift()!
    for (let step = 0; step < maxSteps; step += 1) {
      const rail = nodes.get(id)
      if (!rail) break
      const exits: Array<{ nid: string; d: OhtDir }> = []
      for (const nid of adjacency.get(id) ?? []) {
        const nRail = nodes.get(nid)
        if (!nRail) continue
        const d = dirBetween(rail, nRail)
        if (!d) continue
        if (d === OHT_DIR_OPPOSITE[dir]) continue // 유턴 금지
        if (oriented.has(`${id}>${nid}`) || oriented.has(`${nid}>${id}`)) continue
        exits.push({ nid, d })
      }
      if (exits.length === 0) break // 막힘 또는 기존 흐름에 합류 → 걷기 종료
      // 직진 우선 — 루프가 자연스럽게 한 방향으로 순환
      const pick = exits.find((e) => e.d === dir) ?? exits[0]!
      for (const e of exits) {
        if (e !== pick) pending.push([id, e.d]) // 분기 가지는 나중에 걸음
      }
      oriented.add(`${id}>${pick.nid}`)
      id = pick.nid
      dir = pick.d
    }
  }

  const directed = new Map<string, string[]>()
  const flowOutDirs = new Map<string, OhtDir[]>()
  for (const key of oriented) {
    const [from, to] = key.split('>') as [string, string]
    const list = directed.get(from) ?? []
    list.push(to)
    directed.set(from, list)
    const d = dirBetween(nodes.get(from)!, nodes.get(to)!)
    if (d) {
      const dirs = flowOutDirs.get(from) ?? []
      if (!dirs.includes(d)) dirs.push(d)
      flowOutDirs.set(from, dirs)
    }
  }
  return { directed, flowOutDirs }
}

function nearestNodeIn(
  nodes: Map<string, OhtRailUnit>,
  gridX: number,
  gridY: number,
): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const rail of nodes.values()) {
    const dist = Math.abs(rail.gridX - gridX) + Math.abs(rail.gridY - gridY)
    if (dist < bestDist) {
      bestDist = dist
      best = rail.id
    }
  }
  return best
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

  const { directed, flowOutDirs } = orientRailGraph(line, nodes, adjacency, cellIndex)
  return { nodes, adjacency, cellIndex, directed, flowOutDirs }
}

// ── 연동 유닛(목적지) 해석 ─────────────────────────────────────────────────────

export interface OhtTarget {
  unitId: string
  name: string
  railNodeIds: string[]
  centerGridX: number
  centerGridY: number
  /**
   * 모듈의 물류 역할이 결정하는 OHT 작업 방향:
   * - entry(투입점): OHT가 자재를 내려놓는(PLACE) 곳 — 적재 대차만 접근
   * - exit(출고점): OHT가 자재를 집어가는(PICK) 곳 — 빈 대차만 접근
   * - both: 역할 미지정 모듈 — 기존처럼 픽/플레이스 모두 허용
   */
  role: 'entry' | 'exit' | 'both'
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
      // 유닛 셀 위에 겹쳐 놓인 레일 — 모듈 바로 위에서 인터페이스 가능 (개구부 조건 불필요).
      // 이걸 빼면 모듈 위에 배치된 OHT가 옆 노드까지 한 칸 지나쳤다가 모듈로
      // 되돌아오는 시각적 역행이 생긴다.
      const onCellRailId = graph.cellIndex.get(cellKey(cell.x, cell.y))
      if (onCellRailId) {
        const onCellAdj = graph.adjacency.get(onCellRailId) ?? []
        if (onCellAdj.length > 0) railNodeIds.add(onCellRailId)
      }
      // 유닛 셀과 인접한 4방향 레일 검사
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
        role:
          unit.flowRole === 'entry' ? 'entry' : unit.flowRole === 'exit' ? 'exit' : 'both',
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

/** 단방향 흐름 그래프 기반 최단 경로 — 레일이 일방통행이므로 유턴·역주행이 원천 차단됨 */
export function bfsDirectedRailPath(
  graph: OhtRailGraph,
  fromId: string,
  goalIds: Set<string>,
): string[] | null {
  if (goalIds.has(fromId)) return []
  const queue: string[] = [fromId]
  const prev = new Map<string, string | null>([[fromId, null]])
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const next of graph.directed.get(cur) ?? []) {
      if (prev.has(next)) continue
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

export type OhtPhase = 'idle' | 'moving' | 'interfacing' | 'waiting'

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
  /** 자재 없는 모듈 앞 대기 누적 시간 (phase==='waiting') */
  waitElapsedMs: number
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
      waitElapsedMs: 0,
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
 * - 적재 상태 기반 목적지 필터: 빈 대차 → 출고점(PICK), 적재 대차 → 투입점(PLACE).
 *   역할 미지정(both) 모듈은 양쪽 모두 허용 (기존 동작 유지).
 * - entryFromId 있음: 노드 기반 역주행 방지 (실제 이전 노드 차단)
 * - entryFromId 없음: forbidStartDir 방향 기반 역주행 방지 (레일 끝 배치 시 rotation 강제)
 * - 두 방법 모두 막히면 제한 없는 BFS로 폴백.
 */
function assignNextTarget(
  vehicle: OhtVehicleState,
  graph: OhtRailGraph,
  targets: OhtTarget[],
): OhtVehicleState {
  // 적재 중이면 투입점(entry·both)에 PLACE, 빈 차면 출고점(exit·both)에서 PICK
  const eligible = targets.filter((t) =>
    vehicle.carrying ? t.role !== 'exit' : t.role !== 'entry',
  )
  // 빈 대차는 내려놓을 곳(투입점·미지정)이 라인에 하나도 없으면 픽업하지 않는다 —
  // 집고 나서 갈 곳이 없어 자재를 든 채 영영 멈추는 상황 방지 (출고점만 있는 라인)
  const canDeliver = targets.some((t) => t.role !== 'exit')
  if (eligible.length === 0 || vehicle.nodeId == null || (!vehicle.carrying && !canDeliver)) {
    return { ...vehicle, phase: 'idle', path: [], pathIndex: 0, targetUnitId: null }
  }
  // 발밑 우선: 현재 노드에서 바로 인터페이스 가능한 모듈이 있으면 라운드로빈보다 먼저
  // 그 모듈을 서비스한다. (BFS는 이 경우 빈 경로를 반환하는데, 이를 "도달 불가"로
  // 오판해 건너뛰면 모듈 위에 배치된 대차가 한 칸 지나쳤다 돌아오거나 엉뚱한 곳으로
  // 떠나는 버그가 된다.) 방금 인터페이스를 마친 유닛은 제외 — 제자리 픽↔플레이스 반복 방지.
  const standingOn = eligible.find(
    (t) => t.railNodeIds.includes(vehicle.nodeId!) && t.unitId !== vehicle.targetUnitId,
  )
  if (standingOn) {
    return {
      ...vehicle,
      phase: 'moving',
      targetUnitId: standingOn.unitId,
      targetUnitCenter: { gridX: standingOn.centerGridX, gridY: standingOn.centerGridY },
      path: [],
      pathIndex: 0,
      targetCursor: (eligible.indexOf(standingOn) + 1) % eligible.length,
    }
  }

  for (let attempt = 0; attempt < eligible.length; attempt += 1) {
    const cursor = (vehicle.targetCursor + attempt) % eligible.length
    const target = eligible[cursor]!
    const goalSet = new Set(target.railNodeIds)

    // 단방향 흐름 그래프 우선 — 레일 일방통행 강제
    let path: string[] | null = bfsDirectedRailPath(graph, vehicle.nodeId, goalSet)
    if (path == null || path.length === 0) {
      // 단방향으로 도달 불가(고립 구간 등) → 기존 양방향 폴백
      if (vehicle.entryFromId) {
        path =
          bfsRailPath(graph, vehicle.nodeId, goalSet, vehicle.entryFromId) ??
          bfsRailPath(graph, vehicle.nodeId, goalSet)
      } else if (vehicle.forbidStartDir) {
        path =
          bfsRailPath(graph, vehicle.nodeId, goalSet, undefined, vehicle.forbidStartDir) ??
          bfsRailPath(graph, vehicle.nodeId, goalSet)
      } else {
        path = bfsRailPath(graph, vehicle.nodeId, goalSet)
      }
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
        targetCursor: (cursor + 1) % eligible.length,
      }
    }
  }
  return { ...vehicle, phase: 'idle', path: [], pathIndex: 0, targetUnitId: null }
}

/** 호기명 숫자 추출 — 분기 진입 등 우선순위 판정 (OHT-01 → 1) */
function vehicleNumber(name: string): number {
  const match = /(\d+)/.exec(name)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

export interface AdvanceOhtOptions {
  /**
   * 연동 모듈에 자재가 있는지 (컨베이어 시뮬 연동).
   * 미제공 시 자재 체크 없이 기존처럼 즉시 Pick.
   * carrying=false(픽업)일 때만 검사 — 자재 없으면 waiting으로 모듈 앞 대기.
   */
  hasMaterialAtUnit?: (unitId: string) => boolean
}

/** 한 틱 진행 — 모든 대차 상태 갱신. 노드 점유 예약은 호기명 숫자 오름차순으로 처리 */
export function advanceOhtVehicles(
  vehicles: OhtVehicleState[],
  graph: OhtRailGraph,
  targets: OhtTarget[],
  stepMs: number = OHT_SIM_STEP_MS,
  interfaceMs: number = OHT_INTERFACE_MS,
  options?: AdvanceOhtOptions,
): OhtVehicleState[] {
  // ── 충돌 방지: 이번 틱에서 각 노드를 점유할 대차를 순서대로 예약 ──────────
  // 초기값: 현재 모든 대차의 위치 (자기 위치 제외는 이동 처리 시 수행)
  const claimedNodes = new Set<string>()
  for (const v of vehicles) {
    if (v.nodeId) claimedNodes.add(v.nodeId)
  }

  const hasMaterialAtUnit = options?.hasMaterialAtUnit

  const stepVehicle = (v: OhtVehicleState): OhtVehicleState => {
    if (v.nodeId == null) return v

    // ── idle → 목적지 배정 ────────────────────────────────────────────────
    if (v.phase === 'idle') {
      return assignNextTarget({ ...v, prevNodeId: v.nodeId }, graph, targets)
    }

    // ── waiting: 자재 없는 모듈 앞 대기 ──────────────────────────────────
    if (v.phase === 'waiting') {
      const materialReady =
        v.targetUnitId == null ||
        hasMaterialAtUnit == null ||
        hasMaterialAtUnit(v.targetUnitId)
      if (materialReady) {
        return {
          ...v,
          phase: 'interfacing',
          interfaceElapsedMs: 0,
          waitElapsedMs: 0,
          prevNodeId: v.nodeId,
        }
      }
      const waited = v.waitElapsedMs + stepMs
      if (waited >= OHT_MATERIAL_WAIT_TIMEOUT_MS) {
        // 타임아웃 → 다른 목적지로 재배정 (같은 모듈만 나오면 계속 대기)
        const reassigned = assignNextTarget(
          { ...v, waitElapsedMs: 0, prevNodeId: v.nodeId },
          graph,
          targets,
        )
        if (reassigned.phase === 'moving' && reassigned.targetUnitId !== v.targetUnitId) {
          return reassigned
        }
        return { ...v, waitElapsedMs: 0, prevNodeId: v.nodeId }
      }
      return { ...v, waitElapsedMs: waited, prevNodeId: v.nodeId }
    }

    // ── moving ───────────────────────────────────────────────────────────
    if (v.phase === 'moving') {
      if (v.pathIndex >= v.path.length) {
        // 경로 끝 — 픽업인데 모듈에 자재가 없으면 인터페이스하지 않고 대기
        if (
          !v.carrying &&
          v.targetUnitId != null &&
          hasMaterialAtUnit != null &&
          !hasMaterialAtUnit(v.targetUnitId)
        ) {
          return { ...v, phase: 'waiting', waitElapsedMs: 0, prevNodeId: v.nodeId }
        }
        // → 다음 틱에 interfacing (마지막 엣지 애니메이션 보장)
        return { ...v, phase: 'interfacing', interfaceElapsedMs: 0, prevNodeId: v.nodeId }
      }
      const nextNode = v.path[v.pathIndex]!
      // 충돌 방지: 목적지 노드가 다른 대차에 의해 점유 중이면 대기
      if (claimedNodes.has(nextNode)) {
        // 제자리 정지 — prevNodeId·departGrid를 현재 노드로 정리하지 않으면
        // 오버레이가 매 틱 "직전 노드 → 현재 노드" 보간을 재시작해 튕기는 모션이 생김
        if (v.prevNodeId !== v.nodeId || v.departGrid != null) {
          return { ...v, prevNodeId: v.nodeId, departGrid: null }
        }
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
  }

  // 호기명 숫자 오름차순으로 노드 예약 처리
  // → 분기(합류) 노드에 동시 진입하려는 경우 빠른 호기가 먼저 점유, 나머지는 대기
  const order = vehicles
    .map((_, i) => i)
    .sort((a, b) => {
      const na = vehicleNumber(vehicles[a]!.name)
      const nb = vehicleNumber(vehicles[b]!.name)
      return na !== nb ? na - nb : a - b
    })
  const next: OhtVehicleState[] = new Array(vehicles.length)
  for (const i of order) next[i] = stepVehicle(vehicles[i]!)
  return next
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
