import type { ConveyorLine } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'
import type { AlarmEntry } from './alarms'
import { resolveUnitAlarmDisplay } from './unitAlarmDisplay'

export interface ActiveV3AlarmOccurrence {
  id: string
  alarmCode: string
  alarmText: string | null
  lineId: string | null
  lineName: string
  unitId: string
  unitName: string
  cvId: number
  v3LineId: number
}

export function buildActiveV3AlarmOccurrences(
  lines: ConveyorLine[],
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  unitAlarms: Record<string, string>,
  liveAlarms: AlarmEntry[] = [],
): ActiveV3AlarmOccurrence[] {
  const unitLineMap = new Map<string, { line: ConveyorLine; unit: ConveyorLine['units'][number] }>()
  for (const line of lines) {
    for (const unit of line.units) {
      unitLineMap.set(unit.id, { line, unit })
    }
  }

  const seen = new Set<string>()
  const result: ActiveV3AlarmOccurrence[] = []

  const unitIds = new Set([
    ...Object.keys(unitRuntime).filter((unitId) => unitRuntime[unitId]?.alarm),
    ...Object.keys(unitAlarms),
  ])

  for (const unitId of unitIds) {
    const rt = unitRuntime[unitId]
    if (!rt?.alarm && !unitAlarms[unitId]) continue

    const mapped = unitLineMap.get(unitId)
    const unitName = mapped?.unit.name ?? (rt ? `CV-${rt.semiCnvId}` : unitId)
    const display = resolveUnitAlarmDisplay(
      unitId,
      unitName,
      rt ?? { alarm: true, alarmCode: null, alarmMessage: unitAlarms[unitId] ?? null },
      unitAlarms,
      liveAlarms,
    )
    const alarmCode = display.alarmCode ?? unitAlarms[unitId]
    if (!alarmCode) continue

    const id = `${unitId}-${alarmCode}`
    if (seen.has(id)) continue
    seen.add(id)

    result.push({
      id,
      alarmCode,
      alarmText: display.alarmText,
      lineId: mapped?.line.id ?? null,
      lineName: mapped?.line.name ?? (rt ? `V3 라인 ${rt.semiCnvLineId}` : '미매핑 라인'),
      unitId,
      unitName,
      cvId: rt?.semiCnvId ?? mapped?.unit.semiCnvId ?? 0,
      v3LineId: rt?.semiCnvLineId ?? mapped?.line.semiCnvLineId ?? 0,
    })
  }

  return result.sort(
    (a, b) =>
      a.lineName.localeCompare(b.lineName, 'ko') ||
      a.unitName.localeCompare(b.unitName, 'ko') ||
      a.alarmCode.localeCompare(b.alarmCode),
  )
}

export function groupOccurrencesByAlarmCode(
  occurrences: ActiveV3AlarmOccurrence[],
): Map<string, ActiveV3AlarmOccurrence[]> {
  const map = new Map<string, ActiveV3AlarmOccurrence[]>()
  for (const occurrence of occurrences) {
    const list = map.get(occurrence.alarmCode) ?? []
    list.push(occurrence)
    map.set(occurrence.alarmCode, list)
  }
  return map
}

export function formatOccurrenceLocation(occurrence: ActiveV3AlarmOccurrence): string {
  return `${occurrence.lineName} · ${occurrence.unitName}`
}
