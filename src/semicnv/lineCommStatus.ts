import { SEMICNV_HEARTBEAT_TIMEOUT_MS } from '../constants/semicnv'
import type { ConveyorLine } from '../types/conveyor'
import type {
  SemiCnvCommState,
  SemiCnvConnectionState,
  SemiCnvLineCommRecord,
  SemiCnvLineCommStatus,
  SemiCnvLineStatusItem,
  SemiCnvMessage,
  SemiCnvSiteConnectData,
  SemiCnvSiteStatus,
  SemiCnvAlarmEventData,
  SemiCnvConveyorStatusItem,
  SemiCnvCstTrackingItem,
} from '../types/semicnv'
import { findLineForSemiCnvLineId } from './matchUnit'

export interface CommTrackState {
  sites: Record<string, SemiCnvSiteStatus>
  lines: Record<string, SemiCnvLineCommRecord>
}

export function createEmptyCommTrackState(): CommTrackState {
  return { sites: {}, lines: {} }
}

function touchSite(
  sites: Record<string, SemiCnvSiteStatus>,
  siteId: string,
  timestamp: string,
  patch: Partial<SemiCnvSiteStatus> = {},
): Record<string, SemiCnvSiteStatus> {
  const prev = sites[siteId]
  return {
    ...sites,
    [siteId]: {
      siteId,
      siteName: patch.siteName ?? prev?.siteName ?? null,
      programVersion: patch.programVersion ?? prev?.programVersion ?? null,
      online: true,
      lastMessageAt: timestamp,
      lastHeartbeatAt: patch.lastHeartbeatAt ?? prev?.lastHeartbeatAt ?? null,
    },
  }
}

function touchLine(
  lines: Record<string, SemiCnvLineCommRecord>,
  lineId: string,
  siteId: string,
  timestamp: string,
): Record<string, SemiCnvLineCommRecord> {
  return {
    ...lines,
    [lineId]: { siteId, lastMessageAt: timestamp },
  }
}

export function trackCommFromMessage(
  message: SemiCnvMessage,
  conveyorLines: ConveyorLine[],
  prev: CommTrackState,
): CommTrackState {
  const timestamp = message.timestamp || new Date().toISOString()
  let sites = prev.sites
  let lines = prev.lines

  switch (message.type) {
    case 'SITE_CONNECT': {
      const data = message.data as SemiCnvSiteConnectData
      sites = touchSite(sites, message.siteId, timestamp, {
        siteName: data.siteName,
        programVersion: data.programVersion,
      })
      break
    }
    case 'HEARTBEAT': {
      sites = touchSite(sites, message.siteId, timestamp, {
        lastHeartbeatAt: timestamp,
      })
      break
    }
    case 'LINE_STATUS': {
      const data = message.data as SemiCnvLineStatusItem[]
      sites = touchSite(sites, message.siteId, timestamp)
      for (const item of data) {
        const line = findLineForSemiCnvLineId(conveyorLines, item.lineId)
        if (line) {
          lines = touchLine(lines, line.id, message.siteId, timestamp)
        }
      }
      break
    }
    case 'CONVEYOR_STATUS': {
      const data = message.data as SemiCnvConveyorStatusItem[]
      sites = touchSite(sites, message.siteId, timestamp)
      const lineIds = new Set<number>()
      for (const item of data) {
        lineIds.add(item.lineId)
      }
      for (const semiCnvLineId of lineIds) {
        const line = findLineForSemiCnvLineId(conveyorLines, semiCnvLineId)
        if (line) {
          lines = touchLine(lines, line.id, message.siteId, timestamp)
        }
      }
      break
    }
    case 'ALARM_EVENT': {
      const data = message.data as SemiCnvAlarmEventData
      sites = touchSite(sites, message.siteId, timestamp)
      const line = findLineForSemiCnvLineId(conveyorLines, data.lineId)
      if (line) {
        lines = touchLine(lines, line.id, message.siteId, timestamp)
      }
      break
    }
    case 'CST_TRACKING': {
      const data = message.data as SemiCnvCstTrackingItem[]
      sites = touchSite(sites, message.siteId, timestamp)
      const lineIds = new Set<number>()
      for (const item of data) {
        lineIds.add(item.lineId)
      }
      for (const semiCnvLineId of lineIds) {
        const line = findLineForSemiCnvLineId(conveyorLines, semiCnvLineId)
        if (line) {
          lines = touchLine(lines, line.id, message.siteId, timestamp)
        }
      }
      break
    }
    default:
      break
  }

  return { sites, lines }
}

export function markStaleSites(
  sites: Record<string, SemiCnvSiteStatus>,
  nowMs = Date.now(),
): Record<string, SemiCnvSiteStatus> {
  const next: Record<string, SemiCnvSiteStatus> = {}
  for (const [siteId, site] of Object.entries(sites)) {
    const ref = site.lastHeartbeatAt ?? site.lastMessageAt
    const staleMs = nowMs - new Date(ref).getTime()
    next[siteId] = {
      ...site,
      online: staleMs <= SEMICNV_HEARTBEAT_TIMEOUT_MS,
    }
  }
  return next
}

export function resolveLineCommStatus(
  line: ConveyorLine,
  options: {
    enabled: boolean
    connectionState: SemiCnvConnectionState
    sites: Record<string, SemiCnvSiteStatus>
    lineRecords: Record<string, SemiCnvLineCommRecord>
    nowMs?: number
  },
): SemiCnvLineCommStatus {
  const nowMs = options.nowMs ?? Date.now()

  if (!options.enabled) {
    return {
      lineId: line.id,
      siteId: null,
      siteName: null,
      state: 'local',
      lastMessageAt: null,
      staleSeconds: null,
    }
  }

  if (options.connectionState !== 'connected') {
    return {
      lineId: line.id,
      siteId: line.semiCnvSiteId ?? null,
      siteName: null,
      state: 'offline',
      lastMessageAt: options.lineRecords[line.id]?.lastMessageAt ?? null,
      staleSeconds: null,
    }
  }

  const record = options.lineRecords[line.id]
  const expectedSiteId = line.semiCnvSiteId ?? record?.siteId ?? null

  if (!record && line.semiCnvLineId == null && !line.semiCnvSiteId) {
    return {
      lineId: line.id,
      siteId: null,
      siteName: null,
      state: 'unmapped',
      lastMessageAt: null,
      staleSeconds: null,
    }
  }

  if (!record) {
    return {
      lineId: line.id,
      siteId: expectedSiteId,
      siteName: expectedSiteId ? (options.sites[expectedSiteId]?.siteName ?? null) : null,
      state: 'waiting',
      lastMessageAt: null,
      staleSeconds: null,
    }
  }

  const site = options.sites[record.siteId]
  const staleMs = nowMs - new Date(record.lastMessageAt).getTime()
  const staleSeconds = Math.floor(staleMs / 1000)
  const siteOnline = site?.online ?? staleMs <= SEMICNV_HEARTBEAT_TIMEOUT_MS
  const lineFresh = staleMs <= SEMICNV_HEARTBEAT_TIMEOUT_MS

  let state: SemiCnvCommState = 'offline'
  if (siteOnline && lineFresh) {
    state = 'online'
  } else if (!siteOnline || !lineFresh) {
    state = 'offline'
  }

  return {
    lineId: line.id,
    siteId: record.siteId,
    siteName: site?.siteName ?? null,
    state,
    lastMessageAt: record.lastMessageAt,
    staleSeconds,
  }
}

export function resolveAllLineCommStatuses(
  lines: ConveyorLine[],
  options: Parameters<typeof resolveLineCommStatus>[1],
): Record<string, SemiCnvLineCommStatus> {
  return Object.fromEntries(
    lines.map((line) => [line.id, resolveLineCommStatus(line, options)]),
  )
}

export const COMM_STATE_LABEL: Record<SemiCnvCommState, string> = {
  local: '로컬',
  waiting: '대기',
  online: 'Online',
  offline: 'Offline',
  unmapped: '미매핑',
}

export const COMM_STATE_CLASS: Record<SemiCnvCommState, string> = {
  local: 'text-slate-500',
  waiting: 'text-amber-400',
  online: 'text-emerald-400',
  offline: 'text-red-400',
  unmapped: 'text-slate-500',
}

export const COMM_STATE_DOT: Record<SemiCnvCommState, string> = {
  local: 'bg-slate-600',
  waiting: 'bg-amber-500 animate-pulse',
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
  unmapped: 'bg-slate-700',
}

export function formatLastReceived(lastMessageAt: string | null): string {
  if (!lastMessageAt) return '-'
  const date = new Date(lastMessageAt)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}:${ss}`
}
