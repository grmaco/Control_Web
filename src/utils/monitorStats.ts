import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import { countCvUnits, countLineMaterialUnits } from './unitMaterial'

export interface LineMonitorStats {
  totalUnits: number
  runUnits: number
  idleUnits: number
  manualUnits: number
  errorUnits: number
  onCstUnits: number
  /** V3 런타임 데이터가 연결된 유닛 수 */
  linkedUnits: number
  bufferUtilization: number
}

export function computeLineStats(
  line: ConveyorLine,
  unitRuntime: Record<string, SemiCnvUnitRuntime> = {},
): LineMonitorStats {
  const units = line.units
  const totalUnits = units.length

  let runUnits = 0
  let idleUnits = 0
  let manualUnits = 0
  let errorUnits = 0
  let linkedUnits = 0

  for (const u of units) {
    const rt = unitRuntime[u.id]

    if (rt) {
      // V3 실시간 데이터 기준
      linkedUnits++
      if (rt.alarm) {
        errorUnits++
      } else if (rt.operationStatus === 'Manual') {
        manualUnits++
      } else if (rt.runStatus === 'Run') {
        runUnits++
      } else {
        idleUnits++
      }
    } else {
      // V3 미연결 — 빌더 설정값 폴백
      if (u.status === 'running') runUnits++
      else if (u.status === 'maintenance') manualUnits++
      else if (u.status === 'error') errorUnits++
      else idleUnits++
    }
  }

  const onCstUnits = countLineMaterialUnits(line, unitRuntime)
  const cvUnitCount = countCvUnits(line)
  const bufferUtilization =
    cvUnitCount === 0 ? 0 : Math.round((onCstUnits / cvUnitCount) * 100)

  return {
    totalUnits,
    runUnits,
    idleUnits,
    manualUnits,
    errorUnits,
    onCstUnits,
    linkedUnits,
    bufferUtilization,
  }
}

export type CurrentStatusMode = 'Auto Run' | 'Cycle Mode' | 'Manual Mode' | 'Error' | 'Standby'

export function resolveCurrentStatus(
  stats: LineMonitorStats,
  autoRun: boolean,
  powerOn: boolean,
): CurrentStatusMode {
  if (stats.errorUnits > 0) return 'Error'
  if (!powerOn || stats.totalUnits === 0) return 'Standby'
  if (autoRun && stats.runUnits > 0) return 'Auto Run'
  if (stats.manualUnits > 0) return 'Manual Mode'
  if (autoRun) return 'Cycle Mode'
  return 'Standby'
}

export function isSafetyOk(
  etherCatConnected: boolean,
  stats: LineMonitorStats,
): boolean {
  return etherCatConnected && stats.errorUnits === 0
}

export function isAutoEnabled(
  safetyOk: boolean,
  powerOn: boolean,
  stats: LineMonitorStats,
): boolean {
  return safetyOk && powerOn && stats.totalUnits > 0
}

export function flowModeLabel(autoRun: boolean, powerOn: boolean): string {
  if (!powerOn) return 'Power Off'
  return autoRun ? 'Auto' : 'Manual'
}

export function countPoweredUnits(units: ConveyorUnit[], powerOn: boolean): number {
  if (!powerOn) return 0
  return units.filter((u) => u.status !== 'idle').length
}
