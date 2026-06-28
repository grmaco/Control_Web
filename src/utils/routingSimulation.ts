import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { RoutingSimulationResult } from '../types/unitProperties'
import { STK_POLICY_LABELS } from '../constants/unitRoles'
import { stkRoutingService } from '../services/StkRoutingService'
import { bfsPath, listEligibleStkCandidates } from './pathSimulation'
import {
  computeStkLoadRate,
  getStkRoutingProperties,
  isStkRoutingSourceUnit,
  unitDisplayCode,
} from './unitPropertyHelpers'

export interface SimulateStkRoutingOptions {
  /** 빌더 — 버튼 클릭 횟수(0부터). 라운드 로빈 순환에 사용 */
  pressIndex?: number
}

export function simulateStkRouting(
  line: ConveyorLine,
  sourceUnitId: string,
  options: SimulateStkRoutingOptions = {},
): RoutingSimulationResult {
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
  const policy = routingProps?.targetStkPolicy ?? 'MANUAL_ORDER'
  const candidates = listEligibleStkCandidates(source, line.units)

  let target: ConveyorUnit | null = null
  let roundRobinNote = ''

  if (candidates.length === 0) {
    return {
      sourceUnitId,
      targetStkId: null,
      pathUnitIds: [sourceUnitId],
      message: '허용 STK를 1개 이상 선택하세요.',
    }
  }

  if (policy === 'ROUND_ROBIN') {
    if (candidates.length < 2) {
      target = candidates[0] ?? null
      roundRobinNote = ' · 허용 STK 1개 — 순환하려면 2개 이상 체크'
    } else {
      const pressIndex = options.pressIndex ?? 0
      const slot = pressIndex % candidates.length
      target = candidates[slot] ?? null
      roundRobinNote = ` · ${pressIndex + 1}회차 (${slot + 1}/${candidates.length})`
    }
  } else {
    target = stkRoutingService.resolveTargetStk(source, line.units)
  }

  if (!target) {
    return {
      sourceUnitId,
      targetStkId: null,
      pathUnitIds: [sourceUnitId],
      message: '라우팅 가능한 STK가 없습니다.',
    }
  }

  const path =
    bfsPath(sourceUnitId, target.id, unitMap, {
      forSimulationPlan: true,
      allowIdleTransit: true,
    }) ??
    bfsPath(sourceUnitId, target.id, unitMap, { allowIdleTransit: true }) ??
    [sourceUnitId, target.id]

  const loadRate = computeStkLoadRate(target)
  const policyLabel = STK_POLICY_LABELS[policy]

  return {
    sourceUnitId,
    targetStkId: target.id,
    pathUnitIds: path,
    message: `${unitDisplayCode(source)} → ${unitDisplayCode(target)} (${policyLabel}, 적재율 ${loadRate}%)${roundRobinNote}`,
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
