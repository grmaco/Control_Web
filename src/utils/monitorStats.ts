import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { SemiCnvLineRuntime, SemiCnvUnitRuntime } from '../types/semicnv'
import { countCvUnits, countLineMaterialUnits } from './unitMaterial'

export interface LineMonitorStats {
  totalUnits: number
  /** 가동(Auto Run) 상태 유닛 수 */
  autoUnits: number
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
  lineRt?: SemiCnvLineRuntime | null,
): LineMonitorStats {
  const units = line.units
  const totalUnits = units.length
  const onCstUnits = countLineMaterialUnits(line, unitRuntime)
  const cvUnitCount = countCvUnits(line)
  const bufferUtilization =
    cvUnitCount === 0 ? 0 : Math.round((onCstUnits / cvUnitCount) * 100)

  let autoUnits = 0
  let idleUnits = 0
  let manualUnits = 0
  let errorUnits = 0
  let linkedUnits = 0

  for (const u of units) {
    const rt = unitRuntime[u.id]

    if (rt) {
      linkedUnits++
      // 맵 색상(mapSemiCnvToConveyorStatus)과 동일 기준 — Auto 모드면 순간 정지(runStatus
      // Stop, 자재 대기)여도 가동으로 센다. runStatus 기준으로 세면 화면은 파란 "가동"인데
      // 가동률은 0%로 갈라진다.
      if (rt.alarm) {
        errorUnits++
      } else if (rt.power === 'Off') {
        idleUnits++
      } else if (rt.operationStatus === 'Manual') {
        manualUnits++
      } else if (rt.operationStatus === 'Auto') {
        autoUnits++
      } else {
        idleUnits++
      }
    } else {
      if (u.status === 'running') autoUnits++
      else if (u.status === 'maintenance') manualUnits++
      else if (u.status === 'error') errorUnits++
      else idleUnits++
    }
  }

  // V3 LINE_STATUS 요약은 유닛별 CONVEYOR_STATUS가 아직 없을 때만 사용 —
  // 유닛별 데이터가 있으면 그쪽(맵과 동일 기준)이 우선
  if (lineRt && linkedUnits === 0) {
    linkedUnits = totalUnits
    autoUnits = lineRt.runningConveyors
  }

  return {
    totalUnits,
    autoUnits,
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
  if (autoRun && stats.autoUnits > 0) return 'Auto Run'
  if (stats.manualUnits > 0) return 'Manual Mode'
  if (autoRun) return 'Cycle Mode'
  return 'Standby'
}

/**
 * SAFETY CONDITION — 안전 회로(Main Power·EMO·EMS) 판정.
 * 유닛 개별 알람은 설비 오류이지 안전 회로 이탈이 아니므로 여기 포함하지 않는다
 * (오류는 AUTO CONDITION 차단 + CURRENT STATUS 'Error'로 표현).
 */
export function isSafetyOk(etherCatConnected: boolean): boolean {
  return etherCatConnected
}

export function isAutoEnabled(
  safetyOk: boolean,
  powerOn: boolean,
  stats: LineMonitorStats,
): boolean {
  // 활성 알람이 있으면 이상 복귀 전까지 Auto 재기동 불가
  return safetyOk && powerOn && stats.totalUnits > 0 && stats.errorUnits === 0
}

/**
 * 로컬 모드(V3 미연결) 전원 판정 — 라인 레벨 플래그가 아니라 유닛 실제 상태 기준.
 * 유닛이 하나라도 있고 전부 idle이 아니면(빌더에서 수동으로 running 등을 지정한 경우 포함)
 * Power ON으로 간주한다.
 */
export function isLinePoweredLocally(units: ConveyorUnit[]): boolean {
  return units.length > 0 && units.every((u) => u.status !== 'idle')
}

export function flowModeLabel(autoRun: boolean, powerOn: boolean): string {
  if (!powerOn) return 'Power Off'
  return autoRun ? 'Auto' : 'Manual'
}

export function countPoweredUnits(units: ConveyorUnit[], powerOn: boolean): number {
  if (!powerOn) return 0
  return units.filter((u) => u.status !== 'idle').length
}

/** 주화면·라인 현황 공통 — SAFETY CONDITION 값 색상 */
export function safetyConditionValueClass(ok: boolean): string {
  return ok ? 'text-blue-400' : 'text-red-400'
}

/** 주화면·라인 현황 공통 — AUTO CONDITION Enable/Disable 색상 */
export function autoConditionValueClass(enabled: boolean): string {
  return enabled ? 'text-emerald-400' : 'text-red-400'
}

/** 주화면·라인 현황 공통 — CURRENT STATUS 값 색상 */
export function currentStatusValueClass(status: string): string {
  if (status === 'Error') return 'text-red-400'
  if (status === 'Idle') return 'text-slate-300'
  if (status === 'Auto Run') return 'text-blue-400'
  if (status === 'Manual Mode') return 'text-amber-400'
  return 'text-slate-300'
}
