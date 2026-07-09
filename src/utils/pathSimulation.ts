import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type {
  MultiPathSimulationPlan,
  PathSimulationDirection,
  PathSimulationLoad,
  PathSimulationPlan,
} from '../types/unitProperties'
import {
  DEFAULT_SIM_DISCHARGE_INTERVAL_SEC,
  DEFAULT_SIM_INPUT_INTERVAL_SEC,
  DEFAULT_SIM_TRANSIT_INTERVAL_SEC,
  PATH_SIMULATION_STEP_MS,
} from '../types/unitProperties'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import { getEntryUnits, getExitUnits, isFlowCapableUnit } from './flowEntries'
import { computeMinimapFlowMap, flowEntryDir, type UnitFlowDirs } from './flowDirection'
import { computeFlowOrder, parseTrailingNumber } from './sequentialNaming'
import { isCvUnit } from './unitMaterial'
import type { CalloutTransferStatus } from './calloutTransferStatus'
import {
  getPortProperties,
  getStkProperties,
  unitDisplayCode,
} from './unitPropertyHelpers'
import {
  buildOutboundSimulationPath,
  listOutboundPorts,
} from './outboundFlow'
import {
  canApproveJunctionCrossMove,
  isJunctionCrossPath,
  isJunctionCrossRequestActive,
  isJunctionThroughMoveForLoad,
  isJunctionThroughPathStep,
  isOwnPlannedJunctionTraversal,
} from './junctionSimulation'
import { isStkAtCapacity } from './warehouseSlots'
import { SIM_STK_IO_ENABLED } from '../constants/simStkIo'
import {
  findJunctionAdjacentPort,
  inboundDestinationDisplayName,
  planInboundPathFromFlowTraversal,
} from './simulationDestination'
import { turnRelativeAngleDegrees } from './turnArc'
import {
  astarTransportPath,
  buildInboundTransportGraph,
  getTransportEdge,
  isPathfindingTraversableEdge,
  refreshTransportEdgeStates,
} from './transportGraph'

/** 경로 시뮬레이션 — 경유 가능(가동) 여부. 출발·도착은 상태와 무관하게 허용 */
export function isSimulationTransitPassable(unit: ConveyorUnit): boolean {
  return unit.status === 'running'
}

/** 포트 — 가동 중일 때만 STK 투입(IN)·출고(OUT) 경로 통과 */
export function isSimulationPortOperable(unit: ConveyorUnit | undefined): boolean {
  return unit != null && isPortUnit(unit) && isSimulationTransitPassable(unit)
}

/** 컨베이어(CV) 모듈이 모두 가동 중인지 */
export function areAllCvUnitsRunning(line: ConveyorLine): boolean {
  const cvUnits = line.units.filter(isCvUnit)
  if (cvUnits.length === 0) return true
  return cvUnits.every((unit) => unit.status === 'running')
}

/** 포트 모듈이 모두 가동 중인지 (STK 투입·출고 가능) */
export function areAllPortsRunning(line: ConveyorLine): boolean {
  const ports = line.units.filter(isPortUnit)
  if (ports.length === 0) return true
  return ports.every((unit) => isSimulationPortOperable(unit))
}

/** 시뮬 시작 전 — CV·포트 모두 가동 여부 */
export function areAllSimulationUnitsRunning(line: ConveyorLine): boolean {
  return areAllCvUnitsRunning(line) && areAllPortsRunning(line)
}

export function listNonRunningPorts(line: ConveyorLine): ConveyorUnit[] {
  return line.units.filter((unit) => isPortUnit(unit) && !isSimulationPortOperable(unit))
}

/** 컨베이어(CV) 모듈 전체를 가동 상태로 */
export function lineWithAllCvUnitsRunning(line: ConveyorLine): ConveyorLine {
  const now = new Date().toISOString()
  return {
    ...line,
    updatedAt: now,
    units: line.units.map((unit) =>
      isCvUnit(unit)
        ? { ...unit, status: 'running' as const, updatedAt: now }
        : unit,
    ),
  }
}

/** 포트 모듈 전체를 가동 상태로 */
export function lineWithAllPortsRunning(line: ConveyorLine): ConveyorLine {
  const now = new Date().toISOString()
  return {
    ...line,
    updatedAt: now,
    units: line.units.map((unit) =>
      isPortUnit(unit)
        ? { ...unit, status: 'running' as const, updatedAt: now }
        : unit,
    ),
  }
}

/** CV·포트 모듈 전체를 가동 상태로 */
export function lineWithAllSimulationUnitsRunning(line: ConveyorLine): ConveyorLine {
  return lineWithAllPortsRunning(lineWithAllCvUnitsRunning(line))
}

/** 시뮬 경로 — 직선·분기·회전만 (포트·리프트·STK 제외) */
export function isConveyorLineTransitUnit(unit: ConveyorUnit): boolean {
  return (
    unit.type === 'straight' || unit.type === 'turn' || unit.type === 'junction'
  )
}

function filterConveyorLineTransitIds(
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  return pathUnitIds.filter((unitId) => {
    const unit = unitMap.get(unitId)
    return unit != null && isConveyorLineTransitUnit(unit)
  })
}

/** 투입 시뮬 — 컨베이어 라인만 남기고 출고점에서 절단 */
function finalizeConveyorSimulationPath(
  line: ConveyorLine,
  pathUnitIds: string[],
): string[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const filtered = filterConveyorLineTransitIds(pathUnitIds, unitMap)
  if (filtered.length === 0) return []
  const withWaypoints = ensureTransitWaypointsOnPath(filtered, unitMap)
  return finalizeSimulationPath(line, withWaypoints)
}

/** 투입 목적지 경로 — A* 물리 경로 사용 + 분기·턴 경유지 보강 */
function finalizeInboundDestinationPath(
  line: ConveyorLine,
  pathUnitIds: string[],
): string[] {
  if (pathUnitIds.length === 0) return []
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  // pathUnitIds는 반송 그래프 A* 결과 — 물리적으로 인접(또는 STK 한 칸 브릿지)한
  // 칸만 이어진 실제 경로다. 이를 buildInboundTransitPath의 물류순서(DFS) 슬라이스로
  // 재구성하면, DFS가 한 가지를 끝까지 내려갔다가 다른 가지로 backtrack하는 순서를
  // 직선 경로로 오인해 비인접 점프(예: CV05→CV09)가 생긴다. A* 경로를 그대로 쓰고
  // 분기·턴 경유지만 보강한다.
  return ensureTransitWaypointsOnPath(pathUnitIds, unitMap)
}

export function bfsPath(
  startId: string,
  targetId: string,
  unitMap: Map<string, ConveyorUnit>,
  options?: {
    allowIdleTransit?: boolean
    forSimulationPlan?: boolean
    /** 투입 경로 — STK OUT 포트 경유 금지 */
    forbidOutPorts?: boolean
    /** 직선·분기·회전만 경유 (포트·리프트·STK 제외) */
    conveyorLineOnly?: boolean
    /** CV 사이 브릿지 — 적재창고 통과 허용 */
    allowStorageTransit?: boolean
  },
): string[] | null {
  if (startId === targetId) return [startId]

  const canVisit = (unitId: string): boolean => {
    const unit = unitMap.get(unitId)
    if (!unit) return false
    if (unitId === startId || unitId === targetId) return true

    if (options?.conveyorLineOnly && !isConveyorLineTransitUnit(unit)) {
      return false
    }

    if (
      options?.forbidOutPorts &&
      isPortUnit(unit) &&
      (unit.portDirection ?? 'IN') === 'OUT'
    ) {
      return false
    }

    if (options?.forSimulationPlan) {
      if (isPortUnit(unit)) {
        return options.allowIdleTransit ? true : isSimulationTransitPassable(unit)
      }
      if (isStorageUnit(unit)) {
        return unitId === targetId || options.allowStorageTransit === true
      }
      if (isFlowCapableUnit(unit)) {
        return options.allowIdleTransit ? true : isSimulationTransitPassable(unit)
      }
      return isSimulationTransitPassable(unit)
    }

    if (options?.allowIdleTransit) {
      return isFlowCapableUnit(unit)
    }
    return isSimulationTransitPassable(unit)
  }

  const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }]
  const visited = new Set<string>([startId])

  while (queue.length > 0) {
    const current = queue.shift()!
    const unit = unitMap.get(current.id)
    if (!unit) continue

    for (const neighborId of unit.connections) {
      if (visited.has(neighborId)) continue
      if (!canVisit(neighborId)) continue
      const nextPath = [...current.path, neighborId]
      if (neighborId === targetId) return nextPath
      visited.add(neighborId)
      queue.push({ id: neighborId, path: nextPath })
    }
  }

  return null
}

function unitsAreGraphNeighbors(
  unitMap: Map<string, ConveyorUnit>,
  fromId: string,
  toId: string,
): boolean {
  const from = unitMap.get(fromId)
  return from != null && from.connections.includes(toId)
}

/** 물류순서 기준점 — 경로가 IN 포트로 시작하면 연동 CV 기준으로 순서 계산 */
function resolveFlowOrderAnchorId(
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): string {
  const firstId = pathUnitIds[0]
  if (!firstId) return firstId ?? ''
  const first = unitMap.get(firstId)
  if (first && isPortUnit(first)) {
    const linkedId = getPortProperties(first)?.linkedUnitId
    if (linkedId && unitMap.has(linkedId)) {
      return linkedId
    }
  }
  return firstId
}

/**
 * from→to 직접 연결과 별도로 from→분기/턴→to 경로가 있으면 중간 유닛 반환.
 * IN 포트 연동 CV가 분기 한쪽 팔에 있을 때 BFS가 분기 타일을 건너뛰는 경우 보정.
 */
function findMandatoryTurnOrJunctionBetween(
  unitMap: Map<string, ConveyorUnit>,
  fromId: string,
  toId: string,
): string | null {
  const from = unitMap.get(fromId)
  if (!from) return null

  let junctionId: string | null = null
  let turnId: string | null = null

  for (const viaId of from.connections) {
    if (viaId === toId) continue
    const via = unitMap.get(viaId)
    if (!via || via.type === 'port' || isStorageUnit(via)) continue
    if (!via.connections.includes(toId)) continue
    if (via.type === 'junction') {
      junctionId = via.id
      break
    }
    if (via.type === 'turn') {
      turnId = via.id
    }
  }

  return junctionId ?? turnId
}

function appendPathSegment(
  result: string[],
  unitMap: Map<string, ConveyorUnit>,
  fromId: string,
  toId: string,
): void {
  const waypoint = findMandatoryTurnOrJunctionBetween(unitMap, fromId, toId)
  if (waypoint && result[result.length - 1] !== waypoint) {
    result.push(waypoint)
  }
  if (result[result.length - 1] !== toId) {
    result.push(toId)
  }
}

/** 경로 각 구간에 누락된 분기·턴 경유지 삽입 */
function ensureTransitWaypointsOnPath(
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  if (pathUnitIds.length <= 1) return [...pathUnitIds]

  const result: string[] = [pathUnitIds[0]!]
  for (let i = 0; i < pathUnitIds.length - 1; i += 1) {
    appendPathSegment(result, unitMap, pathUnitIds[i]!, pathUnitIds[i + 1]!)
  }
  return result
}

/**
 * 물류순서(computeFlowOrder) 구간을 끼워 넣어 분기·턴 누락을 보정.
 * BFS 최단경로가 분기 타일을 건너뛰면 시뮬 CST가 분기에서 사라진 것처럼 보임.
 */
function expandPathViaFlowOrder(
  line: ConveyorLine,
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  if (pathUnitIds.length <= 1) return [...pathUnitIds]

  const entryId = resolveFlowOrderAnchorId(pathUnitIds, unitMap)
  const { orderedUnitIds } = computeFlowOrder(line, entryId)
  const orderPos = new Map(orderedUnitIds.map((id, index) => [id, index]))

  const result: string[] = [pathUnitIds[0]!]
  for (let i = 0; i < pathUnitIds.length - 1; i += 1) {
    const fromId = pathUnitIds[i]!
    const toId = pathUnitIds[i + 1]!
    const fromPos = orderPos.get(fromId)
    const toPos = orderPos.get(toId)

    if (fromPos != null && toPos != null && fromPos < toPos) {
      for (const unitId of orderedUnitIds.slice(fromPos + 1, toPos + 1)) {
        const unit = unitMap.get(unitId)
        if (unit && !isConveyorLineTransitUnit(unit)) continue
        if (result[result.length - 1] !== unitId) {
          result.push(unitId)
        }
      }
      continue
    }

    if (!unitsAreGraphNeighbors(unitMap, fromId, toId)) {
      const bridge = bfsPath(fromId, toId, unitMap, INBOUND_PATH_BFS_OPTIONS)
      if (bridge && bridge.length > 1) {
        for (let j = 1; j < bridge.length; j += 1) {
          const unitId = bridge[j]!
          if (result[result.length - 1] !== unitId) {
            result.push(unitId)
          }
        }
        continue
      }
    }

    appendPathSegment(result, unitMap, fromId, toId)
  }

  return ensureTransitWaypointsOnPath(result, unitMap)
}

const INBOUND_PATH_BFS_OPTIONS = {
  forSimulationPlan: true as const,
  allowIdleTransit: true as const,
  forbidOutPorts: true as const,
  conveyorLineOnly: true as const,
}

/** 투입 경로 — 물류순서(연결) 구간, 포트·STK 타일 제외 */
function buildInboundTransitPath(
  line: ConveyorLine,
  fromId: string,
  toId: string,
  unitMap: Map<string, ConveyorUnit>,
): string[] | null {
  if (fromId === toId) return [fromId]

  const flowPath = sliceConveyorFlowPath(line, fromId, toId, unitMap)
  if (flowPath && flowPath.length > 1) {
    return expandPathViaFlowOrder(line, flowPath, unitMap)
  }

  const bfs = bfsPath(fromId, toId, unitMap, INBOUND_PATH_BFS_OPTIONS)
  if (!bfs || bfs.length === 0) return null

  const bridged = bfs.filter((unitId) => {
    const unit = unitMap.get(unitId)
    return unit != null && isConveyorLineTransitUnit(unit)
  })
  if (bridged.length <= 1) return null
  if (bridged[bridged.length - 1] !== toId && unitMap.get(toId)) {
    bridged.push(toId)
  }
  return expandPathViaFlowOrder(line, bridged, unitMap)
}

function findLinkedInputPort(
  line: ConveyorLine,
  entryUnitId: string,
): ConveyorUnit | null {
  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    // role 필드 또는 portDirection 으로 IN 포트 판별
    const isInDir = (unit.portDirection ?? 'IN') === 'IN'
    if (!isInDir && unit.role !== 'INPUT' && unit.role !== 'PORT_IN') continue
    const props = getPortProperties(unit)
    if (props?.linkedUnitId === entryUnitId) {
      return unit
    }
  }
  return null
}

/** EXIT 유닛에 연동된 OUT 포트 반환 — 없으면 null */
function findLinkedOutPort(
  line: ConveyorLine,
  exitUnitId: string,
): ConveyorUnit | null {
  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    if ((unit.portDirection ?? 'IN') !== 'OUT') continue
    if (getPortProperties(unit)?.linkedUnitId === exitUnitId) return unit
  }
  return null
}

/** EXIT 유닛에 연동된 IN 포트 반환 — 없으면 null */
function findLinkedInPortAtExit(
  line: ConveyorLine,
  exitUnitId: string,
): ConveyorUnit | null {
  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    if ((unit.portDirection ?? 'IN') !== 'IN') continue
    if (getPortProperties(unit)?.linkedUnitId === exitUnitId) return unit
  }
  return null
}

/** IN 포트가 연동된 투입 CV 앞에 포트 칸을 붙임 (라인 만재·시각화) */
function prependLinkedInputPort(
  line: ConveyorLine,
  entryUnitId: string,
  pathUnitIds: string[],
): string[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const port = findLinkedInputPort(line, entryUnitId)
  let nextPath = pathUnitIds
  if (port && pathUnitIds.length > 0 && pathUnitIds[0] !== port.id) {
    nextPath = [port.id, ...pathUnitIds]
  }
  return ensureTransitWaypointsOnPath(nextPath, unitMap)
}

/** 종료점 — flowRole=exit 또는 (명시 출고점 없을 때) 물류 화살표 end */
export function isSimulationEndUnit(
  unit: ConveyorUnit | undefined,
  flow?: UnitFlowDirs | null,
  options?: { allowFlowEndRole?: boolean },
): boolean {
  if (!unit) return false
  if (unit.flowRole === 'exit') return true
  if (options?.allowFlowEndRole === false) return false
  return flow?.role === 'end'
}

/** 경로를 출고점(flowRole=exit)에서 잘라냄 — 중간 flow end 배지는 무시 */
export function truncatePathAtEndRole(
  line: ConveyorLine,
  pathUnitIds: string[],
): string[] {
  if (pathUnitIds.length === 0) return pathUnitIds

  const explicitExitIds = new Set(getExitUnits(line).map((unit) => unit.id))
  if (explicitExitIds.size > 0) {
    let lastExitIndex = -1
    for (let i = 0; i < pathUnitIds.length; i += 1) {
      if (explicitExitIds.has(pathUnitIds[i]!)) {
        lastExitIndex = i
      }
    }
    if (lastExitIndex >= 0) {
      return pathUnitIds.slice(0, lastExitIndex + 1)
    }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  for (let i = 0; i < pathUnitIds.length; i += 1) {
    const unit = unitMap.get(pathUnitIds[i]!)
    if (unit?.flowRole === 'exit') {
      return pathUnitIds.slice(0, i + 1)
    }
  }

  return pathUnitIds
}

function finalizeSimulationPath(
  line: ConveyorLine,
  pathUnitIds: string[],
): string[] {
  const truncated = truncatePathAtEndRole(line, pathUnitIds)
  return truncated === pathUnitIds ? [...truncated] : truncated
}

function resolvePathExitId(
  line: ConveyorLine,
  pathUnitIds: string[],
): string | null {
  if (pathUnitIds.length === 0) return null
  const flowMap = computeMinimapFlowMap(line)
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const lastId = pathUnitIds[pathUnitIds.length - 1]!
  const last = unitMap.get(lastId)
  const flow = flowMap.get(lastId) ?? null
  return isSimulationEndUnit(last, flow) ? lastId : null
}

function resolveExitTargetIds(
  line: ConveyorLine,
  entryUnitId: string,
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  const explicit = getExitUnits(line).map((unit) => unit.id)
  if (explicit.length > 0) return explicit

  const { orderedUnitIds, disconnectedUnitIds } = computeFlowOrder(line, entryUnitId)
  const disconnected = new Set(disconnectedUnitIds)
  const connectedFlowIds = orderedUnitIds.filter((id) => {
    if (disconnected.has(id)) return false
    const unit = unitMap.get(id)
    return unit != null && isConveyorLineTransitUnit(unit)
  })
  const last = connectedFlowIds[connectedFlowIds.length - 1]
  return last ? [last] : []
}

function cvNumberFromUnit(unit: ConveyorUnit): number | null {
  return parseTrailingNumber(unit.name)?.number ?? null
}

function sliceConveyorFlowPath(
  line: ConveyorLine,
  fromId: string,
  toId: string,
  unitMap: Map<string, ConveyorUnit>,
): string[] | null {
  const { orderedUnitIds } = computeFlowOrder(line, fromId)
  const fromIdx = orderedUnitIds.indexOf(fromId)
  const toIdx = orderedUnitIds.indexOf(toId)
  if (fromIdx < 0 || toIdx <= fromIdx) return null

  let conveyorPath = orderedUnitIds
    .slice(fromIdx, toIdx + 1)
    .filter((unitId) => {
      const unit = unitMap.get(unitId)
      return unit != null && isConveyorLineTransitUnit(unit)
    })

  if (conveyorPath.length === 0 || conveyorPath[0] !== fromId) {
    conveyorPath = [fromId, ...conveyorPath.filter((id) => id !== fromId)]
  }
  if (conveyorPath[conveyorPath.length - 1] !== toId) {
    conveyorPath.push(toId)
  }

  return conveyorPath.length > 1 ? conveyorPath : null
}

/** CV01→CV10처럼 순번이 이어지면 연결 그래프보다 짧은 직선 경로 */
function buildCvSequencePath(
  entryUnitId: string,
  exitIds: string[],
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): string[] | null {
  const entry = unitMap.get(entryUnitId)
  if (!entry) return null
  const entryCv = cvNumberFromUnit(entry)
  if (entryCv == null) return null

  const unitsByCv = new Map<number, ConveyorUnit>()
  for (const unit of line.units) {
    const cv = cvNumberFromUnit(unit)
    if (cv != null && isConveyorLineTransitUnit(unit)) {
      unitsByCv.set(cv, unit)
    }
  }

  let best: string[] | null = null
  for (const exitId of exitIds) {
    const exit = unitMap.get(exitId)
    const exitCv = exit ? cvNumberFromUnit(exit) : null
    if (exitCv == null || exitCv <= entryCv) continue

    const path: string[] = []
    let complete = true
    for (let cv = entryCv; cv <= exitCv; cv += 1) {
      const unit = unitsByCv.get(cv)
      if (!unit) {
        complete = false
        break
      }
      path.push(unit.id)
    }
    if (!complete || path.length <= 1) continue
    if (!best || path.length < best.length) best = path
  }

  return best
}

/** 물류순서에서 출고점까지 잘라낸 경로 (전체 DFS 순회 대신) */
function sliceFlowPathToExit(
  orderedUnitIds: string[],
  exitIds: string[],
): { pathUnitIds: string[]; exitId: string | null } {
  for (const exitId of exitIds) {
    const index = orderedUnitIds.indexOf(exitId)
    if (index > 0) {
      return {
        pathUnitIds: orderedUnitIds.slice(0, index + 1),
        exitId,
      }
    }
  }

  const lastId = orderedUnitIds[orderedUnitIds.length - 1]!
  return {
    pathUnitIds: orderedUnitIds,
    exitId: lastId,
  }
}

/** STK 없는 라인 — 투입점 → 출고점 (BFS 우선, 없으면 물류 순서) */
function buildEntryToExitPath(
  entryUnitId: string,
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): {
  pathUnitIds: string[]
  exitId: string | null
  message: string
} {
  const entry = unitMap.get(entryUnitId)
  if (!entry) {
    return {
      pathUnitIds: [],
      exitId: null,
      message: '투입점을 찾을 수 없습니다.',
    }
  }

  const exitIds = resolveExitTargetIds(line, entryUnitId, unitMap)

  for (const exitId of exitIds) {
    // BFS 최단 인접 경로 — DFS 물류순서 슬라이스는 backtrack 순서를 경로로 오인해
    // 역주행·비인접 점프가 생길 수 있음 (중간 유닛에서 출발하는 테스트 자재에서 발생)
    const path = bfsPath(entryUnitId, exitId, unitMap, {
      forSimulationPlan: true,
      forbidOutPorts: true,
      conveyorLineOnly: true,
    })
    if (path && path.length > 1) {
      const exit = unitMap.get(exitId)!
      return {
        pathUnitIds: path,
        exitId,
        message: `${unitDisplayCode(entry)} → … → ${unitDisplayCode(exit)} (${path.length}구간)`,
      }
    }
  }

  const { orderedUnitIds } = computeFlowOrder(line, entryUnitId)
  if (orderedUnitIds.length > 1) {
    const sliced = sliceFlowPathToExit(orderedUnitIds, exitIds)
    const conveyorSlice = sliced.pathUnitIds.filter((unitId) => {
      const unit = unitMap.get(unitId)
      return unit != null && isConveyorLineTransitUnit(unit)
    })
    const exit = unitMap.get(sliced.exitId ?? conveyorSlice[conveyorSlice.length - 1] ?? entryUnitId)!
    return {
      pathUnitIds: conveyorSlice.length > 1 ? conveyorSlice : sliced.pathUnitIds,
      exitId: sliced.exitId,
      message: `${unitDisplayCode(entry)} → … → ${unitDisplayCode(exit)} (${conveyorSlice.length > 1 ? conveyorSlice.length : sliced.pathUnitIds.length}구간 · 물류순서)`,
    }
  }

  return {
    pathUnitIds: [entryUnitId],
    exitId: null,
    message: '가동 중인 모듈만으로 출고점까지 연결된 경로가 없습니다. 출고점(flowRole=exit)을 지정하세요.',
  }
}

function buildFlowChain(
  entryId: string,
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  const allStks = line.units
    .filter(isStorageUnit)
    .filter((stk) => getStkProperties(stk)?.enabled !== false)
    .sort((a, b) => {
      const orderA = getStkProperties(a)?.stkOrder ?? 999
      const orderB = getStkProperties(b)?.stkOrder ?? 999
      return orderA - orderB
    })

  for (const stk of allStks) {
    const path = buildInboundTransitPath(line, entryId, stk.id, unitMap)
    if (path && path.length > 1) return path
  }

  return [entryId]
}

/** 직선 출고점에 연동된 포트 유닛이 있는지 — 있으면 자재 유지, 없으면 출고 후 사라짐 */
function exitUnitHasLinkedPort(line: ConveyorLine, unitId: string): boolean {
  for (const u of line.units) {
    if (!isPortUnit(u)) continue
    if (getPortProperties(u)?.linkedUnitId === unitId) return true
  }
  return false
}

/** 투입점 → 선택 목적지(분기) 또는 최원 분기 목적지 */
export function planInboundLoadPath(
  line: ConveyorLine,
  entryUnitId: string,
  destinationUnitId?: string | null,
): PathSimulationPlan {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const entry = unitMap.get(entryUnitId)
  if (!entry) {
    return {
      entryUnitId,
      routingUnitId: null,
      targetStkId: null,
      pathUnitIds: [],
      message: '투입점을 찾을 수 없습니다.',
    }
  }

  const traversal = planInboundPathFromFlowTraversal(
    line,
    entryUnitId,
    destinationUnitId,
  )

  if (traversal) {
    const basePath = finalizeInboundDestinationPath(line, traversal.pathUnitIds)
    const destUnit = traversal.destinationUnit
    const destLabel = inboundDestinationDisplayName(destUnit)
    const isExitDest = destUnit.flowRole === 'exit'
    const autoDest = !destinationUnitId || destinationUnitId !== traversal.destinationUnitId

    // EXIT 목적지에 연동된 포트 처리:
    // OUT 포트(출고구) → 자재를 외부로 줌, IN 포트(투입고) → 자재를 수령
    const linkedOutPort = isExitDest ? findLinkedOutPort(line, destUnit.id) : null
    const linkedInPort = isExitDest ? findLinkedInPortAtExit(line, destUnit.id) : null
    const linkedExitPort = linkedOutPort ?? linkedInPort

    // 분기 목적지에 직접 인접한 포트 — 직선 EXIT 연동 포트와 동일하게 경로 끝에 추가하여
    // 분기유닛에서 포트로 자재가 이동하는 것을 시각화하고 LD/ULD/BUSY 신호를 생성
    const junctionAdjacentPort =
      !isExitDest && destUnit.type === 'junction'
        ? findJunctionAdjacentPort(line, destUnit, unitMap)
        : null

    let targetExitId: string | null
    if (linkedExitPort) {
      targetExitId = linkedExitPort.id
    } else if (junctionAdjacentPort) {
      targetExitId = junctionAdjacentPort.id
    } else if (isExitDest) {
      targetExitId = traversal.destinationUnitId
    } else {
      targetExitId = null
    }

    // 투입점에 연동된 IN 포트를 경로 앞에 추가 (포트가 자재 공급) → ensureTransitWaypoints 포함
    const pathWithEntry = prependLinkedInputPort(line, entryUnitId, basePath)

    // EXIT 포트 또는 분기 인접 포트를 경로 끝에 추가
    const pathUnitIds = linkedExitPort
      ? [...pathWithEntry, linkedExitPort.id]
      : junctionAdjacentPort
      ? [...pathWithEntry, junctionAdjacentPort.id]
      : pathWithEntry

    return {
      entryUnitId,
      routingUnitId: traversal.destinationUnitId,
      targetStkId: null,
      targetExitId,
      pathUnitIds,
      previewPathUnitIds: traversal.previewTransitUnitIds,
      message: autoDest
        ? `${unitDisplayCode(entry)} → ${destLabel} (목적지 · 최원 ${isExitDest ? '종료점' : '분기·회전'})`
        : `${unitDisplayCode(entry)} → ${destLabel} (목적지)`,
    }
  }

  if (destinationUnitId) {
    const dest = unitMap.get(destinationUnitId)
    const destLabel = dest ? unitDisplayCode(dest) : destinationUnitId
    return {
      entryUnitId,
      routingUnitId: null,
      targetStkId: null,
      targetExitId: null,
      pathUnitIds: [],
      message: `${unitDisplayCode(entry)} → ${destLabel} 경로 없음`,
    }
  }

  // 흐름 목적지(분기·회전·종료점)가 없는 짧은 라인 폴백 —
  // 투입점에 연동된 IN 포트가 있으면 포트를 목적지로 사용
  // (직선 투입 → IN포트 → STK 회수 구성: 자재가 포트에 도착해 반송 대기)
  const entryLinkedInPort = findLinkedInPortAtExit(line, entryUnitId)
  if (entryLinkedInPort) {
    return {
      entryUnitId,
      routingUnitId: null,
      targetStkId: null,
      targetExitId: entryLinkedInPort.id,
      pathUnitIds: [entryUnitId, entryLinkedInPort.id],
      message: `${unitDisplayCode(entry)} → ${unitDisplayCode(entryLinkedInPort)} (IN 포트)`,
    }
  }

  return {
    entryUnitId,
    routingUnitId: null,
    targetStkId: null,
    targetExitId: null,
    pathUnitIds: [],
    message:
      '투입 경로상 도달 가능한 분기·회전·종료점(flowRole=exit) 목적지를 찾을 수 없습니다.',
  }
}

export function listSimulatableEntries(line: ConveyorLine): ConveyorUnit[] {
  return getEntryUnits(line)
}

export function lineHasEnabledStk(line: ConveyorLine): boolean {
  return line.units.some(
    (unit) => isStorageUnit(unit) && getStkProperties(unit)?.enabled !== false,
  )
}

export function listSimulatableOutboundPorts(line: ConveyorLine): ConveyorUnit[] {
  return listOutboundPorts(line)
}

/** OUT 포트 → STK(선택) → 컨베이어 → 출고구 */
export function planOutboundLoadPath(
  line: ConveyorLine,
  portUnitId: string,
): PathSimulationPlan {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const port = unitMap.get(portUnitId)
  if (!port) {
    return {
      entryUnitId: portUnitId,
      routingUnitId: null,
      targetStkId: null,
      targetExitId: null,
      pathUnitIds: [],
      message: 'OUT 포트를 찾을 수 없습니다.',
      direction: 'outbound',
    }
  }

  const built = buildOutboundSimulationPath(
    line,
    portUnitId,
    bfsPath,
    isSimulationTransitPassable,
  )
  const pathUnitIds = finalizeSimulationPath(line, built.pathUnitIds)

  return {
    entryUnitId: portUnitId,
    routingUnitId: null,
    targetStkId: built.stkId,
    targetExitId: built.exitId ?? resolvePathExitId(line, pathUnitIds),
    pathUnitIds,
    message: built.message,
    direction: 'outbound',
  }
}

function dedupeSimulationLoadsById(loads: PathSimulationLoad[]): PathSimulationLoad[] {
  const byId = new Map<string, PathSimulationLoad>()
  for (const load of loads) {
    byId.set(load.id, load)
  }
  return [...byId.values()]
}

function createSimulationLoad(
  plan: PathSimulationPlan,
  sourceUnit: ConveyorUnit | undefined,
  direction: PathSimulationDirection,
  options?: { clearsTestMaterial?: boolean; loadIdSuffix?: string },
): PathSimulationLoad {
  const suffix = options?.loadIdSuffix ?? ''
  return {
    id: `sim-load-${direction}-${plan.entryUnitId}${suffix}`,
    entryUnitId: plan.entryUnitId,
    label: sourceUnit ? unitDisplayCode(sourceUnit) : plan.entryUnitId,
    direction,
    routingUnitId: plan.routingUnitId,
    targetStkId: plan.targetStkId,
    targetExitId: plan.targetExitId ?? null,
    pathUnitIds: [...plan.pathUnitIds],
    previewPathUnitIds: plan.previewPathUnitIds
      ? [...plan.previewPathUnitIds]
      : undefined,
    stepIndex: 0,
    complete: plan.pathUnitIds.length === 0,
    waiting: false,
    message: plan.message,
    clearsTestMaterial: options?.clearsTestMaterial ?? false,
    released: true,
    entryTicks: 0,
    exitTicks: 0,
    transitTicks: 0,
  }
}

function sortUnitIdsByFlowOrder(line: ConveyorLine, unitIds: string[]): string[] {
  const entries = getEntryUnits(line)
  const baseId = entries[0]?.id ?? unitIds[0]
  if (!baseId) return unitIds

  const { orderedUnitIds } = computeFlowOrder(line, baseId)
  const orderPos = new Map(orderedUnitIds.map((id, index) => [id, index]))
  return [...unitIds].sort(
    (a, b) => (orderPos.get(a) ?? 9999) - (orderPos.get(b) ?? 9999),
  )
}

function loadsCanShareCell(
  a: PathSimulationLoad,
  b: PathSimulationLoad,
): boolean {
  return Boolean(a.clearsTestMaterial || b.clearsTestMaterial)
}

function finalizeMultiPathLoads(
  loads: PathSimulationLoad[],
  emptyMessage: string,
): MultiPathSimulationPlan {
  const validLoads = loads.filter((load) => load.pathUnitIds.length > 0)
  const emptyCount = loads.length - validLoads.length

  const startCells = validLoads.map((load) => load.pathUnitIds[0]!)
  const duplicateStarts = startCells.some((cell, index) => {
    const firstIdx = startCells.indexOf(cell)
    if (firstIdx === index) return false
    const first = validLoads[firstIdx]!
    const second = validLoads[index]!
    return !loadsCanShareCell(first, second)
  })

  let message = validLoads.map((load) => load.message).join(' · ')
  if (emptyCount > 0) {
    message = `${message}${message ? ' · ' : ''}${emptyCount}개 경로 없음`
  }
  if (duplicateStarts) {
    message = `${message}${message ? ' · ' : ''}동일 출발 칸 중복 — 동시 출발 불가`
  }

  return {
    loads: duplicateStarts ? [] : validLoads,
    message: message || emptyMessage,
  }
}

/** 테스트 자재가 있는 CV 모듈 (포트·STK 제외) */
export function listTestMaterialUnits(line: ConveyorLine): ConveyorUnit[] {
  return line.units.filter((unit) => isCvUnit(unit) && unit.testMaterial === 1)
}

/** 모듈 위치 → 종료점 경로 (기존 테스트 자재 출고) */
export function planTestMaterialLoadPath(
  line: ConveyorLine,
  unitId: string,
): PathSimulationPlan {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const unit = unitMap.get(unitId)
  if (!unit) {
    return {
      entryUnitId: unitId,
      routingUnitId: null,
      targetStkId: null,
      pathUnitIds: [],
      message: '모듈을 찾을 수 없습니다.',
    }
  }

  const exitPlan = buildEntryToExitPath(unitId, line, unitMap)
  const pathUnitIds = finalizeConveyorSimulationPath(line, exitPlan.pathUnitIds)

  return {
    entryUnitId: unitId,
    routingUnitId: null,
    targetStkId: null,
    targetExitId: exitPlan.exitId ?? resolvePathExitId(line, pathUnitIds),
    pathUnitIds,
    message: `테스트 자재 ${unitDisplayCode(unit)} → 출고 (${pathUnitIds.length}구간)`,
    direction: 'inbound',
  }
}

/** 테스트 자재 출고 경로 — 투입 자재와 동일 CV 출발·중복 허용 */
export function planMultiTestMaterialLoadPaths(
  line: ConveyorLine,
): MultiPathSimulationPlan {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const unitIds = sortUnitIdsByFlowOrder(
    line,
    listTestMaterialUnits(line).map((unit) => unit.id),
  )

  if (unitIds.length === 0) {
    return { loads: [], message: '' }
  }

  const loads = unitIds.map((unitId) =>
    createSimulationLoad(
      planTestMaterialLoadPath(line, unitId),
      unitMap.get(unitId),
      'inbound',
      { clearsTestMaterial: true, loadIdSuffix: '-test' },
    ),
  )

  return finalizeMultiPathLoads(loads, '테스트 자재 출고 경로 없음')
}

export function mergeMultiPathSimulationPlans(
  ...plans: MultiPathSimulationPlan[]
): MultiPathSimulationPlan {
  const loads = dedupeSimulationLoadsById(plans.flatMap((plan) => plan.loads))
  const messages = plans.map((plan) => plan.message).filter(Boolean)
  return finalizeMultiPathLoads(
    loads,
    messages.join(' · ') || '시뮬레이션 경로 없음',
  )
}

function createSimulationLoadInbound(
  line: ConveyorLine,
  entryUnitId: string,
  unitMap: Map<string, ConveyorUnit>,
  destinationUnitId?: string | null,
): PathSimulationLoad {
  const unit = unitMap.get(entryUnitId)
  const plan = planInboundLoadPath(line, entryUnitId, destinationUnitId)
  return createSimulationLoad(plan, unit, 'inbound')
}

/** 선택한 투입점마다 경로를 계산 — 동시 출발용 */
export function planMultiInboundLoadPaths(
  line: ConveyorLine,
  entryUnitIds: string[],
  options?: { destinationUnitIdByEntry?: Record<string, string> },
): MultiPathSimulationPlan {
  if (entryUnitIds.length === 0) {
    return { loads: [], message: '투입점을 선택하세요.' }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const destByEntry = options?.destinationUnitIdByEntry ?? {}
  const loads = entryUnitIds.map((entryUnitId) =>
    createSimulationLoadInbound(
      line,
      entryUnitId,
      unitMap,
      destByEntry[entryUnitId],
    ),
  )

  return finalizeMultiPathLoads(loads, '투입점을 선택하세요.')
}

/** 선택한 OUT 포트마다 출고 경로 계산 — 동시 출발용 */
export function planMultiOutboundLoadPaths(
  line: ConveyorLine,
  portUnitIds: string[],
): MultiPathSimulationPlan {
  if (portUnitIds.length === 0) {
    return { loads: [], message: 'OUT 포트를 선택하세요.' }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const loads = portUnitIds.map((portUnitId) =>
    createSimulationLoad(
      planOutboundLoadPath(line, portUnitId),
      unitMap.get(portUnitId),
      'outbound',
    ),
  )

  return finalizeMultiPathLoads(loads, 'OUT 포트를 선택하세요.')
}

function isAtDestination(load: PathSimulationLoad): boolean {
  return load.pathUnitIds.length > 0 && load.stepIndex >= load.pathUnitIds.length - 1
}

/** 시뮬 load가 아직 투입점을 지나지 않았는지 — 출발 후 투입점 콜아웃 목적지 숨김용 */
export function isSimulationLoadOccupyingEntry(load: PathSimulationLoad): boolean {
  if (load.complete || load.pathUnitIds.length === 0) return false
  const entryUnitId = load.entryUnitId
  const step = Math.min(
    Math.max(0, load.stepIndex),
    load.pathUnitIds.length - 1,
  )
  const entryIndex = load.pathUnitIds.indexOf(entryUnitId)
  if (entryIndex < 0) return step === 0
  return step <= entryIndex
}

/** 출고 대기( dischargeInterval ) — 포트(IN·OUT)·출고점(flowRole exit)에서 적용 */
function requiresDischargeDwellAtCurrentStep(
  load: PathSimulationLoad,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  const currentId = load.pathUnitIds[load.stepIndex]
  if (!currentId || !unitMap) return false
  const unit = unitMap.get(currentId)
  if (!unit) return false

  // IN 포트(투입고)·OUT 포트(출고구) 모두 목적지 도달 시 대기
  if (isPortUnit(unit)) return true
  if (load.targetExitId === currentId) return true
  return false
}

/** 투입 목적지(분기·STK) — 자재를 complete 없이 목적지에 유지 */
function shouldRetainMaterialAtDestination(
  load: PathSimulationLoad,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  const isInbound = load.direction === 'inbound' || load.continuousInject === true
  if (!isInbound) return false
  if (!isAtDestination(load)) return false
  if (requiresDischargeDwellAtCurrentStep(load, unitMap)) return false
  return canDischargeLoadAtCurrentStep(load, unitMap)
}

/** 시뮬 complete(출고) — STK I/O 비활성 시 적재·OUT 반출 없음, 라인 만재까지 자재 유지 */
function canDischargeLoadAtCurrentStep(
  load: PathSimulationLoad,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  const currentId = load.pathUnitIds[load.stepIndex]
  if (!currentId) return false

  const currentUnit = unitMap?.get(currentId)
  if (!SIM_STK_IO_ENABLED) {
    if (currentUnit && isStorageUnit(currentUnit)) return false
    if (
      currentUnit &&
      isPortUnit(currentUnit) &&
      (currentUnit.portDirection ?? 'IN') === 'OUT'
    ) {
      return false
    }
    if (load.direction === 'outbound') {
      // STK 출고 반송(포트→종료점) 자재는 종료점 도달 시 출고 완료
      return load.targetExitId != null && currentId === load.targetExitId
    }
  }

  const isInbound = load.direction === 'inbound' || load.continuousInject === true
  if (!isInbound) return true

  if (load.targetStkId) {
    return currentId === load.targetStkId
  }
  if (load.routingUnitId) {
    return currentId === load.routingUnitId
  }
  if (load.targetExitId) {
    return currentId === load.targetExitId
  }
  return false
}

interface MergeProposal {
  index: number
  from: string
  to: string
  stepIndex: number
  pathUnitIds: string[]
}

/** 합류점 — 직진(through) 우선, 그다음 inDir 일치, 동률이면 경로상 선행·stepIndex */
function pickMergeProposalWinner(
  contenders: MergeProposal[],
  unitMap: Map<string, ConveyorUnit> | undefined,
  flowMap: Map<string, UnitFlowDirs> | undefined,
  line?: ConveyorLine,
): number {
  if (contenders.length === 0) return 0
  if (contenders.length === 1) return contenders[0]!.index

  const target = unitMap?.get(contenders[0]!.to)
  const flow = flowMap?.get(contenders[0]!.to)

  if (line && unitMap && target?.type === 'junction') {
    const throughContenders = contenders.filter((candidate) => {
      const after = candidate.pathUnitIds[candidate.stepIndex + 1]
      return isJunctionThroughPathStep(target, unitMap, line, candidate.from, after)
    })
    if (throughContenders.length > 0) {
      return pickMergeProposalWinner(throughContenders, unitMap, flowMap)
    }
  }

  if (unitMap && target && flow?.inDir) {
    const upstream = contenders.filter((candidate) => {
      const from = unitMap.get(candidate.from)
      if (!from) return false
      return flowEntryDir(from, target) === flow.inDir
    })
    if (upstream.length > 0) {
      return upstream.sort(
        (a, b) => b.stepIndex - a.stepIndex || a.index - b.index,
      )[0]!.index
    }
  }

  const onOwnPath = contenders.filter(
    (candidate) =>
      candidate.pathUnitIds[candidate.stepIndex] === candidate.from &&
      candidate.pathUnitIds[candidate.stepIndex + 1] === candidate.to,
  )
  if (onOwnPath.length > 0) {
    return onOwnPath.sort(
      (a, b) => b.stepIndex - a.stepIndex || a.index - b.index,
    )[0]!.index
  }

  return contenders.sort(
    (a, b) => b.stepIndex - a.stepIndex || a.index - b.index,
  )[0]!.index
}

function resolveMergeWinnersByTarget(
  proposals: Map<number, number>,
  loads: PathSimulationLoad[],
  posAt: (index: number, step: number) => string,
  unitMap: Map<string, ConveyorUnit> | undefined,
  flowMap: Map<string, UnitFlowDirs> | undefined,
  line?: ConveyorLine,
): Map<string, number> {
  const byTarget = new Map<string, number[]>()

  for (const [index, targetStep] of proposals) {
    const to = posAt(index, targetStep)
    const indices = byTarget.get(to) ?? []
    indices.push(index)
    byTarget.set(to, indices)
  }

  const winners = new Map<string, number>()
  for (const [to, indices] of byTarget) {
    if (indices.length <= 1) {
      winners.set(to, indices[0]!)
      continue
    }

    const winner = pickMergeProposalWinner(
      indices.map((index) => ({
        index,
        from: posAt(index, loads[index]!.stepIndex),
        to,
        stepIndex: loads[index]!.stepIndex,
        pathUnitIds: loads[index]!.pathUnitIds,
      })),
      unitMap,
      flowMap,
      line,
    )
    winners.set(to, winner)
  }

  return winners
}

/** 물류 순서(투입점 기준)로 자재 load 정렬 */
export function sortSimulationLoadsByFlowOrder(
  line: ConveyorLine,
  loads: PathSimulationLoad[],
): PathSimulationLoad[] {
  const order = sortUnitIdsByFlowOrder(
    line,
    loads.map((load) => load.entryUnitId),
  )
  const orderPos = new Map(order.map((id, index) => [id, index]))
  return [...loads].sort(
    (a, b) =>
      (orderPos.get(a.entryUnitId) ?? 9999) - (orderPos.get(b.entryUnitId) ?? 9999),
  )
}

/** 투입·테스트 자재 — 투입 간격만큼 순차 출발 */
export function initializeParallelLoads(
  loads: PathSimulationLoad[],
  timing?: SimulationStepTiming,
  line?: ConveyorLine,
): PathSimulationLoad[] {
  const entryTicksRequired = timing
    ? requiredDwellTicks(timing.inputIntervalSec)
    : 1
  const ordered = line
    ? sortSimulationLoadsByFlowOrder(line, loads)
    : dedupeSimulationLoadsById(loads)

  return dedupeSimulationLoadsById(ordered).map((load, index) => ({
    ...load,
    pathUnitIds: [...load.pathUnitIds],
    released: index === 0,
    pendingReleaseTicks: index > 0 ? index * entryTicksRequired : 0,
    entryTicks: 0,
    exitTicks: 0,
    transitTicks: 0,
  }))
}

/** 시작 버튼 — 경로 순차 미리보기 후 동시 투입용 (출발 전 대기) */
export function initializeLoadsForSequentialReveal(
  loads: PathSimulationLoad[],
): PathSimulationLoad[] {
  return dedupeSimulationLoadsById(loads).map((load) => ({
    ...load,
    pathUnitIds: [...load.pathUnitIds],
    released: false,
    pendingReleaseTicks: 0,
    stepIndex: 0,
    entryTicks: 0,
    exitTicks: 0,
    transitTicks: 0,
  }))
}

export function releaseAllSimulationLoads(
  loads: PathSimulationLoad[],
): PathSimulationLoad[] {
  return loads.map((load) => ({
    ...load,
    released: true,
    pendingReleaseTicks: 0,
  }))
}

function sortLoadsByEntryLabel(loads: PathSimulationLoad[]): PathSimulationLoad[] {
  return [...loads].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
}

/**
 * 시작 버튼 경로 미리보기 순서 — 투입점(이름·번호 순) → 출고 테스트 자재(이름·번호 순)
 */
export function buildSequentialRevealLoadOrder(
  _line: ConveyorLine,
  loads: PathSimulationLoad[],
): PathSimulationLoad[] {
  const entryLoads = sortLoadsByEntryLabel(
    loads.filter((load) => !load.clearsTestMaterial),
  )
  const exitLoads = sortLoadsByEntryLabel(
    loads.filter((load) => load.clearsTestMaterial),
  )
  return [...entryLoads, ...exitLoads]
}

/** 경로 미리보기에 쓸 유닛 순서 — previewPathUnitIds 우선 */
export function revealPathUnitIdsForLoad(load: PathSimulationLoad): string[] {
  if (load.previewPathUnitIds && load.previewPathUnitIds.length > 0) {
    return load.previewPathUnitIds
  }
  return load.pathUnitIds
}

/** 순차 미리보기 — 현재 투입점 경로만 점등 (이전 경로는 표시하지 않음) */
export function simulationSequentialRevealUnitIds(
  loads: PathSimulationLoad[],
  revealSteps: Record<string, number>,
  revealOrder: string[],
  activeRevealIndex: number,
  unitMap?: Map<string, ConveyorUnit>,
): string[] {
  if (activeRevealIndex < 0 || activeRevealIndex >= revealOrder.length) {
    return []
  }

  const loadById = new Map(loads.map((load) => [load.id, load]))
  const load = loadById.get(revealOrder[activeRevealIndex]!)
  const revealPath = load ? revealPathUnitIdsForLoad(load) : []
  if (!load || revealPath.length === 0) return []

  const step = revealSteps[load.id] ?? 0
  const ordered: string[] = []
  for (let j = 0; j <= step && j < revealPath.length; j += 1) {
    const unitId = revealPath[j]!
    if (unitMap) {
      const unit = unitMap.get(unitId)
      if (unit && !isConveyorLineTransitUnit(unit)) continue
    }
    ordered.push(unitId)
  }

  return ordered
}

export interface SimulationStepTiming {
  inputIntervalSec: number
  dischargeIntervalSec: number
  transitIntervalSec: number
  /** 연속 투입 활성 — 연속 자재 entry 체류 1틱 */
  continuousInputActive?: boolean
  /** STK 적재 슬롯 — 만재 시 투입 자재 STK 진입 차단 */
  warehouseFillCounts?: Record<string, number>
  /** 회전 유닛 각도별 통과 소요시간 (초) */
  turnTransitSec?: { 90: number; 180: number; 270: number }
  /** 회전 유닛 복귀 대기 — 자재 전달 후 복귀 중인 유닛 ID → 잔여 틱 */
  turnReturnDwells?: Record<string, number>
}

/** applySimulationStep 반환값 */
export interface SimulationStepResult {
  loads: PathSimulationLoad[]
  /** 이 틱에 자재를 전달하고 복귀 동작을 시작한 회전 유닛 (unitId → 복귀 틱 수) */
  newTurnReturnDwells: Record<string, number>
}

/** 시뮬 투입·이송·출고 시간 입력값 (0.1~60초) */
export function clampSimIntervalSec(
  value: number,
  fallback = DEFAULT_SIM_INPUT_INTERVAL_SEC,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(60, Math.max(0.1, Math.round(value * 10) / 10))
}

const SIM_TICK_SEC = PATH_SIMULATION_STEP_MS / 1000

/** 초 → 시뮬 틱 수 (틱 간격 PATH_SIMULATION_STEP_MS) */
function requiredDwellTicks(intervalSec: number): number {
  return Math.max(1, Math.ceil(Math.max(0.1, intervalSec) / SIM_TICK_SEC))
}

/** 이송 — 모듈 체류 후 다음 칸 이동까지 필요한 시뮬 틱 수 */
function requiredTransitTicks(transitIntervalSec: number): number {
  return Math.max(1, Math.ceil(Math.max(0.1, transitIntervalSec) / SIM_TICK_SEC))
}

function isReadyToLeaveModule(
  load: PathSimulationLoad,
  entryTicksRequired: number,
  transitTicksRequired: number,
  timing?: SimulationStepTiming,
): boolean {
  if (isAtDestination(load)) return false
  const entryRequired = resolveEntryTicksRequired(load, entryTicksRequired, timing)
  if (load.stepIndex === 0) {
    return (load.entryTicks ?? 0) >= entryRequired
  }
  return (load.transitTicks ?? 0) >= transitTicksRequired
}

function resolveEntryTicksRequired(
  load: PathSimulationLoad,
  entryTicksRequired: number,
  timing?: SimulationStepTiming,
): number {
  if (timing?.continuousInputActive && load.continuousInject) return 1
  return entryTicksRequired
}

function gridDeltaToFlowDir(dx: number, dy: number): 'N' | 'E' | 'S' | 'W' | null {
  if (dx === 1 && dy === 0) return 'E'
  if (dx === -1 && dy === 0) return 'W'
  if (dx === 0 && dy === 1) return 'S'
  if (dx === 0 && dy === -1) return 'N'
  return null
}

/** 회전 유닛 통과 각도(90/180/270) — PIO 브리지 등 외부에서도 실제 회전 소요시간을 조회할 때 재사용 */
export function getTurnTraversalAngle(
  load: PathSimulationLoad,
  unitMap: Map<string, ConveyorUnit>,
): 90 | 180 | 270 | null {
  const idx = load.stepIndex
  const curr = unitMap.get(load.pathUnitIds[idx] ?? '')
  if (!curr || curr.type !== 'turn') return null
  const prev = unitMap.get(load.pathUnitIds[idx - 1] ?? '')
  const next = unitMap.get(load.pathUnitIds[idx + 1] ?? '')
  if (!prev || !next) return null
  const inDir = gridDeltaToFlowDir(curr.gridX - prev.gridX, curr.gridY - prev.gridY)
  const outDir = gridDeltaToFlowDir(next.gridX - curr.gridX, next.gridY - curr.gridY)
  if (!inDir || !outDir) return null
  const angle = turnRelativeAngleDegrees(inDir, outDir)
  if (angle === 90 || angle === 180 || angle === 270) return angle
  return null
}

function resolveTransitTicksForLoad(
  load: PathSimulationLoad,
  baseTransitTicks: number,
  timing: SimulationStepTiming,
  unitMap?: Map<string, ConveyorUnit>,
): number {
  if (unitMap && timing.turnTransitSec) {
    const angle = getTurnTraversalAngle(load, unitMap)
    if (angle != null) {
      const sec = timing.turnTransitSec[angle]
      if (sec != null) return requiredTransitTicks(sec)
    }
  }
  return baseTransitTicks
}

export function applySimulationStep(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
  timing?: SimulationStepTiming,
  flowMap?: Map<string, UnitFlowDirs>,
  line?: ConveyorLine,
): SimulationStepResult {
  const nextLoads = advanceSimulationLoads(loads, unitMap, timing, flowMap, line)

  // 자재를 전달한 회전 유닛 검출 → 복귀 대기 틱 계산
  const baseTransitTicks = requiredTransitTicks(timing?.transitIntervalSec ?? 0.5)
  const fallbackTiming: SimulationStepTiming = {
    inputIntervalSec: 0.5,
    dischargeIntervalSec: 0.5,
    transitIntervalSec: 0.5,
  }
  const effectiveTiming = timing ?? fallbackTiming
  const beforeById = new Map(loads.map((l) => [l.id, l]))
  const newTurnReturnDwells: Record<string, number> = {}

  for (const after of nextLoads) {
    const before = beforeById.get(after.id)
    if (!before || before.complete || after.stepIndex <= before.stepIndex) continue
    const fromUnitId = before.pathUnitIds[before.stepIndex]
    if (!fromUnitId) continue
    const fromUnit = unitMap?.get(fromUnitId)
    if (fromUnit?.type !== 'turn') continue
    const returnTicks = resolveTransitTicksForLoad(before, baseTransitTicks, effectiveTiming, unitMap)
    newTurnReturnDwells[fromUnitId] = returnTicks
  }

  return { loads: nextLoads, newTurnReturnDwells }
}

export function countIncompleteSimulationLoads(loads: PathSimulationLoad[]): number {
  return loads.filter((load) => load.pathUnitIds.length > 0 && !isLoadFullyDischarged(load)).length
}

/** 자재가 목적지 도착(투입 유지) 또는 출고 완료 */
export function isLoadFullyDischarged(
  load: PathSimulationLoad,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  if (load.pathUnitIds.length === 0) return false
  if (load.complete) {
    // IN 포트에 남아 STK 회수를 기다리는 완료 자재는 물리적으로 아직 있는 것 —
    // "출고 완료"로 간주하면 배치 상태가 조기에 complete로 넘어가 네온이 꺼짐
    if (isCompletedLoadHoldingPort(load, unitMap)) return false
    return load.stepIndex >= load.pathUnitIds.length - 1
  }
  return shouldRetainMaterialAtDestination(load, unitMap)
}

/**
 * SIM_STK_IO_ENABLED=false 일 때 OUT 포트에 자재가 영구 대기 중인지 — 택 타임 동결 조건.
 * OUT 포트는 I/O 비활성 상태에서 discharge 가 차단되어 complete 가 절대 설정되지 않는다.
 */
export function isLoadAtBlockedPortDestination(
  load: PathSimulationLoad,
  unitMap: Map<string, ConveyorUnit>,
): boolean {
  if (load.complete || load.pathUnitIds.length === 0) return false
  if (load.stepIndex < load.pathUnitIds.length - 1) return false
  const currentId = load.pathUnitIds[load.stepIndex]
  if (!currentId) return false
  const unit = unitMap.get(currentId)
  if (!unit || !isPortUnit(unit)) return false
  if (SIM_STK_IO_ENABLED) return false
  return (unit.portDirection ?? 'IN') === 'OUT'
}

type InboundRerouteResult = {
  pathUnitIds: string[]
  blocked: boolean
}

/**
 * 계획 경로에 오류 엣지가 있거나 다음 hop이 오류면 A*로 우회 재탐색.
 * 우회 불가 시 blocked=true → 호출부에서 대기 처리.
 */
function tryRerouteInboundLoadPath(
  load: PathSimulationLoad,
  line: ConveyorLine,
  unitMap: Map<string, ConveyorUnit>,
): InboundRerouteResult {
  const pathUnitIds = load.pathUnitIds
  if (pathUnitIds.length === 0) return { pathUnitIds, blocked: false }

  const destinationId = pathUnitIds[pathUnitIds.length - 1]!
  const currentId = pathUnitIds[load.stepIndex]!
  if (currentId === destinationId) return { pathUnitIds, blocked: false }

  const graph = buildInboundTransportGraph(line, load.entryUnitId, unitMap)
  if (!graph) return { pathUnitIds, blocked: true }

  refreshTransportEdgeStates(graph, unitMap)

  const isHopBlocked = (fromId: string, toId: string): boolean => {
    const edge = getTransportEdge(graph, fromId, toId)
    if (edge) return !isPathfindingTraversableEdge(edge.state)
    const bridge = astarTransportPath(graph, fromId, toId, unitMap)
    return bridge == null
  }

  const currentUnit = unitMap.get(currentId)
  const currentIsPort = currentUnit != null && isPortUnit(currentUnit)

  let needsReroute = false
  for (let i = load.stepIndex; i < pathUnitIds.length - 1; i += 1) {
    // 포트 유닛은 그래프에 없으므로 hop 검사 건너뜀
    const fromUnit = unitMap.get(pathUnitIds[i]!)
    if (fromUnit && isPortUnit(fromUnit)) continue
    if (isHopBlocked(pathUnitIds[i]!, pathUnitIds[i + 1]!)) {
      needsReroute = true
      break
    }
  }

  // 현재 위치가 포트가 아닐 때만 다음 hop 검사
  if (!currentIsPort) {
    const nextId = pathUnitIds[load.stepIndex + 1]
    if (nextId && isHopBlocked(currentId, nextId)) {
      needsReroute = true
    }
  }

  if (!needsReroute) return { pathUnitIds, blocked: false }

  // 포트 위치에서 재탐색할 때는 다음 CV 유닛을 A* 시작점으로 사용
  const rerouteFromId = currentIsPort
    ? (pathUnitIds[load.stepIndex + 1] ?? currentId)
    : currentId
  const astar = astarTransportPath(graph, rerouteFromId, destinationId, unitMap)
  if (!astar) return { pathUnitIds, blocked: true }

  const prefix = pathUnitIds.slice(0, load.stepIndex + 1)
  const tail = currentIsPort
    ? astar.pathUnitIds          // 포트 이후 전체 경로
    : astar.pathUnitIds.slice(1) // 현재 위치는 이미 prefix에 있으므로 제외
  return { pathUnitIds: [...prefix, ...tail], blocked: false }
}

/** 라인에 계획된 모든 자재가 출고 완료됐는지 */
export function areAllSimulationLoadsFinished(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  const active = loads.filter((load) => load.pathUnitIds.length > 0)
  return active.length > 0 && active.every((load) => isLoadFullyDischarged(load, unitMap))
}

/**
 * 완료 자재가 IN 포트에 남아 회수 대기 중인지 — 셀 점유·CST 표시 유지.
 * 포트 도착 complete 자재는 STK 회수(dischargeLoadAtPort) 전까지 물리적으로
 * 포트에 존재하므로 후속 자재의 진입을 막아야 하고(겹침 방지), 화살표 네온도
 * 계속 표시돼야 한다(일반 종료점의 "complete=출고 완료·소멸"과 다른 의미).
 */
export function isCompletedLoadHoldingPort(
  load: PathSimulationLoad,
  unitMap?: Map<string, ConveyorUnit>,
): boolean {
  if (!load.complete || load.pathUnitIds.length === 0) return false
  const lastId = load.pathUnitIds[load.pathUnitIds.length - 1]
  const unit = lastId ? unitMap?.get(lastId) : undefined
  return unit != null && isPortUnit(unit)
}

/** 한 틱 진행 — 앞(다음) 모듈에 자재 없을 때만 전진, 겹침·비가동 시 대기 */
export function advanceSimulationLoads(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
  timing: SimulationStepTiming = {
    inputIntervalSec: 0.5,
    dischargeIntervalSec: 0.5,
    transitIntervalSec: 0.5,
  },
  flowMap?: Map<string, UnitFlowDirs>,
  line?: ConveyorLine,
): PathSimulationLoad[] {
  const entryTicksRequired = requiredDwellTicks(timing.inputIntervalSec)
  const exitTicksRequired = requiredDwellTicks(timing.dischargeIntervalSec)
  const transitTicksRequired = requiredTransitTicks(timing.transitIntervalSec)

  const next = dedupeSimulationLoadsById(loads).map((load) => ({
    ...load,
    waiting: false,
    entryTicks: load.entryTicks ?? 0,
    exitTicks: load.exitTicks ?? 0,
    transitTicks: load.transitTicks ?? 0,
  }))

  for (let i = 0; i < next.length; i += 1) {
    const load = next[i]!
    if (load.complete) continue

    if (!load.released) {
      const pending = load.pendingReleaseTicks ?? 0
      if (pending > 0) {
        load.pendingReleaseTicks = pending - 1
        load.waiting = true
        continue
      }
      load.released = true
    }

    if (!load.released) continue

    if (isAtDestination(load)) {
      const currentUnitId = load.pathUnitIds[load.stepIndex]
      const currentUnit = currentUnitId ? unitMap?.get(currentUnitId) : undefined
      const dischargeAtDest = requiresDischargeDwellAtCurrentStep(load, unitMap)
      const retainAtDest = shouldRetainMaterialAtDestination(load, unitMap)
      if (
        currentUnit &&
        !isSimulationTransitPassable(currentUnit) &&
        !dischargeAtDest &&
        !retainAtDest
      ) {
        load.waiting = true
        continue
      }
      const entryRequired = resolveEntryTicksRequired(load, entryTicksRequired, timing)
      if (load.stepIndex === 0 && load.entryTicks < entryRequired) {
        load.entryTicks += 1
        load.waiting = load.entryTicks < entryRequired
        continue
      }
      if (!canDischargeLoadAtCurrentStep(load, unitMap)) {
        load.waiting = true
        continue
      }
      if (
        currentUnitId &&
        load.targetStkId === currentUnitId &&
        isStkAtCapacity(currentUnitId, timing.warehouseFillCounts ?? {})
      ) {
        load.waiting = true
        continue
      }
      if (shouldRetainMaterialAtDestination(load, unitMap)) {
        load.waiting = false
        continue
      }
      if (!requiresDischargeDwellAtCurrentStep(load, unitMap)) {
        load.complete = true
        continue
      }
      load.exitTicks += 1
      if (load.exitTicks >= exitTicksRequired) {
        load.complete = true
      } else {
        load.waiting = true
      }
      continue
    }

    const entryRequired = resolveEntryTicksRequired(load, entryTicksRequired, timing)
    if (load.stepIndex === 0 && load.entryTicks < entryRequired) {
      load.entryTicks += 1
      load.waiting = true
      continue
    }

    const loadTransitTicks = resolveTransitTicksForLoad(load, transitTicksRequired, timing, unitMap)
    if (load.stepIndex > 0 && load.transitTicks < loadTransitTicks) {
      load.transitTicks += 1
      load.waiting = true
    }
  }

  if (line && unitMap) {
    for (let i = 0; i < next.length; i += 1) {
      const load = next[i]!
      if (!load.released || load.complete || isAtDestination(load)) continue
      if (load.direction !== 'inbound' && load.continuousInject !== true) continue

      const reroute = tryRerouteInboundLoadPath(load, line, unitMap)
      if (reroute.blocked) {
        next[i]!.waiting = true
        continue
      }
      if (reroute.pathUnitIds !== load.pathUnitIds) {
        next[i]!.pathUnitIds = reroute.pathUnitIds
      }
    }
  }

  const proposals = new Map<number, number>()
  for (let i = 0; i < next.length; i += 1) {
    const load = next[i]!
    if (!load.released || load.complete || isAtDestination(load)) continue
    if (!isReadyToLeaveModule(load, entryTicksRequired, resolveTransitTicksForLoad(load, transitTicksRequired, timing, unitMap), timing)) {
      load.waiting = true
      continue
    }
    if (load.stepIndex < load.pathUnitIds.length - 1) {
      proposals.set(i, load.stepIndex + 1)
    }
  }

  const posAt = (index: number, step: number) => next[index]!.pathUnitIds[step]!
  const approved = new Set<number>()
  const mergeWinnerByTarget = resolveMergeWinnersByTarget(
    proposals,
    next,
    posAt,
    unitMap,
    flowMap,
    line,
  )

  const proposalEntries = [...proposals.entries()].sort(
    ([indexA], [indexB]) => next[indexB]!.stepIndex - next[indexA]!.stepIndex,
  )

  for (const [index, targetStep] of proposalEntries) {
    const from = posAt(index, next[index]!.stepIndex)
    const to = posAt(index, targetStep)
    if (from === to) continue

    const load = next[index]!

    const mergeWinner = mergeWinnerByTarget.get(to)
    if (mergeWinner != null && mergeWinner !== index) {
      next[index]!.waiting = true
      continue
    }

    // 회전 유닛 복귀 대기 — 자재 전달 후 복귀 중이면 신규 진입 차단
    if (timing.turnReturnDwells && unitMap) {
      const targetUnit = unitMap.get(to)
      if (targetUnit?.type === 'turn' && (timing.turnReturnDwells[to] ?? 0) > 0) {
        next[index]!.waiting = true
        continue
      }
    }

    let blocked = false

    for (let otherIndex = 0; otherIndex < next.length; otherIndex += 1) {
      if (otherIndex === index) continue
      const other = next[otherIndex]!
      if (!other.released) continue
      // 완료 자재도 IN 포트에서 회수 대기 중이면 점유 유지 — 후속 자재 겹침 방지
      if (other.complete && !isCompletedLoadHoldingPort(other, unitMap)) continue
      const otherCurrent = posAt(otherIndex, next[otherIndex]!.stepIndex)
      if (otherCurrent !== to) continue

      // 점유 자재가 "이번 틱에 실제로 비켜주는지"로 판단해야 한다.
      // proposals(이동 의향)만 보면, 앞 칸이 막혀 대기 중인 자재(목적지 직전
      // 칸 등)도 제안은 매 틱 내므로 "비켜준다"고 오판해 같은 칸에 자재가
      // 겹쳐 사라진다. proposalEntries는 stepIndex 내림차순이라 앞 자재
      // (otherIndex, 더 큰 stepIndex)는 항상 먼저 처리되어 approved 여부가
      // 확정돼 있으므로 approved 집합으로 실제 이동 여부를 확인한다.
      const otherLeaving = approved.has(otherIndex)
      if (!otherLeaving) {
        blocked = true
        break
      }
    }

    if (blocked) {
      next[index]!.waiting = true
      continue
    }

    if (unitMap) {
      const targetUnit = unitMap.get(to)
      const fromUnit = unitMap.get(from)

      if (line && fromUnit && targetUnit) {
        const junction =
          targetUnit.type === 'junction'
            ? targetUnit
            : fromUnit.type === 'junction'
              ? fromUnit
              : null
        const throughJunctionMove =
          junction != null &&
          isJunctionThroughMoveForLoad(junction, unitMap, line, load, from, to)
        const ownJunctionTraversal =
          junction != null &&
          isOwnPlannedJunctionTraversal(load, junction, from, to)
        if (
          junction &&
          !throughJunctionMove &&
          !ownJunctionTraversal &&
          isJunctionCrossPath(line, junction, load.pathUnitIds) &&
          isJunctionCrossRequestActive(line, junction, next) &&
          !canApproveJunctionCrossMove(line, junction, next, unitMap)
        ) {
          const step = load.stepIndex
          const enteringJunction = to === junction.id
          const leavingJunction = from === junction.id
          const onCrossApproach =
            enteringJunction || leavingJunction || step + 1 < load.pathUnitIds.length
          if (onCrossApproach) {
            next[index]!.waiting = true
            continue
          }
        }
      }

      if (fromUnit && isPortUnit(fromUnit) && !isSimulationPortOperable(fromUnit)) {
        next[index]!.waiting = true
        continue
      }
      if (targetUnit && isPortUnit(targetUnit) && !isSimulationPortOperable(targetUnit)) {
        next[index]!.waiting = true
        continue
      }

      const inboundToTargetStk =
        (load.direction === 'inbound' || load.continuousInject === true) &&
        load.targetStkId != null &&
        load.targetStkId === to
      if (
        targetUnit &&
        isStorageUnit(targetUnit) &&
        inboundToTargetStk &&
        isStkAtCapacity(to, timing.warehouseFillCounts ?? {})
      ) {
        next[index]!.waiting = true
        continue
      }

      if (
        targetUnit &&
        !isSimulationTransitPassable(targetUnit)
      ) {
        next[index]!.waiting = true
        continue
      }
    }

    approved.add(index)
  }

  for (const index of approved) {
    const targetStep = proposals.get(index)!
    next[index]!.stepIndex = targetStep
    next[index]!.transitTicks = 0
    if (next[index]!.stepIndex > 0) {
      next[index]!.entryTicks = 0
    }
  }

  return next
}

export function unionSimulationPathUnitIds(loads: PathSimulationLoad[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const load of loads) {
    for (const unitId of load.pathUnitIds) {
      if (!seen.has(unitId)) {
        seen.add(unitId)
        ordered.push(unitId)
      }
    }
  }
  return ordered
}

/** 경로 하이라이트 — 컨베이어(직선·분기·회전)만 표시 */
export function unionSimulationConveyorPathUnitIds(
  loads: PathSimulationLoad[],
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  return filterConveyorLineTransitIds(unionSimulationPathUnitIds(loads), unitMap)
}

export function activeSimulationUnitIds(loads: PathSimulationLoad[]): string[] {
  return dedupeSimulationLoadsById(loads)
    .filter((load) => load.released && !load.complete && load.pathUnitIds.length > 0)
    .map((load) => {
      const step = Math.min(
        Math.max(0, load.stepIndex),
        load.pathUnitIds.length - 1,
      )
      return load.pathUnitIds[step]!
    })
    .filter(Boolean)
}

/** CST On 표시 — 진행 중 자재 위치 (칸당 1 CST, 대기 자재 우선) */
export function simulationCstUnitIds(
  loads: PathSimulationLoad[],
  options?: { includeCompleted?: boolean; unitMap?: Map<string, ConveyorUnit> },
): string[] {
  const includeCompleted = options?.includeCompleted ?? true
  const unitMap = options?.unitMap
  const bestByUnit = new Map<string, PathSimulationLoad>()

  for (const load of dedupeSimulationLoadsById(loads)) {
    if (!load.released || load.pathUnitIds.length === 0) continue
    // 포트에 남아 회수 대기 중인 완료 자재는 includeCompleted와 무관하게 항상 표시
    // (일반 종료점의 "complete=출고 완료·소멸"과 달리 물리적으로 자재가 남아 있음)
    if (!includeCompleted && load.complete && !isCompletedLoadHoldingPort(load, unitMap)) {
      continue
    }
    const step = Math.min(
      Math.max(0, load.stepIndex),
      load.pathUnitIds.length - 1,
    )
    const unitId = load.pathUnitIds[step]
    if (!unitId) continue

    const existing = bestByUnit.get(unitId)
    if (!existing) {
      bestByUnit.set(unitId, load)
      continue
    }
    if (load.waiting && !existing.waiting) {
      bestByUnit.set(unitId, load)
      continue
    }
    if (load.waiting === existing.waiting && load.stepIndex < existing.stepIndex) {
      bestByUnit.set(unitId, load)
    }
  }

  return [...bestByUnit.keys()]
}

function unitShowsInboundSimDestination(unit: ConveyorUnit): boolean {
  return (
    unit.type === 'junction' ||
    unit.type === 'turn' ||
    unit.flowRole === 'exit' ||
    unit.flowRole === 'entry' ||
    unit.role === 'INPUT'
  )
}

/** 투입 자재가 위치한 분기·회전·투입점 — load 목적지 라벨 (CST 없으면 비움) */
export function buildInboundSimDestinationByUnitId(
  loads: PathSimulationLoad[],
  materialUnitIds: string[],
  units: ConveyorUnit[],
): Record<string, string> {
  const unitMap = new Map(units.map((unit) => [unit.id, unit]))
  const materialAt = new Set(materialUnitIds)
  const map: Record<string, string> = {}

  for (const load of dedupeSimulationLoadsById(loads)) {
    if (load.direction !== 'inbound' || load.complete || !load.routingUnitId) continue
    if (!load.released || load.pathUnitIds.length === 0) continue

    const step = Math.min(
      Math.max(0, load.stepIndex),
      load.pathUnitIds.length - 1,
    )
    const currentUnitId = load.pathUnitIds[step]
    if (!currentUnitId || !materialAt.has(currentUnitId)) continue

    const unit = unitMap.get(currentUnitId)
    if (!unit || !unitShowsInboundSimDestination(unit)) continue

    const dest = unitMap.get(load.routingUnitId)
    if (dest) map[currentUnitId] = unitDisplayCode(dest)
  }

  return map
}

/** 시뮬 — 모듈 체류 타이머 진행 중(컨베이어 이송 연출) */
function isSimulationLoadInTransit(
  load: PathSimulationLoad,
  transitRequired: number,
): boolean {
  if (!load.released || load.complete || isAtDestination(load)) return false
  if (load.stepIndex <= 0) return false
  const transitTicks = load.transitTicks ?? 0
  return transitTicks > 0 && transitTicks < transitRequired
}

/** 콜아웃 STATUS — 시뮬 중 유닛별 LD / ULD / BUSY */
export function resolveSimulationUnitTransferStatus(
  unitId: string,
  loads: PathSimulationLoad[],
  _unitMap: Map<string, ConveyorUnit> | undefined,
  options: {
    staticTestAtOrigin?: boolean
    simulating: boolean
    inputIntervalSec?: number
    transitIntervalSec?: number
    dischargeIntervalSec?: number
    continuousInputActive?: boolean
  },
): CalloutTransferStatus | null {
  if (!options.simulating) return null
  if (options.staticTestAtOrigin) return 'ULD'

  const transitRequired = requiredTransitTicks(
    options.transitIntervalSec ?? DEFAULT_SIM_TRANSIT_INTERVAL_SEC,
  )

  let hasMaterial = false
  let hasStableMaterial = false
  let hasTransitMaterial = false

  for (const load of loads) {
    if (!load.released || load.complete || load.pathUnitIds.length === 0) continue
    const step = Math.min(Math.max(0, load.stepIndex), load.pathUnitIds.length - 1)
    const currentId = load.pathUnitIds[step]
    if (currentId !== unitId) continue

    hasMaterial = true
    if (isSimulationLoadInTransit(load, transitRequired)) hasTransitMaterial = true
    else hasStableMaterial = true
  }

  if (!hasMaterial) return 'LD'
  // 동일 유닛에 여러 load가 겹치는 프레임에서 상태가 흔들리지 않도록
  // 정지(ULD) 자재가 하나라도 있으면 ULD를 우선한다.
  if (hasStableMaterial) return 'ULD'
  if (hasTransitMaterial) return 'BUSY'
  return 'LD'
}

/**
 * 시뮬 중 출발 모듈에 고정 표시할 테스트 자재 (아직 출고 전·출발 칸 대기).
 * released 후 다음 모듈로 이동하면 제외 — simulationCstUnitIds가 이동 위치 표시.
 */
export function staticTestMaterialOriginUnitIds(
  line: ConveyorLine,
  loads: PathSimulationLoad[],
): Set<string> {
  const result = new Set<string>()
  for (const unit of listTestMaterialUnits(line)) {
    const load = loads.find(
      (item) => item.clearsTestMaterial && item.entryUnitId === unit.id,
    )
    if (!load) {
      result.add(unit.id)
      continue
    }
    if (load.stepIndex === 0 && !load.complete) {
      result.add(unit.id)
    }
  }
  return result
}

/** 경로 시뮬 시작 — 출발부터 revealStep까지 누적 점등 */
export function simulationRevealUnitIds(
  loads: PathSimulationLoad[],
  revealSteps: Record<string, number>,
  unitMap?: Map<string, ConveyorUnit>,
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const load of loads) {
    const revealPath = revealPathUnitIdsForLoad(load)
    const step = revealSteps[load.id] ?? 0
    for (let i = 0; i <= step && i < revealPath.length; i += 1) {
      const unitId = revealPath[i]!
      if (unitMap) {
        const unit = unitMap.get(unitId)
        if (unit && !isConveyorLineTransitUnit(unit)) continue
      }
      if (!seen.has(unitId)) {
        seen.add(unitId)
        ordered.push(unitId)
      }
    }
  }
  return ordered
}

/** 경로 시뮬 시작 — 각 load의 최종 유닛 ID */
export function simulationFinalUnitIds(loads: PathSimulationLoad[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const load of loads) {
    if (load.pathUnitIds.length === 0) continue
    const finalId = load.pathUnitIds[load.pathUnitIds.length - 1]!
    if (!seen.has(finalId)) {
      seen.add(finalId)
      ordered.push(finalId)
    }
  }
  return ordered
}

export interface LoadTackTimeSummary {
  loadId: string
  entryUnitId: string
  label: string
  exitLabel: string
  tackTimeSec: number
  estimatedTackTimeSec: number
  moduleCount: number
  /** 경로 중간 분기·회전 유닛 레이블 (별자리 노드 표시용) */
  waypointLabels: string[]
}

export const MIN_TACK_TIME_SEC = 0

export interface EntryVacancyState {
  vacantTicks: number
}

export function continuousEntryVacantTicksRequired(): number {
  return 1
}

export function tickEntryVacancy(
  entryUnitId: string,
  loads: PathSimulationLoad[],
  state: EntryVacancyState,
): EntryVacancyState {
  const occupied = loads.some(
    (load) =>
      !load.complete &&
      load.pathUnitIds.length > 0 &&
      load.pathUnitIds[load.stepIndex] === entryUnitId,
  )
  if (occupied) {
    return { vacantTicks: 0 }
  }
  return { vacantTicks: state.vacantTicks + 1 }
}

export function isEntryPointReadyForContinuousInject(
  entryUnitId: string,
  loads: PathSimulationLoad[],
  vacancy: EntryVacancyState,
): boolean {
  if (vacancy.vacantTicks < continuousEntryVacantTicksRequired()) return false
  return !loads.some(
    (load) =>
      !load.complete &&
      load.pathUnitIds.length > 0 &&
      load.pathUnitIds[load.stepIndex] === entryUnitId,
  )
}

export function canContinuousInjectAtEntry(
  entryUnitId: string,
  loads: PathSimulationLoad[],
  vacancy: EntryVacancyState,
  lastInjectAtTick: number,
  currentTick: number,
  injectIntervalTicks: number,
): boolean {
  if (currentTick - lastInjectAtTick < injectIntervalTicks) return false
  return isEntryPointReadyForContinuousInject(entryUnitId, loads, vacancy)
}

/** 연속 투입 — 투입점 1곳에 자재 1개 생성 (경로 없으면 null) */
export function spawnContinuousInjectLoad(
  line: ConveyorLine,
  entryUnitId: string,
  seq: number,
  destinationUnitId?: string | null,
): PathSimulationLoad | null {
  const plan = planInboundLoadPath(line, entryUnitId, destinationUnitId)
  if (plan.pathUnitIds.length === 0) return null

  const unit = line.units.find((item) => item.id === entryUnitId)
  const load = createSimulationLoad(plan, unit, 'inbound', {
    loadIdSuffix: `-ci-${seq}`,
    clearsTestMaterial: unit?.testMaterial === 1,
  })
  return {
    ...load,
    id: `${load.id}-${entryUnitId}-${seq}`,
    continuousInject: true,
    released: true,
    entryTicks: 0,
    exitTicks: 0,
    transitTicks: 0,
  }
}

/**
 * STK 출고 반송 — OUT 포트가 창고에서 받은 자재를 앞 컨베이어를 거쳐
 * 라인 흐름 종료점(flowRole=exit)까지 반송할 load 생성.
 * 경로 앞의 STK 구간은 제거 — STK→포트 핸드셰이크는 포트/창고 시뮬이 별도 표현.
 */
export function spawnOutboundDischargeLoad(
  line: ConveyorLine,
  portUnitId: string,
  seq: number,
): PathSimulationLoad | null {
  const plan = planOutboundLoadPath(line, portUnitId)
  if (plan.pathUnitIds.length === 0) return null

  const pathUnitIds = plan.targetStkId
    ? plan.pathUnitIds.filter((id) => id !== plan.targetStkId)
    : plan.pathUnitIds
  if (pathUnitIds.length === 0 || pathUnitIds[0] !== portUnitId) return null

  const unit = line.units.find((item) => item.id === portUnitId)
  const load = createSimulationLoad(
    { ...plan, entryUnitId: portUnitId, pathUnitIds, targetStkId: null },
    unit,
    'outbound',
    { loadIdSuffix: `-stkout-${seq}` },
  )
  return { ...load, id: `${load.id}-${portUnitId}-${seq}` }
}

/** 연속 투입 — 선택 투입점마다 자재 1개 생성 */
export function spawnInboundSimulationLoads(
  line: ConveyorLine,
  entryUnitIds: string[],
  seq: number,
  destinationUnitIdByEntry?: Record<string, string>,
): PathSimulationLoad[] {
  return entryUnitIds
    .map((entryUnitId) =>
      spawnContinuousInjectLoad(
        line,
        entryUnitId,
        seq,
        destinationUnitIdByEntry?.[entryUnitId],
      ),
    )
    .filter((load): load is PathSimulationLoad => load != null)
}

export function roundTackTimeSec(sec: number): number {
  if (!Number.isFinite(sec) || sec < 0) return MIN_TACK_TIME_SEC
  return Math.max(MIN_TACK_TIME_SEC, Math.round(sec * 10) / 10)
}

/** 시작점 → 출고점 예상 Tack Time (초) — 시뮬 틱 규칙과 동일 (모듈당 약 1틱) */
export function computeLoadTackTimeSec(
  pathUnitCount: number,
  timing: SimulationStepTiming,
): number {
  if (pathUnitCount <= 0) return 0

  const entryTicks = requiredDwellTicks(timing.inputIntervalSec)
  const transitTicks = requiredTransitTicks(timing.transitIntervalSec)
  const exitTicks = requiredDwellTicks(timing.dischargeIntervalSec)

  if (pathUnitCount === 1) {
    return (entryTicks + exitTicks) * SIM_TICK_SEC
  }

  const uniformTicks = Math.max(entryTicks, transitTicks, exitTicks)
  return pathUnitCount * uniformTicks * SIM_TICK_SEC
}

export function formatTackTimeSec(sec: number): string {
  const rounded = roundTackTimeSec(sec)
  if (rounded < 60) return `${Number(rounded.toFixed(1))}초`
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded - minutes * 60
  return remainder > 0
    ? `${minutes}분 ${Number(remainder.toFixed(1))}초`
    : `${minutes}분`
}

export function buildLoadTackTimeSummaries(
  line: ConveyorLine,
  loads: PathSimulationLoad[],
  timing: SimulationStepTiming,
): LoadTackTimeSummary[] {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))

  return loads
    .filter((load) => load.pathUnitIds.length > 0)
    .map((load) => {
      const exitFromTarget = load.targetExitId
        ? unitMap.get(load.targetExitId)
        : undefined
      const exitFromPath = unitMap.get(load.pathUnitIds[load.pathUnitIds.length - 1]!)
      const exitUnit = exitFromTarget ?? exitFromPath

      const estimatedTackTimeSec = computeLoadTackTimeSec(load.pathUnitIds.length, timing)

      const waypointLabels = load.pathUnitIds
        .slice(1, -1)
        .map((id) => unitMap.get(id))
        .filter((u): u is ConveyorUnit => u != null && (u.type === 'junction' || u.type === 'turn'))
        .map((u) => unitDisplayCode(u))

      return {
        loadId: load.id,
        entryUnitId: load.entryUnitId,
        label: load.label,
        exitLabel: exitUnit ? unitDisplayCode(exitUnit) : '—',
        tackTimeSec: estimatedTackTimeSec,
        estimatedTackTimeSec,
        moduleCount: load.pathUnitIds.length,
        waypointLabels,
      }
    })
}

/** 이름·code로 유닛 검색 (예: 30104) */
export function findUnitsByDisplayCode(
  line: ConveyorLine,
  code: string,
): ConveyorUnit[] {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return []
  return line.units.filter((unit) => {
    const label = unitDisplayCode(unit).toLowerCase()
    return (
      label === normalized ||
      label.includes(normalized) ||
      unit.id.toLowerCase() === normalized
    )
  })
}

/** stkOrder로 STK 찾기 (1=1번 STK, 2=2번 STK) */
export function findStkByOrder(
  line: ConveyorLine,
  stkOrder: number,
): ConveyorUnit | null {
  const matches = line.units
    .filter(isStorageUnit)
    .filter((unit) => getStkProperties(unit)?.enabled !== false)
    .filter((unit) => (getStkProperties(unit)?.stkOrder ?? 999) === stkOrder)
  return matches[0] ?? null
}

export interface InboundPathDiagnostic {
  entryUnitId: string
  entryUnitCode: string
  targetUnitId: string
  targetUnitCode: string
  directBfsReachable: boolean
  onInboundPlanPath: boolean
  planTargetStkCode: string | null
  planMessage: string
  directPathLabels: string[]
  planPathLabels: string[]
  blockers: string[]
}

function pathLabels(
  unitMap: Map<string, ConveyorUnit>,
  pathUnitIds: string[],
): string[] {
  return pathUnitIds.map((id) => unitDisplayCode(unitMap.get(id)!) || id)
}

function collectInboundStkPathBlockers(
  line: ConveyorLine,
  entryUnitId: string,
  targetStk: ConveyorUnit,
  unitMap: Map<string, ConveyorUnit>,
): string[] {
  const blockers: string[] = []
  const stkProps = getStkProperties(targetStk)
  if (stkProps?.enabled === false) {
    blockers.push(`${unitDisplayCode(targetStk)} 비활성`)
  }

  const fromEntry = bfsPath(entryUnitId, targetStk.id, unitMap, {
    forSimulationPlan: true,
    allowIdleTransit: true,
  })
  if (!fromEntry || fromEntry.length <= 1) {
    blockers.push(
      `투입점 → ${unitDisplayCode(targetStk)} 직접 BFS 경로 없음 (연결 확인)`,
    )
  }

  const otherStks = line.units.filter(
    (unit) => isStorageUnit(unit) && unit.id !== targetStk.id,
  )
  for (const other of otherStks) {
    const viaOther = bfsPath(entryUnitId, targetStk.id, unitMap, {
      forSimulationPlan: true,
      allowIdleTransit: true,
    })
    if (viaOther?.includes(other.id)) {
      blockers.push(
        `경로가 다른 STK(${unitDisplayCode(other)}) 칸을 통과해야 함 — 시뮬은 STK 경유 불가`,
      )
      break
    }
  }

  return blockers
}

/** 투입점 → 목표 모듈(또는 STK) 경로 진단 */
export function diagnoseInboundPathToUnit(
  line: ConveyorLine,
  entryUnitId: string,
  targetUnitId: string,
): InboundPathDiagnostic {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const entry = unitMap.get(entryUnitId)
  const target = unitMap.get(targetUnitId)
  const blockers: string[] = []

  if (!entry) blockers.push('투입점을 찾을 수 없습니다.')
  if (!target) blockers.push('목표 모듈을 찾을 수 없습니다.')

  const direct =
    entry && target
      ? bfsPath(entryUnitId, targetUnitId, unitMap, {
          forSimulationPlan: true,
          allowIdleTransit: true,
        })
      : null

  if (entry && target && (!direct || direct.length <= 1)) {
    blockers.push('투입점→목표 직접 연결 경로 없음')
    if (isPortUnit(target) && target.status !== 'running') {
      blockers.push(`${unitDisplayCode(target)} 포트 비가동`)
    }
  }

  const plan = planInboundLoadPath(line, entryUnitId)
  const onInboundPlanPath = plan.pathUnitIds.includes(targetUnitId)
  if (!onInboundPlanPath) {
    blockers.push('투입 시뮬 계획 경로에 목표 모듈이 포함되지 않음')
  }

  if (target && isStorageUnit(target)) {
    blockers.push(...collectInboundStkPathBlockers(line, entryUnitId, target, unitMap))
  }

  const planStk = plan.targetStkId ? unitMap.get(plan.targetStkId) : null

  return {
    entryUnitId,
    entryUnitCode: entry ? unitDisplayCode(entry) : entryUnitId,
    targetUnitId,
    targetUnitCode: target ? unitDisplayCode(target) : targetUnitId,
    directBfsReachable: Boolean(direct && direct.length > 1),
    onInboundPlanPath,
    planTargetStkCode: planStk ? unitDisplayCode(planStk) : null,
    planMessage: plan.message,
    directPathLabels: direct ? pathLabels(unitMap, direct) : [],
    planPathLabels: pathLabels(unitMap, plan.pathUnitIds),
    blockers,
  }
}

/** N번 STK(stkOrder) 경로 진단 */
export function diagnoseInboundPathToStkOrder(
  line: ConveyorLine,
  entryUnitId: string,
  stkOrder: number,
): InboundPathDiagnostic & { matchedByName: ConveyorUnit[] } {
  const stk = findStkByOrder(line, stkOrder)
  const matchedByName = findUnitsByDisplayCode(line, String(stkOrder))
  if (!stk) {
    return {
      entryUnitId,
      entryUnitCode: '',
      targetUnitId: '',
      targetUnitCode: `stkOrder=${stkOrder}`,
      directBfsReachable: false,
      onInboundPlanPath: false,
      planTargetStkCode: null,
      planMessage: '',
      directPathLabels: [],
      planPathLabels: [],
      blockers: [`stkOrder=${stkOrder} 인 STK 없음`],
      matchedByName,
    }
  }
  return {
    ...diagnoseInboundPathToUnit(line, entryUnitId, stk.id),
    matchedByName,
  }
}
