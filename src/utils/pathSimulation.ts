import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type {
  MultiPathSimulationPlan,
  PathSimulationDirection,
  PathSimulationLoad,
  PathSimulationPlan,
} from '../types/unitProperties'
import { PATH_SIMULATION_STEP_MS } from '../types/unitProperties'
import { isStorageUnit } from '../constants/conveyorTypes'
import { getEntryUnits, getExitUnits, isFlowCapableUnit } from './flowEntries'
import { computeMinimapFlowMap, type UnitFlowDirs } from './flowDirection'
import { computeFlowOrder } from './sequentialNaming'
import { isCvUnit } from './unitMaterial'
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
    const pathUnitIds = finalizeSimulationPath(
      line,
      tail.length > 0 ? [...head, ...tail.slice(1)] : [...head, stk.id],
    )

    const policy = getStkRoutingProperties(turn)?.targetStkPolicy ?? 'MANUAL_ORDER'
    const primary = stkRoutingService.resolveTargetStk(turn, line.units)
    const altStkNote =
      primary && primary.id !== stk.id ? ' · 대체 STK' : ''

    return {
      entryUnitId,
      routingUnitId: turn.id,
      targetStkId: stk.id,
      targetExitId: resolvePathExitId(line, pathUnitIds),
      pathUnitIds,
      message: `${unitDisplayCode(entry)} → ${unitDisplayCode(turn)} → ${unitDisplayCode(stk)} (${policy})${altStkNote}`,
    }
  }

  if (!lineHasEnabledStk(line)) {
    const exitPlan = buildEntryToExitPath(entryUnitId, line, unitMap)
    const pathUnitIds = finalizeSimulationPath(line, exitPlan.pathUnitIds)
    return {
      entryUnitId,
      routingUnitId: null,
      targetStkId: null,
      targetExitId: exitPlan.exitId ?? resolvePathExitId(line, pathUnitIds),
      pathUnitIds,
      message: exitPlan.message,
    }
  }

  const pathUnitIds = finalizeSimulationPath(line, buildFlowChain(entryUnitId, line, unitMap))
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
    stepIndex: 0,
    complete: plan.pathUnitIds.length === 0,
    waiting: false,
    message: plan.message,
    clearsTestMaterial: options?.clearsTestMaterial ?? false,
    released: true,
    entryTicks: 0,
    exitTicks: 0,
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
  const pathUnitIds = finalizeSimulationPath(line, exitPlan.pathUnitIds)

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
): PathSimulationLoad {
  const unit = unitMap.get(entryUnitId)
  return createSimulationLoad(
    planInboundLoadPath(line, entryUnitId),
    unit,
    'inbound',
  )
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
    createSimulationLoadInbound(line, entryUnitId, unitMap),
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

/** 투입·테스트 자재 동시 출발 */
export function initializeParallelLoads(
  loads: PathSimulationLoad[],
): PathSimulationLoad[] {
  return dedupeSimulationLoadsById(loads).map((load) => ({
    ...load,
    pathUnitIds: [...load.pathUnitIds],
    released: true,
    entryTicks: 0,
    exitTicks: 0,
  }))
}

export interface SimulationStepTiming {
  inputIntervalSec: number
  dischargeIntervalSec: number
}

const SIM_TRANSIT_STEP_SEC = PATH_SIMULATION_STEP_MS / 1000

/** 시작·종료점 체류 틱 (중간 이동은 SIM_TRANSIT_STEP_SEC 고정) */
function requiredDwellTicks(intervalSec: number): number {
  return Math.max(1, Math.ceil(Math.max(0.1, intervalSec) / SIM_TRANSIT_STEP_SEC))
}

export function applySimulationStep(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
  timing?: SimulationStepTiming,
): PathSimulationLoad[] {
  return advanceSimulationLoads(loads, unitMap, timing)
}

export function countIncompleteSimulationLoads(loads: PathSimulationLoad[]): number {
  return loads.filter((load) => load.pathUnitIds.length > 0 && !isLoadFullyDischarged(load)).length
}

/** 자재가 경로 끝(출고)까지 도달·출고 완료 */
export function isLoadFullyDischarged(load: PathSimulationLoad): boolean {
  if (!load.complete || load.pathUnitIds.length === 0) return false
  return load.stepIndex >= load.pathUnitIds.length - 1
}

/** 라인에 계획된 모든 자재가 출고 완료됐는지 */
export function areAllSimulationLoadsFinished(loads: PathSimulationLoad[]): boolean {
  const active = loads.filter((load) => load.pathUnitIds.length > 0)
  return active.length > 0 && active.every((load) => isLoadFullyDischarged(load))
}

/** 한 틱 진행 — 앞(다음) 모듈에 자재 없을 때만 전진, 겹침·비가동 시 대기 */
export function advanceSimulationLoads(
  loads: PathSimulationLoad[],
  unitMap?: Map<string, ConveyorUnit>,
  timing: SimulationStepTiming = {
    inputIntervalSec: 0.5,
    dischargeIntervalSec: 0.5,
  },
): PathSimulationLoad[] {
  const entryTicksRequired = requiredDwellTicks(timing.inputIntervalSec)
  const exitTicksRequired = requiredDwellTicks(timing.dischargeIntervalSec)

  const next = dedupeSimulationLoadsById(loads).map((load) => ({
    ...load,
    waiting: false,
    entryTicks: load.entryTicks ?? 0,
    exitTicks: load.exitTicks ?? 0,
  }))

  for (let i = 0; i < next.length; i += 1) {
    const load = next[i]!
    if (!load.released || load.complete) continue

    if (isAtDestination(load)) {
      if (load.stepIndex === 0 && load.entryTicks < entryTicksRequired) {
        load.entryTicks += 1
        load.waiting = load.entryTicks < entryTicksRequired
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

    if (load.stepIndex === 0) {
      load.entryTicks += 1
    }
  }

  const proposals = new Map<number, number>()
  for (let i = 0; i < next.length; i += 1) {
    const load = next[i]!
    if (!load.released || load.complete || isAtDestination(load)) continue
    if (load.stepIndex === 0 && load.entryTicks < entryTicksRequired) {
      load.waiting = true
      continue
    }
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
      const other = next[otherIndex]!
      if (!other.released || other.complete) continue
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

export function activeSimulationUnitIds(loads: PathSimulationLoad[]): string[] {
  return dedupeSimulationLoadsById(loads)
    .filter((load) => load.released && !load.complete && load.pathUnitIds.length > 0)
    .map((load) => load.pathUnitIds[load.stepIndex]!)
    .filter(Boolean)
}

/** CST On 표시 — 진행 중 자재 위치 (종료점 도착·출고 완료 제외 가능) */
export function simulationCstUnitIds(
  loads: PathSimulationLoad[],
  options?: { includeCompleted?: boolean },
): string[] {
  const includeCompleted = options?.includeCompleted ?? true
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const load of dedupeSimulationLoadsById(loads)) {
    if (!load.released || load.pathUnitIds.length === 0) continue
    if (!includeCompleted && load.complete) continue
    const unitId = load.pathUnitIds[load.stepIndex]
    if (!unitId || seen.has(unitId)) continue
    seen.add(unitId)
    ordered.push(unitId)
  }
  return ordered
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
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const load of loads) {
    const step = revealSteps[load.id] ?? 0
    for (let i = 0; i <= step && i < load.pathUnitIds.length; i += 1) {
      const unitId = load.pathUnitIds[i]!
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
