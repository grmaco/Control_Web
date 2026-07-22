import type { ConveyorStatus } from '../types/conveyor'
import type {
  SemiCnvConveyorStatusItem,
  SemiCnvOperationStatus,
  SemiCnvRunStatus,
  SemiCnvAutoStatus,
} from '../types/semicnv'

/** Semi C/V 상태 → Web 관제 ConveyorStatus 매핑 */
export function mapSemiCnvToConveyorStatus(item: {
  alarm: boolean
  operationStatus: SemiCnvOperationStatus
  runStatus: SemiCnvRunStatus
  autoStatus: SemiCnvAutoStatus
  power: string
}): ConveyorStatus {
  if (item.alarm) return 'error'
  if (item.power === 'Off') return 'idle'
  // 이하 Power On 상태
  if (item.operationStatus === 'Manual') return 'maintenance'
  if (item.operationStatus === 'Auto') return 'running'
  return 'idle'
}

export function toUnitRuntime(item: SemiCnvConveyorStatusItem): {
  status: ConveyorStatus
  runtime: import('../types/semicnv').SemiCnvUnitRuntime
} {
  const updatedAt = new Date().toISOString()
  const status = mapSemiCnvToConveyorStatus(item)
  return {
    status,
    runtime: {
      semiCnvId: item.id,
      semiCnvLineId: item.lineId,
      autoStep: item.autoStep,
      autoStatus: item.autoStatus,
      runStatus: item.runStatus,
      operationStatus: item.operationStatus,
      power: item.power,
      cstId: item.cstId,
      destination: item.destination,
      alarm: item.alarm,
      alarmCode: item.alarmCode ?? null,
      alarmMessage: item.alarmMessage ?? null,
      homeDone: item.axis?.homeDone ?? null,
      currentDegree: item.currentDegree ?? null,
      sensors: item.sensors,
      updatedAt,
    },
  }
}

export function mapSemiCnvAlarmLevel(
  level: string,
): 'Info' | 'Light' | 'Warn' | 'Heavy' | 'Error' {
  switch (level) {
    case 'Error':
      return 'Error'
    case 'Warning':
      return 'Warn'
    default:
      return 'Info'
  }
}
