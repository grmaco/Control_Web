import type { ConveyorLine } from '../types/conveyor'
import type { RoutingSimulationResult } from '../types/unitProperties'
import { stkRoutingService } from '../services/StkRoutingService'
import { bfsPath } from './pathSimulation'
import {
  computeStkLoadRate,
  getStkRoutingProperties,
  isStkRoutingSourceUnit,
  unitDisplayCode,
} from './unitPropertyHelpers'

export function simulateStkRouting(line: ConveyorLine, sourceUnitId: string): RoutingSimulationResult {
  const unitMap = new Map(line.units.map((unit) => [unit.id, unit]))
  const source = unitMap.get(sourceUnitId)
  if (!source || !isStkRoutingSourceUnit(source)) {
    return {
      sourceUnitId,
      targetStkId: null,
      pathUnitIds: [],
      message: '회전/분기 유닛에서 STK 분기가 활성화되어 있어야 합니다.',
    }
  }

  const routingProps = getStkRoutingProperties(source)
  const target = stkRoutingService.resolveTargetStk(source, line.units)
  if (!target) {
    return {
      sourceUnitId,
      targetStkId: null,
      pathUnitIds: [sourceUnitId],
      message: '라우팅 가능한 STK가 없습니다.',
    }
  }

  const path = bfsPath(sourceUnitId, target.id, unitMap) ?? [sourceUnitId, target.id]
  const loadRate = computeStkLoadRate(target)
  const policy = routingProps?.targetStkPolicy ?? 'MANUAL_ORDER'

  return {
    sourceUnitId,
    targetStkId: target.id,
    pathUnitIds: path,
    message: `${unitDisplayCode(source)} → ${unitDisplayCode(target)} (${policy}, 적재율 ${loadRate}%)`,
  }
}

export function isCellInRoutingPath(
  unitId: string,
  simulation: RoutingSimulationResult | null,
): boolean {
  if (!simulation) return false
  return simulation.pathUnitIds.includes(unitId)
}

export function routingTooltipForUnit(
  unitId: string,
  simulation: RoutingSimulationResult | null,
): string | null {
  if (!simulation || !simulation.pathUnitIds.includes(unitId)) return null
  if (unitId === simulation.sourceUnitId) return simulation.message
  const unitMapIndex = simulation.pathUnitIds.indexOf(unitId)
  if (unitMapIndex < 0) return null
  return `경로 ${unitMapIndex + 1}/${simulation.pathUnitIds.length}`
}
