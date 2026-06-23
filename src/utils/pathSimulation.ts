import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type {
  MultiPathSimulationPlan,
  PathSimulationDirection,
  PathSimulationLoad,
  PathSimulationPlan,
} from '../types/unitProperties'
import { isStorageUnit } from '../constants/conveyorTypes'
import { getEntryUnits, getExitUnits, isFlowCapableUnit } from './flowEntries'
import { computeFlowOrder } from './sequentialNaming'
import { stkRoutingService } from '../services/StkRoutingService'
import {
  getStkProperties,
  getStkRoutingProperties,
  isStkRoutingSourceUnit,
  unitDisplayCode,
} from './unitPropertyHelpers'
import {
  buildOutboundSimulationPath,
  listOutboundPorts,
} from './outboundFlow'

/** 경로 시뮬레이션 — 경유 가능(가동) 여부. 출발·도착은 상태와 무관하게 허용 */
export function isSimulationTransitPassable(unit: ConveyorUnit): boolean {
  return unit.status === 'running'
}

export function bfsPath(
  startId: string,
  targetId: string,
  unitMap: Map<string, ConveyorUnit>,
): string[] | null {
  if (startId === targetId) return [startId]

  const canVisit = (unitId: string): boolean => {
    const unit = unitMap.get(unitId)
    if (!unit) return false
    if (unitId === startId || unitId === targetId) return true
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

function eligibleStkCandidates(
  turn: ConveyorUnit,
  allUnits: ConveyorUnit[],
): ConveyorUnit[] {
  const routingProps = getStkRoutingProperties(turn)
  const allowed = new Set(routingProps?.allowedStkIds ?? [])
  return allUnits
    .filter(isStorageUnit)
    .filter((stk) => {
      const props = getStkProperties(stk)
      return props?.enabled !== false && (allowed.size === 0 || allowed.has(stk.id))
    })
    .sort((a, b) => {
      const orderA = getStkProperties(a)?.stkOrder ?? 999
      const orderB = getStkProperties(b)?.stkOrder ?? 999
      return orderA - orderB
    })
}

function resolveStkWithPath(
  turn: ConveyorUnit,
  allUnits: ConveyorUnit[],
  unitMap: Map<string, ConveyorUnit>,
): { stk: ConveyorUnit; tail: string[] } | null {
  const primary = stkRoutingService.resolveTargetStk(turn, allUnits)
  const candidates = eligibleStkCandidates(turn, allUnits)
  const ordered = primary
    ? [primary, ...candidates.filter((stk) => stk.id !== primary.id)]
    : candidates

  for (const stk of ordered) {
    const tail = bfsPath(turn.id, stk.id, unitMap)
    if (tail && tail.length > 0) {
      return { stk, tail }
    }
  }
  return null
}

/** 출고점 후보 — flowRole=exit, 없으면 투입점 기준 물류 순서 꼬리 */
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
    return unit != null && isFlowCapableUnit(unit)
  })
  const last = connectedFlowIds[connectedFlowIds.length - 1]
  return last ? [last] : []
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
    const path = bfsPath(entryUnitId, exitId, unitMap)
    if (path && path.length > 1) {
      const exit = unitMap.get(exitId)!
      return {
        pathUnitIds: path,
        exitId,
        message: `${unitDisplayCode(entry)} → … → ${unitDisplayCode(exit)} (${path.length}구간 · 투입→출고)`,
      }
    }
  }

  const { orderedUnitIds } = computeFlowOrder(line, entryUnitId)
  if (orderedUnitIds.length > 1) {
    const lastId = orderedUnitIds[orderedUnitIds.length - 1]!
    const exit = unitMap.get(lastId)!
    return {
      pathUnitIds: orderedUnitIds,
      exitId: lastId,
      message: `${unitDisplayCode(entry)} → … → ${unitDisplayCode(exit)} (${orderedUnitIds.length}구간 · 물류순서)`,
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
    const path = bfsPath(entryId, stk.id, unitMap)
    if (path && path.length > 1) return path
  }

  return [entryId]
}

/** 투입점 → (메인 라인) → STK 분기 회전 → 목적 STK */
export function planInboundLoadPath(
  line: ConveyorLine,
  entryUnitId: string,
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

  const { orderedUnitIds } = computeFlowOrder(line, entryUnitId)
  const orderPos = new Map(orderedUnitIds.map((id, index) => [id, index]))

  const routingTurns = line.units
    .filter(isStkRoutingSourceUnit)
    .filter((turn) => isSimulationTransitPassable(turn))
    .sort((a, b) => {
      const posDiff = (orderPos.get(a.id) ?? 9999) - (orderPos.get(b.id) ?? 9999)
      if (posDiff !== 0) return posDiff
      return (a.stkRouting?.priority ?? 999) - (b.stkRouting?.priority ?? 999)
    })

  for (const turn of routingTurns) {
    const head = bfsPath(entryUnitId, turn.id, unitMap)
    if (!head || head.length === 0) continue

    const resolved = resolveStkWithPath(turn, line.units, unitMap)
    if (!resolved) continue

    const { stk, tail } = resolved
    const pathUnitIds =
      tail.length > 0 ? [...head, ...tail.slice(1)] : [...head, stk.id]

    const policy = getStkRoutingProperties(turn)?.targetStkPolicy ?? 'MANUAL_ORDER'
    const primary = stkRoutingService.resolveTargetStk(turn, line.units)
    const altStkNote =
      primary && primary.id !== stk.id ? ' · 대체 STK' : ''

    return {
      entryUnitId,
      routingUnitId: turn.id,
      targetStkId: stk.id,
      pathUnitIds,
      message: `${unitDisplayCode(entry)} → ${unitDisplayCode(turn)} → ${unitDisplayCode(stk)} (${policy})${altStkNote}`,
    }
  }

  if (!lineHasEnabledStk(line)) {
    const exitPlan = buildEntryToExitPath(entryUnitId, line, unitMap)
    return {
      entryUnitId,
      routingUnitId: null,
      targetStkId: null,
      targetExitId: exitPlan.exitId,
      pathUnitIds: exitPlan.pathUnitIds,
      message: exitPlan.message,
    }
  }

  const pathUnitIds = buildFlowChain(entryUnitId, line, unitMap)
  const last = pathUnitIds[pathUnitIds.length - 1]
  const lastUnit = last ? unitMap.get(last) : null

  return {
    entryUnitId,
    routingUnitId: null,
    targetStkId: lastUnit && isStorageUnit(lastUnit) ? lastUnit.id : null,
    targetExitId: null,
    pathUnitIds,
    message:
      pathUnitIds.length > 1
        ? `${unitDisplayCode(entry)} → … (${pathUnitIds.length}구간, STK 분기 미도달 · 비가동 구간 우회)`
        : '가동 중인 모듈만으로 STK까지 연결된 경로가 없습니다.',
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

  return {
    entryUnitId: portUnitId,
    routingUnitId: null,
    targetStkId: built.stkId,
    targetExitId: built.exitId,
    pathUnitIds: built.pathUnitIds,
    message: built.message,
    direction: 'outbound',
  }
}

function createSimulationLoad(
  plan: PathSimulationPlan,
  sourceUnit: ConveyorUnit | undefined,
  direction: PathSimulationDirection,
): PathSimulationLoad {
  return {
    id: `sim-load-${direction}-${plan.entryUnitId}`,
    entryUnitId: plan.entryUnitId,
    label: sourceUnit ? unitDisplayCode(sourceUnit) : plan.entryUnitId,
    direction,
    routingUnitId: plan.routingUnitId,
    targetStkId: plan.targetStkId,
    targetExitId: plan.targetExitId ?? null,
    pathUnitIds: plan.pathUnitIds,
    stepIndex: 0,
    complete: plan.pathUnitIds.length === 0,
    waiting: false,
    message: plan.message,
  }
}

/** 선택한 투입점마다 경로를 계산 — 동시 출발용 */
export function planMultiInboundLoadPaths(
  line: ConveyorLine,
  entryUnitIds: string[],
): MultiPathSimulationPlan {
  if (entryUnitIds.length === 0) {
    return { loads: [], message: '투입점을 선택하세요.' }
  }

  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const loads = entryUnitIds.map((entryUnitId) =>
    createSimulationLoad(
      planInboundLoadPath(line, entryUnitId),
      unitMap.get(entryUnitId),
      'inbound',
    ),
  )

  const validLoads = loads.filter((load) => load.pathUnitIds.length > 0)
  const emptyCount = loads.length - validLoads.length

  const startCells = validLoads.map((load) => load.pathUnitIds[0]!)
  const duplicateStarts = startCells.some(
    (cell, index) => startCells.indexOf(cell) !== index,
  )

  let message = validLoads.map((load) => load.message).join(' · ')
  if (emptyCount > 0) {
    message = `${message}${message ? ' · ' : ''}${emptyCount}개 투입점 경로 없음`
  }
  if (duplicateStarts) {
    message = `${message}${message ? ' · ' : ''}동일 투입 칸 중복 — 동시 출발 불가`
  }

  return {
    loads: duplicateStarts ? [] : validLoads,
    message,
  }
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

  const validLoads = loads.filter((load) => load.pathUnitIds.length > 0)
  const emptyCount = loads.length - validLoads.length

  const startCells = validLoads.map((load) => load.pathUnitIds[0]!)
  const duplicateStarts = startCells.some(
    (cell, index) => startCells.indexOf(cell) !== index,
  )

  let message = validLoads.map((load) => load.message).join(' · ')
  if (emptyCount > 0) {
    message = `${message}${message ? ' · ' : ''}${emptyCount}개 포트 경로 없음`
  }
  if (duplicateStarts) {
    message = `${message}${message ? ' · ' : ''}동일 출발 칸 중복 — 동시 출발 불가`
  }

  return {
    loads: duplicateStarts ? [] : validLoads,
    message,
  }
}

function isAtDestination(load: PathSimulationLoad): boolean {
  return load.pathUnitIds.length > 0 && load.stepIndex >= load.pathUnitIds.length - 1
}

/** 한 틱 진행 — 목적지 겹침·정면 충돌·비가동 모듈 시 해당 자재만 대기 */
export function advanceSimulationLoads(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
): PathSimulationLoad[] {
  const next = loads.map((load) => ({
    ...load,
    waiting: false,
    complete: isAtDestination(load) ? true : load.complete,
  }))

  const proposals = new Map<number, number>()
  for (let i = 0; i < next.length; i += 1) {
    const load = next[i]!
    if (load.complete || isAtDestination(load)) continue
    if (load.stepIndex < load.pathUnitIds.length - 1) {
      proposals.set(i, load.stepIndex + 1)
    }
  }

  const posAt = (index: number, step: number) => next[index]!.pathUnitIds[step]!
  const approved = new Set<number>()

  for (const [index, targetStep] of proposals) {
    const from = posAt(index, next[index]!.stepIndex)
    const to = posAt(index, targetStep)
    if (from === to) continue

    let blocked = false

    for (const [otherIndex, otherTargetStep] of proposals) {
      if (otherIndex === index) continue
      if (posAt(otherIndex, otherTargetStep) === to) {
        blocked = true
        break
      }
    }
    if (blocked) {
      next[index]!.waiting = true
      continue
    }

    for (let otherIndex = 0; otherIndex < next.length; otherIndex += 1) {
      if (otherIndex === index) continue
      const otherCurrent = posAt(otherIndex, next[otherIndex]!.stepIndex)
      if (otherCurrent !== to) continue

      const otherTargetStep = proposals.get(otherIndex)
      const otherLeaving =
        otherTargetStep != null &&
        posAt(otherIndex, otherTargetStep) !== otherCurrent
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
      const destinationId = next[index]!.pathUnitIds[next[index]!.pathUnitIds.length - 1]
      const isDestination = to === destinationId
      if (
        targetUnit &&
        !isDestination &&
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
    if (isAtDestination(next[index]!)) {
      next[index]!.complete = true
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

export function activeSimulationUnitIds(loads: PathSimulationLoad[]): string[] {
  return loads
    .filter((load) => !load.complete && load.pathUnitIds.length > 0)
    .map((load) => load.pathUnitIds[load.stepIndex]!)
    .filter(Boolean)
}
