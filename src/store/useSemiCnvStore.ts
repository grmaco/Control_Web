import { create } from 'zustand'
import { DEFAULT_SEMICNV_SETTINGS } from '../constants/semicnv'
import type { ConveyorStatus } from '../types/conveyor'
import type {
  SemiCnvConnectionState,
  SemiCnvLineCommRecord,
  SemiCnvLineRuntime,
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

interface SemiCnvState {
  settings: SemiCnvMonitorSettings
  connectionState: SemiCnvConnectionState
  siteStatus: Record<string, SemiCnvSiteStatus>
  lineCommRecords: Record<string, SemiCnvLineCommRecord>
  commTick: number
  unitStatuses: Record<string, ConveyorStatus>
  unitRuntime: Record<string, SemiCnvUnitRuntime>
  lineRuntime: Record<string, SemiCnvLineRuntime>
  liveAlarms: AlarmEntry[]
  isLive: boolean

  configure: (settings: Partial<SemiCnvMonitorSettings>) => void
  connect: () => void
  disconnect: () => void
  handleMessage: (message: SemiCnvMessage) => void
  refreshCommStale: () => void
}

let client: SemiCnvClient | null = null
let mockFeed: SemiCnvMockFeed | null = null
let commStaleTimer: ReturnType<typeof setInterval> | null = null

function mergeApplyResult(
  prev: SemiCnvApplyResult,
  next: SemiCnvApplyResult,
): SemiCnvApplyResult {
  return {
    unitStatuses: { ...prev.unitStatuses, ...next.unitStatuses },
    unitRuntime: { ...prev.unitRuntime, ...next.unitRuntime },
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
    lineRuntime: {},
    liveAlarms: [],
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

  const processMessage = (message: SemiCnvMessage) => {
    const lines = useConveyorStore.getState().lines
    applyBuffer = mergeApplyResult(
      applyBuffer,
      applySemiCnvMessage(message, lines, get().settings.siteId, applyBuffer),
    )
    commTrack = trackCommFromMessage(message, lines, commTrack)

    set({
      unitStatuses: applyBuffer.unitStatuses,
      unitRuntime: applyBuffer.unitRuntime,
      lineRuntime: applyBuffer.lineRuntime,
      liveAlarms: applyBuffer.liveAlarms,
      siteStatus: markStaleSites(commTrack.sites),
      lineCommRecords: commTrack.lines,
      isLive: true,
    })

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
    lineRuntime: {},
    liveAlarms: [],
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
          get().handleMessage(message)
        })
        mockFeed.start()
        set({ connectionState: 'connected', isLive: true })
        return
      }

      client = new SemiCnvClient({
        onMessage: (message) => get().handleMessage(message),
        onStateChange: (connectionState) => {
          set({ connectionState })
          if (connectionState === 'disconnected') {
            set(clearRuntime())
            applyBuffer = createEmptyApplyResult()
            commTrack = createEmptyCommTrackState()
          }
        },
      })
      client.connect(settings.wsUrl)
    },

    disconnect: () => {
      stopCommStaleTimer()
      mockFeed?.stop()
      mockFeed = null
      client?.disconnect()
      client = null
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
  }
})
