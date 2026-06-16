import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'

export interface LineMonitorStats {
  totalUnits: number
  runUnits: number
  idleUnits: number
  manualUnits: number
  errorUnits: number
  onCstUnits: number
  linkedUnits: number
  bufferUtilization: number
}

export function computeLineStats(line: ConveyorLine): LineMonitorStats {
  const units = line.units
  const totalUnits = units.length
  const runUnits = units.filter((u) => u.status === 'running').length
  const idleUnits = units.filter((u) => u.status === 'idle').length
  const manualUnits = units.filter((u) => u.status === 'maintenance').length
  const errorUnits = units.filter((u) => u.status === 'error').length
  const linkedUnits = units.filter((u) => u.interfaceUnit !== null).length
  const onCstUnits = runUnits + manualUnits

  const bufferUtilization =
    totalUnits === 0 ? 0 : ((totalUnits - idleUnits) / totalUnits) * 100

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
