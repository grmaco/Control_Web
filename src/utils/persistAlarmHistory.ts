import type { ConveyorLine } from '../types/conveyor'
import type { AlarmLevel, StoredAlarmEntry } from './alarms'
import { useConveyorStore } from '../store/useConveyorStore'

export function persistAlarmHistoryEntry(entry: StoredAlarmEntry): void {
  void useConveyorStore.getState().appendAlarmHistory(entry)
}

export function persistUnitAlarmHistory(
  lines: ConveyorLine[],
  unitId: string,
  timestamp: string,
  alarmText: string,
  alarmId = '2001',
  level: AlarmLevel = 'Warn',
): void {
  if (!timestamp) return

  const line = lines.find((item) => item.units.some((unit) => unit.id === unitId))
  if (!line) return

  persistAlarmHistoryEntry({
    id: `alarm-${line.id}-${unitId}-${timestamp}`,
    lineId: line.id,
    timestamp,
    alarmId,
    alarmText,
    level,
  })
}

export function persistMainPowerOffHistory(
  lines: ConveyorLine[],
  timestamp: string,
): void {
  if (!timestamp) return

  for (const line of lines) {
    persistAlarmHistoryEntry({
      id: `ethercat-${line.id}-${timestamp}`,
      lineId: line.id,
      timestamp,
      alarmId: '1001',
      alarmText: 'MAIN POWER OFF',
      level: 'Heavy',
    })
  }
}
