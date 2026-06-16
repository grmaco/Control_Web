import type { ConveyorLine, HistoryEventType, HistoryRecord } from '../types/conveyor'

export type LogLevel = 'Normal' | 'Warning' | 'Error' | 'Info'

export interface LogEntry {
  id: string
  timestamp: string
  generateTime: string
  logType: string
  logLevel: LogLevel
  logTitle: string
  logComment: string
}

const LOG_TITLE_BY_EVENT: Record<HistoryEventType, string> = {
  start: '가동 시작',
  stop: '운전 정지',
  error: '오류 발생',
  maintenance: '점검 모드',
  statusChange: '상태 변경',
  application: 'Application Event',
}

const LOG_LEVEL_BY_EVENT: Record<HistoryEventType, LogLevel> = {
  start: 'Normal',
  stop: 'Normal',
  error: 'Error',
  maintenance: 'Warning',
  statusChange: 'Info',
  application: 'Normal',
}

export function formatGenerateTime(timestamp: string): string {
  const date = new Date(timestamp)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hours = date.getHours()
  const ampm = hours < 12 ? '오전' : '오후'
  const h12 = String(hours % 12 || 12).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const sec = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${yyyy}-${mm}-${dd} ${ampm} ${h12}:${min}:${sec}.${ms}`
}

function resolveUnitName(
  lines: ConveyorLine[],
  lineId: string,
  unitId: string,
): string | null {
  const line = lines.find((item) => item.id === lineId)
  return line?.units.find((unit) => unit.id === unitId)?.name ?? null
}

function buildLogComment(record: HistoryRecord): string {
  const parts = [record.message]
  if (record.prevStatus && record.nextStatus) {
    parts.push(`${record.prevStatus} → ${record.nextStatus}`)
  }
  if (record.operator) {
    parts.push(`Operator: ${record.operator}`)
  }
  return parts.join(' · ')
}

export function historyRecordToLogEntry(
  record: HistoryRecord,
  lines: ConveyorLine[],
): LogEntry {
  if (record.eventType === 'application') {
    return {
      id: record.id,
      timestamp: record.timestamp,
      generateTime: formatGenerateTime(record.timestamp),
      logType: 'Application',
      logLevel: 'Normal',
      logTitle: record.logTitle ?? 'Application Event',
      logComment: buildLogComment(record),
    }
  }

  const unitName = resolveUnitName(lines, record.lineId, record.unitId)
  const line = lines.find((item) => item.id === record.lineId)

  return {
    id: record.id,
    timestamp: record.timestamp,
    generateTime: formatGenerateTime(record.timestamp),
    logType: unitName ? `Conveyor ${unitName}` : (line?.name ?? 'Application'),
    logLevel: LOG_LEVEL_BY_EVENT[record.eventType] ?? 'Info',
    logTitle: record.logTitle ?? LOG_TITLE_BY_EVENT[record.eventType] ?? record.eventType,
    logComment: buildLogComment(record),
  }
}

export function mapHistoryToLogs(
  history: HistoryRecord[],
  lines: ConveyorLine[],
): LogEntry[] {
  return history
    .map((record) => historyRecordToLogEntry(record, lines))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export interface LogFilterState {
  logType: string
  logLevel: LogLevel | ''
  dateFrom: string
  dateTo: string
}

export function filterLogEntries(entries: LogEntry[], filter: LogFilterState): LogEntry[] {
  return entries.filter((entry) => {
    if (filter.logType && entry.logType !== filter.logType) return false
    if (filter.logLevel && entry.logLevel !== filter.logLevel) return false
    if (filter.dateFrom) {
      const from = `${filter.dateFrom}T00:00:00.000`
      if (entry.timestamp < from) return false
    }
    if (filter.dateTo) {
      const to = `${filter.dateTo}T23:59:59.999`
      if (entry.timestamp > to) return false
    }
    return true
  })
}

export function logLevelClass(level: LogLevel): string {
  switch (level) {
    case 'Error':
      return 'text-red-400'
    case 'Warning':
      return 'text-amber-300'
    case 'Info':
      return 'text-sky-300'
    default:
      return 'text-slate-200'
  }
}

export const LOG_LEVEL_OPTIONS: LogLevel[] = ['Normal', 'Info', 'Warning', 'Error']
