import type { ConveyorUnit } from '../types/conveyor'
import type { StkPolicy } from '../types/unitProperties'
import {
  computeStkLoadRate,
  getStkProperties,
  getStkRoutingProperties,
} from '../utils/unitPropertyHelpers'
import { isStorageUnit } from '../constants/conveyorTypes'

export class StkRoutingService {
  resolveTargetStk(
    routingUnit: ConveyorUnit,
    allUnits: ConveyorUnit[],
    policy?: StkPolicy,
    lastStkId?: string,
  ): ConveyorUnit | null {
    const routingProps = getStkRoutingProperties(routingUnit)
    if (!routingProps?.enabled) return null

    const activePolicy = policy ?? routingProps.targetStkPolicy
    const allowed = new Set(routingProps.allowedStkIds)
    const stks = allUnits
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

    if (stks.length === 0) return null

    switch (activePolicy) {
      case 'MANUAL_ORDER':
        return this.resolveByManualOrder(stks)
      case 'LOAD_RATE_FIRST':
        return this.resolveByLoadRateFirst(stks)
      case 'LOAD_RATE_LAST':
        return this.resolveByLoadRateLast(stks)
      case 'ROUND_ROBIN':
        return this.resolveByRoundRobin(stks, lastStkId)
      default:
        return stks[0] ?? null
    }
  }

  private resolveByManualOrder(stks: ConveyorUnit[]): ConveyorUnit | null {
    return stks[0] ?? null
  }

  private resolveByLoadRateFirst(stks: ConveyorUnit[]): ConveyorUnit | null {
    return [...stks].sort(
      (a, b) => computeStkLoadRate(a) - computeStkLoadRate(b),
    )[0] ?? null
  }

  private resolveByLoadRateLast(stks: ConveyorUnit[]): ConveyorUnit | null {
    return [...stks].sort(
      (a, b) => computeStkLoadRate(b) - computeStkLoadRate(a),
    )[0] ?? null
  }

  private resolveByRoundRobin(
    stks: ConveyorUnit[],
    lastStkId?: string,
  ): ConveyorUnit | null {
    if (!lastStkId) return stks[0] ?? null
    const index = stks.findIndex((stk) => stk.id === lastStkId)
    if (index < 0) return stks[0] ?? null
    return stks[(index + 1) % stks.length] ?? null
  }
}

export const stkRoutingService = new StkRoutingService()
