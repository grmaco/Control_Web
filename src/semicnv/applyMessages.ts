import type { AlarmEntry } from '../utils/alarms'
import type { ConveyorLine, ConveyorStatus } from '../types/conveyor'
import type {
  SemiCnvAlarmEventData,
  SemiCnvConveyorStatusItem,
  SemiCnvCstTrackingItem,
  SemiCnvEnvelope,
  SemiCnvLineStatusItem,
  SemiCnvLineRuntime,
  SemiCnvMessage,
  SemiCnvSiteConnectData,
  SemiCnvUnitRuntime,
} from '../types/semicnv'
import { mapSemiCnvAlarmLevel, toUnitRuntime } from './mapStatus'
import {
  findLineForSemiCnvLineId,
  findUnitBySemiCnvId,
  findUnitForSemiCnvStatus,
} from './matchUnit'

export interface SemiCnvApplyResult {
  unitStatuses: Record<string, ConveyorStatus>
  unitRuntime: Record<string, SemiCnvUnitRuntime>
  /** V3에서 받은 모든 CV 런타임 — semiCnvId 기준, 매칭 여부 무관 */
  allCvRuntime: Record<number, SemiCnvUnitRuntime>
  lineRuntime: Record<string, SemiCnvLineRuntime>
  liveAlarms: AlarmEntry[]
  siteId: string | null
  siteName: string | null
  programVersion: string | null
  lastMessageAt: string
  etherCatConnected: boolean | null
  lineControlPatches: Record<string, { powerOn?: boolean; autoRun?: boolean }>
}

export function createEmptyApplyResult(): SemiCnvApplyResult {
  return {
    unitStatuses: {},
    unitRuntime: {},
    allCvRuntime: {},
    lineRuntime: {},
    liveAlarms: [],
    siteId: null,
    siteName: null,
    programVersion: null,
    lastMessageAt: new Date().toISOString(),
    etherCatConnected: null,
    lineControlPatches: {},
  }
}

function shouldAcceptSite(messageSiteId: string, filterSiteId?: string): boolean {
  if (!filterSiteId) return true
  return messageSiteId === filterSiteId
}

export function applySemiCnvMessage(
  message: SemiCnvMessage,
  lines: ConveyorLine[],
  filterSiteId?: string,
  prev: SemiCnvApplyResult = createEmptyApplyResult(),
): SemiCnvApplyResult {
  if (!shouldAcceptSite(message.siteId, filterSiteId)) {
    return prev
  }

  const next: SemiCnvApplyResult = {
    ...prev,
    siteId: message.siteId,
    lastMessageAt: message.timestamp || new Date().toISOString(),
  }

  switch (message.type) {
    case 'SITE_CONNECT':
      return applySiteConnect(message as SemiCnvEnvelope<SemiCnvSiteConnectData>, next)
    case 'CONVEYOR_STATUS':
      return applyConveyorStatus(message as SemiCnvEnvelope<SemiCnvConveyorStatusItem[]>, lines, next)
    case 'LINE_STATUS':
      return applyLineStatus(message as SemiCnvEnvelope<SemiCnvLineStatusItem[]>, lines, next)
    case 'ALARM_EVENT':
      return applyAlarmEvent(message as SemiCnvEnvelope<SemiCnvAlarmEventData>, lines, next)
    case 'CST_TRACKING':
      return applyCstTracking(message as SemiCnvEnvelope<SemiCnvCstTrackingItem[]>, lines, next)
    case 'HEARTBEAT':
      return next
    default:
      return next
  }
}

function applySiteConnect(
  message: SemiCnvEnvelope<SemiCnvSiteConnectData>,
  prev: SemiCnvApplyResult,
): SemiCnvApplyResult {
  return {
    ...prev,
    siteName: message.data.siteName,
    programVersion: message.data.programVersion,
  }
}

function applyConveyorStatus(
  message: SemiCnvEnvelope<SemiCnvConveyorStatusItem[]>,
  lines: ConveyorLine[],
  prev: SemiCnvApplyResult,
): SemiCnvApplyResult {
  const unitStatuses = { ...prev.unitStatuses }
  const unitRuntime = { ...prev.unitRuntime }
  const allCvRuntime = { ...prev.allCvRuntime }

  for (const item of message.data) {
    const { status, runtime } = toUnitRuntime(item)

    // 매칭 여부와 무관하게 semiCnvId 기준으로 전체 저장
    allCvRuntime[item.id] = runtime

    const matched = findUnitForSemiCnvStatus(lines, item)
    if (!matched) continue
    unitStatuses[matched.unit.id] = status
    unitRuntime[matched.unit.id] = runtime
  }

  return { ...prev, unitStatuses, unitRuntime, allCvRuntime }
}

function applyLineStatus(
  message: SemiCnvEnvelope<SemiCnvLineStatusItem[]>,
  lines: ConveyorLine[],
  prev: SemiCnvApplyResult,
): SemiCnvApplyResult {
  const lineRuntime = { ...prev.lineRuntime }
  const lineControlPatches = { ...prev.lineControlPatches }
  let etherCatConnected = prev.etherCatConnected

  for (const item of message.data) {
    const line = findLineForSemiCnvLineId(lines, item.lineId)
    if (!line) continue

    lineRuntime[line.id] = {
      semiCnvLineId: item.lineId,
      lineName: item.lineName,
      safetyStatus: item.safetyStatus,
      keyStatus: item.keyStatus,
      autoCondition: item.autoCondition,
      operationStatus: item.operationStatus,
      runningConveyors: item.runningConveyors,
      alarmConveyors: item.alarmConveyors,
      updatedAt: message.timestamp,
    }

    lineControlPatches[line.id] = {
      powerOn: item.operationStatus === 'Auto' || item.runningConveyors > 0,
      autoRun: item.keyStatus === 'Auto' && item.operationStatus === 'Auto',
    }

    etherCatConnected = item.safetyStatus === 'OK'
  }

  return {
    ...prev,
    lineRuntime,
    lineControlPatches,
    etherCatConnected,
  }
}

function applyAlarmEvent(
  message: SemiCnvEnvelope<SemiCnvAlarmEventData>,
  lines: ConveyorLine[],
  prev: SemiCnvApplyResult,
): SemiCnvApplyResult {
  const data = message.data
  const matched = findUnitBySemiCnvId(lines, data.conveyorId, data.lineId)
  const unitName = matched?.unit.name ?? `CV-${data.conveyorId}`

  if (data.eventType === 'CLEAR') {
    return {
      ...prev,
      liveAlarms: prev.liveAlarms.filter((alarm) => alarm.alarmId !== data.alarmCode),
    }
  }

  const alarm: AlarmEntry = {
    id: `semicnv-${data.alarmCode}-${message.timestamp}`,
    timestamp: message.timestamp,
    alarmId: data.alarmCode,
    alarmText: data.message || `${unitName} ${data.alarmCode}`,
    level: mapSemiCnvAlarmLevel(data.alarmLevel),
  }

  return {
    ...prev,
    liveAlarms: [alarm, ...prev.liveAlarms].slice(0, 50),
  }
}

function applyCstTracking(
  message: SemiCnvEnvelope<SemiCnvCstTrackingItem[]>,
  lines: ConveyorLine[],
  prev: SemiCnvApplyResult,
): SemiCnvApplyResult {
  const unitRuntime = { ...prev.unitRuntime }

  for (const item of message.data) {
    const matched = findUnitBySemiCnvId(lines, item.conveyorId, item.lineId)
    if (!matched) continue

    const existing = unitRuntime[matched.unit.id]
    unitRuntime[matched.unit.id] = {
      ...(existing ?? {
        semiCnvId: item.conveyorId,
        semiCnvLineId: item.lineId,
        autoStep: 0,
        autoStatus: 'Idle',
        runStatus: 'Stop',
        operationStatus: 'Auto',
        alarm: false,
        updatedAt: message.timestamp,
      }),
      cstId: item.cstId,
      destination: item.destination,
      updatedAt: message.timestamp,
    }
  }

  return { ...prev, unitRuntime }
}
