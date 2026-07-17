import type { ConveyorLine } from '../types/conveyor'
import type {
  SemiCnvCstJourney,
  SemiCnvLineCommStatus,
  SemiCnvLineRuntime,
  SemiCnvLogEntry,
  SemiCnvIOStatus,
  SemiCnvTrafficEntry,
  SemiCnvUnitRuntime,
} from '../types/semicnv'
import type { AlarmEntry } from './alarms'

/** 선택 라인이 V3 실시간 데이터를 표시할 수 있는지 */
export function isLineV3Online(comm: SemiCnvLineCommStatus | null): boolean {
  return comm?.state === 'online'
}

function lineUnitIdSet(line: ConveyorLine): Set<string> {
  return new Set(line.units.map((unit) => unit.id))
}

/** 선택 라인 소속 유닛 런타임만 (미연결 라인은 빈 객체) */
export function filterUnitRuntimeForLine(
  line: ConveyorLine,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  comm: SemiCnvLineCommStatus | null,
): Record<string, SemiCnvUnitRuntime> {
  if (!isLineV3Online(comm)) return {}

  const scoped: Record<string, SemiCnvUnitRuntime> = {}
  for (const unit of line.units) {
    const rt = unitRuntime[unit.id]
    if (rt) scoped[unit.id] = rt
  }
  return scoped
}

/** 선택 라인 소속 유닛 알람만 */
export function filterUnitAlarmsForLine(
  line: ConveyorLine,
  unitAlarms: Record<string, string>,
  comm: SemiCnvLineCommStatus | null,
): Record<string, string> {
  if (!isLineV3Online(comm)) return {}

  const unitIds = lineUnitIdSet(line)
  const scoped: Record<string, string> = {}
  for (const [unitId, alarmCode] of Object.entries(unitAlarms)) {
    if (unitIds.has(unitId)) scoped[unitId] = alarmCode
  }
  return scoped
}

/** 선택 라인 유닛과 연관된 V3 live 알람만 */
export function filterLiveAlarmsForLine(
  line: ConveyorLine,
  liveAlarms: AlarmEntry[],
  comm: SemiCnvLineCommStatus | null,
): AlarmEntry[] {
  if (!isLineV3Online(comm)) return []

  const unitIds = lineUnitIdSet(line)
  const unitNames = line.units.map((unit) => unit.name)

  return liveAlarms.filter((entry) => {
    if ([...unitIds].some((unitId) => entry.id.includes(unitId))) return true
    return unitNames.some((name) => entry.alarmText.includes(name))
  })
}

/** 선택 라인 V3 사이트에 해당하는 로그만 */
export function filterV3LogsForLine(
  line: ConveyorLine,
  logs: SemiCnvLogEntry[],
  comm: SemiCnvLineCommStatus | null,
): SemiCnvLogEntry[] {
  if (!isLineV3Online(comm)) return []

  const siteId = comm?.siteId ?? line.semiCnvSiteId ?? null
  if (!siteId) return []

  return logs.filter((log) => log.siteId === siteId)
}

/** 선택 라인에 귀속된 V3 현장(Site) ID — 통신 기록 우선, 없으면 명시 매핑 */
export function lineV3SiteId(
  line: ConveyorLine,
  comm: SemiCnvLineCommStatus | null,
): string | null {
  return comm?.siteId ?? line.semiCnvSiteId ?? null
}

/**
 * 선택 라인 소속 CST 반송 이력만.
 * 라인에 귀속된 site가 없으면(한 번도 V3에 연결된 적 없는 라인) 빈 목록 —
 * 다른 라인의 V3 데이터가 미연결 라인에 표시되는 것을 막는다.
 * 구버전 보존 데이터(siteId 없음)는 표시 유지 — 지우기 버튼으로 정리 가능.
 */
export function filterCstJourneysForLine(
  line: ConveyorLine,
  journeys: Record<string, SemiCnvCstJourney>,
  comm: SemiCnvLineCommStatus | null,
): SemiCnvCstJourney[] {
  const siteId = lineV3SiteId(line, comm)
  if (!siteId) return []
  return Object.values(journeys).filter(
    (j) =>
      (j.siteId == null || j.siteId === siteId) &&
      (line.semiCnvLineId == null || j.lineId === line.semiCnvLineId),
  )
}

/**
 * 선택 라인 소속 V3 송수신 트래픽만.
 * 송신(tx) COMMAND는 전 연결에 브로드캐스트되므로 siteId가 없으면 모든 라인에 표시.
 */
export function filterV3TrafficForLine(
  line: ConveyorLine,
  traffic: SemiCnvTrafficEntry[],
  comm: SemiCnvLineCommStatus | null,
): SemiCnvTrafficEntry[] {
  const siteId = lineV3SiteId(line, comm)
  if (!siteId) return []
  return traffic.filter(
    (e) => e.siteId === siteId || (e.direction === 'tx' && e.siteId == null),
  )
}

/** 선택 라인 V3 Online일 때만 IO 상태 반환 */
export function filterIoStatusForLine(
  ioStatus: SemiCnvIOStatus | null,
  comm: SemiCnvLineCommStatus | null,
): SemiCnvIOStatus | null {
  if (!isLineV3Online(comm)) return null
  return ioStatus
}

/** 선택 라인에 활성 알람이 있는지 */
export function hasActiveAlarmsForLine(
  line: ConveyorLine,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  unitAlarms: Record<string, string>,
  comm: SemiCnvLineCommStatus | null,
): boolean {
  const scopedAlarms = filterUnitAlarmsForLine(line, unitAlarms, comm)
  if (Object.keys(scopedAlarms).length > 0) return true

  if (isLineV3Online(comm)) {
    return line.units.some((unit) => unitRuntime[unit.id]?.alarm)
  }

  return line.units.some((unit) => unit.status === 'error')
}

/** 선택 라인 V3 Online일 때만 라인 런타임 반환 */
export function getLineRuntimeForLine(
  line: ConveyorLine,
  lineRuntime: Record<string, SemiCnvLineRuntime>,
  comm: SemiCnvLineCommStatus | null,
): SemiCnvLineRuntime | undefined {
  if (!isLineV3Online(comm)) return undefined
  return lineRuntime[line.id]
}
