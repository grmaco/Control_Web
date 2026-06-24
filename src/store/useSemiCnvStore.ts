import { create } from 'zustand'
import { DEFAULT_SEMICNV_SETTINGS } from '../constants/semicnv'
import type { ConveyorStatus } from '../types/conveyor'
import type {
  SemiCnvConnectionState,
  SemiCnvIOStatus,
  SemiCnvLineCommRecord,
  SemiCnvLineRuntime,
  SemiCnvLogEntry,
  SemiCnvMonitorSettings,
  SemiCnvMessage,
  SemiCnvSiteStatus,
  SemiCnvUnitRuntime,
} from '../types/semicnv'
import type { AlarmEntry } from '../utils/alarms'
import {
  applySemiCnvMessage,
  createEmptyApplyResult,
  type SemiCnvApplyResult,
} from '../semicnv/applyMessages'
import {
  createEmptyCommTrackState,
  markStaleSites,
  trackCommFromMessage,
  type CommTrackState,
} from '../semicnv/lineCommStatus'
import { SemiCnvClient } from '../semicnv/SemiCnvClient'
import { SemiCnvMockFeed } from '../semicnv/SemiCnvMockFeed'
import { useConveyorStore } from './useConveyorStore'
import { useMonitorStore } from './useMonitorStore'

const V3_LOG_MAX = 2000

interface SemiCnvState {
  settings: SemiCnvMonitorSettings
  connectionState: SemiCnvConnectionState
  siteStatus: Record<string, SemiCnvSiteStatus>
  lineCommRecords: Record<string, SemiCnvLineCommRecord>
  commTick: number
  unitStatuses: Record<string, ConveyorStatus>
  unitRuntime: Record<string, SemiCnvUnitRuntime>
  allCvRuntime: Record<number, SemiCnvUnitRuntime>
  lineRuntime: Record<string, SemiCnvLineRuntime>
  ioStatus: SemiCnvIOStatus | null
  liveAlarms: AlarmEntry[]
  v3Logs: SemiCnvLogEntry[]
  isLive: boolean

  configure: (settings: Partial<SemiCnvMonitorSettings>) => void
  connect: () => void
  disconnect: () => void
  handleMessage: (message: SemiCnvMessage) => void
  refreshCommStale: () => void
  sendCommand: (cmd: string, extra?: Record<string, unknown>) => void
}

// url → 클라이언트 (라인별 다중 V3 연결 지원)
const clients = new Map<string, SemiCnvClient>()
let mockFeed: SemiCnvMockFeed | null = null
let commStaleTimer: ReturnType<typeof setInterval> | null = null

function mergeApplyResult(
  prev: SemiCnvApplyResult,
  next: SemiCnvApplyResult,
): SemiCnvApplyResult {
  return {
    unitStatuses: { ...prev.unitStatuses, ...next.unitStatuses },
    unitRuntime: { ...prev.unitRuntime, ...next.unitRuntime },
    allCvRuntime: { ...prev.allCvRuntime, ...next.allCvRuntime },
    lineRuntime: { ...prev.lineRuntime, ...next.lineRuntime },
    liveAlarms: next.liveAlarms.length > 0 ? next.liveAlarms : prev.liveAlarms,
    siteId: next.siteId ?? prev.siteId,
    siteName: next.siteName ?? prev.siteName,
    programVersion: next.programVersion ?? prev.programVersion,
    lastMessageAt: next.lastMessageAt,
    etherCatConnected: next.etherCatConnected ?? prev.etherCatConnected,
    lineControlPatches: { ...prev.lineControlPatches, ...next.lineControlPatches },
  }
}

function applyToMonitorStore(result: SemiCnvApplyResult): void {
  if (result.etherCatConnected != null) {
    useMonitorStore.setState({ etherCatConnected: result.etherCatConnected })
  }

  const patches = result.lineControlPatches
  if (Object.keys(patches).length === 0) return

  const monitorState = useMonitorStore.getState()
  const lineControls = { ...monitorState.lineControls }
  for (const [lineId, patch] of Object.entries(patches)) {
    const current = lineControls[lineId] ?? { powerOn: false, autoRun: false }
    lineControls[lineId] = {
      powerOn: patch.powerOn ?? current.powerOn,
      autoRun: patch.autoRun ?? current.autoRun,
    }
  }
  useMonitorStore.setState({ lineControls })
}

function clearRuntime(): Partial<SemiCnvState> {
  return {
    unitStatuses: {},
    unitRuntime: {},
    allCvRuntime: {},
    lineRuntime: {},
    ioStatus: null,
    liveAlarms: [],
    v3Logs: [],
    siteStatus: {},
    lineCommRecords: {},
    commTick: 0,
    isLive: false,
  }
}

function startCommStaleTimer(refresh: () => void): void {
  stopCommStaleTimer()
  commStaleTimer = setInterval(refresh, 1000)
}

function stopCommStaleTimer(): void {
  if (commStaleTimer) {
    clearInterval(commStaleTimer)
    commStaleTimer = null
  }
}

export const useSemiCnvStore = create<SemiCnvState>((set, get) => {
  let applyBuffer = createEmptyApplyResult()
  let commTrack: CommTrackState = createEmptyCommTrackState()

  const processMessage = (message: SemiCnvMessage, sourceUrl?: string) => {
    // LOG_EVENT는 applyBuffer와 무관 — 별도 처리 후 즉시 반환
    if (message.type === 'LOG_EVENT') {
      const d = message.data as import('../types/semicnv').SemiCnvLogEventData
      const entry: SemiCnvLogEntry = {
        id: `${d.logTime}-${d.logType}-${d.title}-${Math.random()}`,
        logTime: d.logTime,
        logType: d.logType,
        logLevel: d.logLevel,
        title: d.title,
        description: d.description,
        receivedAt: new Date().toISOString(),
      }
      set((s) => ({ v3Logs: [entry, ...s.v3Logs].slice(0, V3_LOG_MAX) }))
      return
    }

    const allLines = useConveyorStore.getState().lines
    const { settings } = get()

    // 라인 전용 URL → 그 URL이 지정된 라인만, 전역 URL → 전용 URL 없는 라인만
    const isPerLineUrl = sourceUrl && sourceUrl !== settings.wsUrl
    const targetLines = isPerLineUrl
      ? allLines.filter((l) => l.semiCnvWsUrl?.trim() === sourceUrl)
      : allLines.filter((l) => !l.semiCnvWsUrl?.trim())

    applyBuffer = mergeApplyResult(
      applyBuffer,
      applySemiCnvMessage(message, targetLines, settings.siteId, applyBuffer),
    )
    commTrack = trackCommFromMessage(message, targetLines, commTrack)

    const nextState: Partial<SemiCnvState> = {
      unitStatuses: applyBuffer.unitStatuses,
      unitRuntime: applyBuffer.unitRuntime,
      allCvRuntime: applyBuffer.allCvRuntime,
      lineRuntime: applyBuffer.lineRuntime,
      liveAlarms: applyBuffer.liveAlarms,
      siteStatus: markStaleSites(commTrack.sites),
      lineCommRecords: commTrack.lines,
      isLive: true,
    }

    if (message.type === 'IO_STATUS') {
      const d = message.data as import('../types/semicnv').SemiCnvIOStatusData
      nextState.ioStatus = {
        safetyOk: d.safetyOk,
        safetyConditions: d.safetyConditions,
        autoConditionOk: d.autoConditionOk,
        autoConditions: d.autoConditions,
        currentStatus: d.currentStatus,
        programStatus: d.programStatus,
        updatedAt: new Date().toISOString(),
      }
    }

    set(nextState)

    applyToMonitorStore(applyBuffer)

    if (message.type === 'ALARM_EVENT') {
      const alarmData = message.data as import('../types/semicnv').SemiCnvAlarmEventData
      if (alarmData.eventType === 'OCCUR') {
        const matched = lines
          .flatMap((line) => line.units.map((unit) => ({ line, unit })))
          .find(({ unit }) => unit.semiCnvId === alarmData.conveyorId)

        void useConveyorStore.getState().addHistory({
          unitId: matched?.unit.id ?? 'semicnv-system',
          lineId: matched?.line.id ?? lines[0]?.id ?? 'global',
          eventType: 'error',
          message: alarmData.message,
        })
      }
    }
  }

  return {
    settings: { ...DEFAULT_SEMICNV_SETTINGS },
    connectionState: 'disconnected',
    siteStatus: {},
    lineCommRecords: {},
    commTick: 0,
    unitStatuses: {},
    unitRuntime: {},
    allCvRuntime: {},
    lineRuntime: {},
    ioStatus: null,
    liveAlarms: [],
    v3Logs: [],
    isLive: false,

    configure: (partial) => {
      set({ settings: { ...get().settings, ...partial } })
    },

    refreshCommStale: () => {
      set((state) => ({
        siteStatus: markStaleSites(state.siteStatus),
        commTick: state.commTick + 1,
      }))
    },

    connect: () => {
      const { settings } = get()
      if (!settings.enabled) return

      get().disconnect()
      applyBuffer = createEmptyApplyResult()
      commTrack = createEmptyCommTrackState()

      startCommStaleTimer(() => get().refreshCommStale())

      if (settings.mockMode) {
        mockFeed = new SemiCnvMockFeed((message) => {
          processMessage(message)
        })
        mockFeed.start()
        set({ connectionState: 'connected', isLive: true })
        return
      }

      // 라인별 semiCnvWsUrl 수집 → 전역 URL과 합쳐 중복 제거
      const lines = useConveyorStore.getState().lines
      const urlSet = new Set<string>([settings.wsUrl])
      for (const line of lines) {
        if (line.semiCnvWsUrl?.trim()) urlSet.add(line.semiCnvWsUrl.trim())
      }

      let anyConnected = false

      for (const url of urlSet) {
        if (clients.has(url)) continue  // 이미 연결됨

        const capturedUrl = url
        const c = new SemiCnvClient({
          onMessage: (message) => processMessage(message, capturedUrl),
          onStateChange: (state) => {
            // 클라이언트별 currentState 기준으로 전체 상태 결정
            const anyConnected = [...clients.values()].some(
              (cl) => cl.currentState === 'connected',
            )
            const anyConnecting = [...clients.values()].some(
              (cl) => cl.currentState === 'connecting',
            )
            const nextConn = anyConnected
              ? 'connected'
              : anyConnecting
              ? 'connecting'
              : state  // 마지막 상태 그대로

            set({ connectionState: nextConn })

            // 모든 클라이언트가 끊겼을 때만 런타임 초기화
            if (state === 'disconnected') {
              const allDisconnected = [...clients.values()].every(
                (cl) => cl.currentState === 'disconnected',
              )
              if (allDisconnected) {
                set(clearRuntime())
                applyBuffer = createEmptyApplyResult()
                commTrack = createEmptyCommTrackState()
              }
            }
          },
        })
        c.connect(url)
        clients.set(url, c)
        anyConnected = true
      }

      if (anyConnected) set({ connectionState: 'connecting' })
    },

    disconnect: () => {
      stopCommStaleTimer()
      mockFeed?.stop()
      mockFeed = null
      for (const c of clients.values()) c.disconnect()
      clients.clear()
      applyBuffer = createEmptyApplyResult()
      commTrack = createEmptyCommTrackState()
      set({
        connectionState: 'disconnected',
        ...clearRuntime(),
      })
    },

    handleMessage: (message) => {
      processMessage(message)
    },

    sendCommand: (cmd, extra = {}) => {
      const payload = { data: { cmd, ...extra } }
      for (const c of clients.values()) {
        c.sendCommand(payload)
      }
    },
  }
})
