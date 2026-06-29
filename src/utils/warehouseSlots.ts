import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import { isPortUnit, isStorageUnit } from '../constants/conveyorTypes'
import type { PathSimulationLoad } from '../types/unitProperties'
import { SIM_STK_IO_ENABLED } from '../constants/simStkIo'
import { planInboundLoadPath, type StkRoutingSessionState } from './pathSimulation'
import { getPortProperties, getStkProperties } from './unitPropertyHelpers'
import { isCvUnit } from './unitMaterial'

export const WAREHOUSE_SLOT_CAPACITY = 48

/** 연속 투입 — STK를 만재(48칸)로 두고 라인 백업·만재 시뮬 */
export function createFullStkFillCounts(line: ConveyorLine): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const unit of line.units) {
    if (!isStorageUnit(unit)) continue
    if (getStkProperties(unit)?.enabled === false) continue
    counts[unit.id] = WAREHOUSE_SLOT_CAPACITY
  }
  return counts
}

export function isStkAtCapacity(
  stkId: string,
  fillCounts: Record<string, number>,
): boolean {
  return (fillCounts[stkId] ?? 0) >= WAREHOUSE_SLOT_CAPACITY
}

/** STK 셀 내 48슬롯 그리드 (4랙 × 3선반 × 2슬롯 × 상하 2열) */
export const WAREHOUSE_SLOT_COLS = 8
export const WAREHOUSE_SLOT_ROWS = 6

export function warehouseSlotIndex(row: number, col: number): number {
  return row * WAREHOUSE_SLOT_COLS + col
}

/** 투입 경로상 연결 STK (없으면 null) */
export function resolveInboundStorageTarget(
  line: ConveyorLine,
  entryUnitId: string,
  routingSession?: StkRoutingSessionState,
): string | null {
  const plan = planInboundLoadPath(line, entryUnitId, routingSession)
  if (plan.targetStkId) return plan.targetStkId

  const lastId = plan.pathUnitIds[plan.pathUnitIds.length - 1]
  if (!lastId) return null
  const last = line.units.find((unit) => unit.id === lastId)
  return last && isStorageUnit(last) ? last.id : null
}

/** 활성 STK 중 적재 여유가 하나라도 있으면 true */
export function anyInboundStkHasCapacity(
  line: ConveyorLine,
  fillCounts: Record<string, number>,
): boolean {
  return line.units.some(
    (unit) =>
      isStorageUnit(unit) &&
      getStkProperties(unit)?.enabled !== false &&
      (fillCounts[unit.id] ?? 0) < WAREHOUSE_SLOT_CAPACITY,
  )
}

function addMaterialUnitsFromPath(
  ids: Set<string>,
  pathUnitIds: string[],
  unitMap: Map<string, ConveyorUnit>,
): void {
  for (const unitId of pathUnitIds) {
    const unit = unitMap.get(unitId)
    if (!unit) continue
    if (isPortUnit(unit) || isCvUnit(unit) || isStorageUnit(unit)) {
      ids.add(unitId)
    }
  }
}

function isActiveInboundSimulationLoad(load: PathSimulationLoad): boolean {
  if (load.complete || load.pathUnitIds.length === 0) return false
  return load.direction === 'inbound' || load.continuousInject === true
}

function findLinkedInputPort(
  line: ConveyorLine,
  entryUnitId: string,
): ConveyorUnit | null {
  for (const unit of line.units) {
    if (!isPortUnit(unit)) continue
    if (unit.role !== 'INPUT' && unit.role !== 'PORT_IN') continue
    const props = getPortProperties(unit)
    if (props?.linkedUnitId === entryUnitId) {
      return unit
    }
  }
  return null
}

function addLinkedInputPorts(
  line: ConveyorLine,
  entryUnitIds: string[],
  ids: Set<string>,
): void {
  for (const entryUnitId of entryUnitIds) {
    const port = findLinkedInputPort(line, entryUnitId)
    if (port) ids.add(port.id)
  }
}

/**
 * 투입 경로상 자재가 올라갈 수 있는 모듈(포트·CV·STK).
 * 연속 투입 중에는 실제 load 경로 합집합만 사용 — 정적 plan과 세션 불일치로 만재 판정이 깨지는 것 방지.
 */
export function collectInboundLineMaterialUnitIds(
  line: ConveyorLine,
  entryUnitIds: string[],
  activeLoads?: PathSimulationLoad[],
  routingSession?: StkRoutingSessionState,
): Set<string> {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const ids = new Set<string>()

  const runningLoads =
    activeLoads?.filter((load) => isActiveInboundSimulationLoad(load)) ?? []

  if (runningLoads.length > 0) {
    for (const load of runningLoads) {
      addMaterialUnitsFromPath(ids, load.pathUnitIds, unitMap)
    }
    addLinkedInputPorts(line, entryUnitIds, ids)
    return ids
  }

  for (const entryUnitId of entryUnitIds) {
    const plan = planInboundLoadPath(line, entryUnitId, routingSession)
    addMaterialUnitsFromPath(ids, plan.pathUnitIds, unitMap)
  }
  addLinkedInputPorts(line, entryUnitIds, ids)
  return ids
}

function loadOccupiesUnit(load: PathSimulationLoad, unitId: string): boolean {
  if (load.complete || load.pathUnitIds.length === 0) return false
  const step = Math.min(
    Math.max(0, load.stepIndex),
    load.pathUnitIds.length - 1,
  )
  return load.pathUnitIds[step] === unitId
}

function isUnitOccupiedByActiveLoad(
  loads: PathSimulationLoad[],
  unitId: string,
  line?: ConveyorLine,
): boolean {
  if (loads.some((load) => loadOccupiesUnit(load, unitId))) {
    return true
  }

  if (!line) return false
  const unit = line.units.find((item) => item.id === unitId)
  if (!unit || !isPortUnit(unit)) return false

  const linkedEntryId = getPortProperties(unit)?.linkedUnitId
  if (!linkedEntryId) return false

  return loads.some(
    (load) =>
      loadOccupiesUnit(load, linkedEntryId) &&
      (load.direction === 'inbound' || load.continuousInject === true),
  )
}

/** 포트·컨베이어·STK 경로 모듈에 자재가 모두 올라간 상태 */
export function isInboundConveyorLineFull(
  line: ConveyorLine,
  loads: PathSimulationLoad[],
  entryUnitIds: string[],
  fillCounts: Record<string, number> = {},
  routingSession?: StkRoutingSessionState,
): boolean {
  const materialUnits = collectInboundLineMaterialUnitIds(
    line,
    entryUnitIds,
    loads,
    routingSession,
  )
  if (materialUnits.size === 0) return false

  for (const unitId of materialUnits) {
    const unit = line.units.find((item) => item.id === unitId)
    if (unit && isStorageUnit(unit) && isStkAtCapacity(unitId, fillCounts)) {
      continue
    }
    if (!isUnitOccupiedByActiveLoad(loads, unitId, line)) {
      return false
    }
  }
  return true
}

/** STK 도착(첫 진입)한 투입 자재 — load별 targetStkId 기준 */
export function detectWarehouseDeposits(
  prevLoads: PathSimulationLoad[],
  nextLoads: PathSimulationLoad[],
  alreadyCounted: ReadonlySet<string>,
  fillCounts: Record<string, number> = {},
): Array<{ loadId: string; stkId: string }> {
  if (!SIM_STK_IO_ENABLED) return []

  const deposited: Array<{ loadId: string; stkId: string }> = []
  for (const next of nextLoads) {
    if (alreadyCounted.has(next.id)) continue
    const stkId = next.targetStkId
    if (!stkId) continue
    if (isStkAtCapacity(stkId, fillCounts)) continue

    const isInboundToStk =
      next.direction === 'inbound' || next.continuousInject === true
    if (!isInboundToStk) continue

    const stkIndex = next.pathUnitIds.indexOf(stkId)
    if (stkIndex < 0) continue

    const prev = prevLoads.find((load) => load.id === next.id)
    const prevIndex = prev?.stepIndex ?? 0
    if (prevIndex < stkIndex && next.stepIndex >= stkIndex) {
      deposited.push({ loadId: next.id, stkId })
    }
  }
  return deposited
}
