import type { ConveyorLine, HistoryRecord } from '../types/conveyor'

export type AlarmLevel = 'Info' | 'Light' | 'Warn' | 'Heavy' | 'Error'

export interface AlarmEntry {
  id: string
  timestamp: string
  alarmId: string
  alarmText: string
  level: AlarmLevel
}

export interface StoredAlarmEntry extends AlarmEntry {
  lineId: string
}

const LEVEL_BY_EVENT: Partial<Record<HistoryRecord['eventType'], AlarmLevel>> = {
  error: 'Warn',
  maintenance: 'Light',
  stop: 'Info',
  start: 'Info',
  statusChange: 'Info',
}

const ALARM_ID_BY_EVENT: Partial<Record<HistoryRecord['eventType'], string>> = {
  error: '2001',
  maintenance: '3001',
  stop: '1002',
  start: '1001',
}

export function buildAlarmList(
  line: ConveyorLine,
  history: HistoryRecord[],
  etherCatConnected: boolean,
  options?: { includeUnitStatus?: boolean; etherCatOffSince?: string | null },
  limit = 30,
): AlarmEntry[] {
  const includeUnitStatus = options?.includeUnitStatus ?? true
  const etherCatOffSince = options?.etherCatOffSince ?? null
  const entries: AlarmEntry[] = []

  if (!etherCatConnected) {
    entries.push({
      id: 'system-ethercat',
      timestamp: etherCatOffSince ?? '',
      alarmId: '1001',
      alarmText: 'MAIN POWER OFF',
      level: 'Heavy',
    })
  }

  if (includeUnitStatus) {
    for (const unit of line.units) {
      if (unit.status === 'error') {
        entries.push({
          id: `unit-error-${unit.id}`,
          timestamp: unit.updatedAt,
          alarmId: '2001',
          alarmText: `${unit.name} ERROR DETECTED`,
          level: 'Warn',
        })
      }
      if (unit.status === 'maintenance') {
        entries.push({
          id: `unit-maint-${unit.id}`,
          timestamp: unit.updatedAt,
          alarmId: '3001',
          alarmText: `${unit.name} MANUAL MODE`,
          level: 'Light',
        })
      }
    }
  }

  for (const record of history) {
    if (record.lineId !== line.id) continue
    if (record.eventType !== 'error' && record.eventType !== 'maintenance') continue

    entries.push({
      id: record.id,
      timestamp: record.timestamp,
      alarmId: ALARM_ID_BY_EVENT[record.eventType] ?? '9999',
      alarmText: record.message.toUpperCase(),
      level: LEVEL_BY_EVENT[record.eventType] ?? 'Info',
    })
  }

  const unique = new Map<string, AlarmEntry>()
  for (const entry of entries) {
    unique.set(entry.id, entry)
  }

  return [...unique.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit)
}

export function alarmLevelClass(level: AlarmLevel): string {
  switch (level) {
    case 'Heavy':
    case 'Error':
      return 'text-red-400'
    case 'Warn':
      return 'text-amber-400'
    case 'Light':
      return 'text-yellow-300'
    default:
      return 'text-slate-400'
  }
}
