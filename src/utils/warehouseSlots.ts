import type { ConveyorLine } from '../types/conveyor'
import { isStorageUnit } from '../constants/conveyorTypes'
import type { PathSimulationLoad } from '../types/unitProperties'
import { planInboundLoadPath } from './pathSimulation'
import { getStkProperties } from './unitPropertyHelpers'

export const WAREHOUSE_SLOT_CAPACITY = 48

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
): string | null {
  const plan = planInboundLoadPath(line, entryUnitId)
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

/** STK 도착(첫 진입)한 투입 자재 — load별 targetStkId 기준 */
export function detectWarehouseDeposits(
  prevLoads: PathSimulationLoad[],
  nextLoads: PathSimulationLoad[],
  alreadyCounted: ReadonlySet<string>,
): Array<{ loadId: string; stkId: string }> {
  const deposited: Array<{ loadId: string; stkId: string }> = []
  for (const next of nextLoads) {
    if (alreadyCounted.has(next.id)) continue
    const stkId = next.targetStkId
    if (!stkId) continue

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
