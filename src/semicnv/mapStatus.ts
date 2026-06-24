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
  if (item.operationStatus === 'Manual') return 'maintenance'
  if (item.power === 'Off') return 'idle'
  // Auto 모드이면 모터 구동 여부와 무관하게 running으로 표시
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
      cstId: item.cstId,
      destination: item.destination,
      alarm: item.alarm,
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
