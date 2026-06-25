import type { AlarmEntry } from './alarms'
import type { SemiCnvUnitRuntime } from '../types/semicnv'

export interface UnitAlarmDisplay {
  alarmCode: string | null
  alarmText: string | null
}

export function resolveUnitAlarmDisplay(
  unitId: string,
  unitName: string,
  runtime: Pick<SemiCnvUnitRuntime, 'alarm' | 'alarmCode' | 'alarmMessage'>,
  unitAlarms: Record<string, string>,
  liveAlarms: AlarmEntry[] = [],
): UnitAlarmDisplay {
  if (!runtime.alarm) {
    return { alarmCode: null, alarmText: null }
  }

  const fromLive = liveAlarms.find(
    (entry) => entry.alarmText.includes(unitName) || entry.id.includes(unitId),
  )

  const alarmText =
    runtime.alarmMessage ??
    unitAlarms[unitId] ??
    fromLive?.alarmText ??
    null

  const alarmCode =
    runtime.alarmCode != null
      ? String(runtime.alarmCode)
      : fromLive?.alarmId ??
        (runtime.alarmMessage ? null : unitAlarms[unitId] ?? null)

  return { alarmCode, alarmText }
}
