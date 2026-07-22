import { v4 as uuidv4 } from 'uuid'
import { create } from 'zustand'
import { DEFAULT_GRID_SIZE } from '../constants/grid'
import { storage } from '../storage'
import {
  APPLICATION_UNIT_ID,
  GLOBAL_LINE_ID,
  type ApplicationLogInput,
} from '../utils/applicationLog'
import { applyLineOrder, reorderLineIds, syncLineOrder } from '../utils/lineOrder'
import type { StoredAlarmEntry } from '../utils/alarms'
import type {
  AppSettings,
  ConveyorLine,
  HistoryFilter,
  HistoryRecord,
} from '../types/conveyor'

interface ConveyorState {
  lines: ConveyorLine[]
  history: HistoryRecord[]
  alarmHistory: StoredAlarmEntry[]
  settings: AppSettings
  selectedLineId: string | null
  isLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  selectLine: (lineId: string | null) => Promise<void>
  refreshLines: () => Promise<void>
  saveLine: (line: ConveyorLine) => Promise<void>
  renameLine: (lineId: string, name: string) => Promise<void>
  deleteLine: (lineId: string) => Promise<void>
  createLine: (name: string) => Promise<ConveyorLine>
  fetchHistory: (filter?: HistoryFilter) => Promise<void>
  fetchAlarmHistory: (lineId?: string) => Promise<void>
  appendAlarmHistory: (entry: StoredAlarmEntry) => Promise<void>
  addHistory: (record: Omit<HistoryRecord, 'id' | 'timestamp'>) => Promise<void>
  clearHistory: () => Promise<void>
  logApplication: (input: ApplicationLogInput) => Promise<void>
  updateSettings: (settings: AppSettings) => Promise<void>
  reorderLines: (activeId: string, overId: string) => Promise<void>
}

export const useConveyorStore = create<ConveyorState>((set, get) => ({
  lines: [],
  history: [],
  alarmHistory: [],
  settings: {},
  selectedLineId: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    if (get().lines.length > 0) return

    set({ isLoading: true, error: null })
    try {
      const [lines, history, alarmHistory, settings] = await Promise.all([
        storage.getLines(),
        storage.getHistory(),
        storage.getAlarmHistory(),
        storage.getSettings(),
      ])
      const selectedLineId =
        settings.lastViewedLineId &&
        lines.some((line) => line.id === settings.lastViewedLineId)
          ? settings.lastViewedLineId
          : (lines[0]?.id ?? null)

      set({
        lines: applyLineOrder(lines, settings.lineOrder),
        history,
        alarmHistory,
        settings,
        selectedLineId,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '데이터 로드 실패',
      })
    }
  },

  selectLine: async (lineId) => {
    set({ selectedLineId: lineId })
    const nextSettings = { ...get().settings, lastViewedLineId: lineId ?? undefined }
    await storage.saveSettings(nextSettings)
    set({ settings: nextSettings })
  },

  refreshLines: async () => {
    const lines = await storage.getLines()
    set({ lines: applyLineOrder(lines, get().settings.lineOrder) })
  },

  saveLine: async (line) => {
    await storage.saveLine(line)
    await get().refreshLines()
  },

  renameLine: async (lineId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return

    const line = get().lines.find((item) => item.id === lineId)
    if (!line || line.name === trimmed) return

    await get().saveLine({
      ...line,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    })
  },

  deleteLine: async (lineId) => {
    const { selectedLineId, settings, lines: prevLines } = get()
    await storage.deleteLine(lineId)
    const lines = await storage.getLines()
    const nextOrder = syncLineOrder(settings.lineOrder, prevLines).filter(
      (id) => id !== lineId,
    )
    const nextSettings = { ...settings, lineOrder: nextOrder }
    await storage.saveSettings(nextSettings)
    const nextSelected =
      selectedLineId === lineId ? (lines[0]?.id ?? null) : selectedLineId
    set({
      lines: applyLineOrder(lines, nextOrder),
      settings: nextSettings,
      selectedLineId: nextSelected,
    })
    if (nextSelected !== selectedLineId) {
      await get().selectLine(nextSelected)
    }
  },

  createLine: async (name) => {
    const now = new Date().toISOString()
    const line: ConveyorLine = {
      id: uuidv4(),
      name,
      gridSize: { ...DEFAULT_GRID_SIZE },
      units: [],
      baseUnitId: null,
      createdAt: now,
      updatedAt: now,
    }
    await storage.saveLine(line)
    const allLines = await storage.getLines()
    const nextOrder = syncLineOrder(get().settings.lineOrder, allLines)
    const nextSettings = { ...get().settings, lineOrder: nextOrder }
    await storage.saveSettings(nextSettings)
    set({ lines: applyLineOrder(allLines, nextOrder), settings: nextSettings })
    await get().selectLine(line.id)
    return line
  },

  fetchHistory: async (filter) => {
    const history = await storage.getHistory(filter)
    set({ history })
  },

  fetchAlarmHistory: async (lineId) => {
    const alarmHistory = await storage.getAlarmHistory(lineId)
    set({ alarmHistory })
  },

  appendAlarmHistory: async (entry) => {
    await storage.addAlarmHistory(entry)
    const alarmHistory = await storage.getAlarmHistory()
    set({ alarmHistory })
  },

  addHistory: async (record) => {
    const fullRecord: HistoryRecord = {
      ...record,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    }
    await storage.addHistory(fullRecord)
    await get().fetchHistory()
  },

  clearHistory: async () => {
    await storage.clearHistory()
    set({ history: [] })
  },

  logApplication: async ({ title, comment, lineId }) => {
    await get().addHistory({
      unitId: APPLICATION_UNIT_ID,
      lineId: lineId ?? get().selectedLineId ?? GLOBAL_LINE_ID,
      eventType: 'application',
      logTitle: title,
      message: comment,
    })
  },

  updateSettings: async (settings) => {
    await storage.saveSettings(settings)
    set({ settings: { ...get().settings, ...settings } })
  },

  reorderLines: async (activeId, overId) => {
    const { lines, settings } = get()
    const currentOrder = syncLineOrder(settings.lineOrder, lines)
    const nextOrder = reorderLineIds(currentOrder, activeId, overId)
    if (nextOrder.join() === currentOrder.join()) return

    const nextSettings = { ...settings, lineOrder: nextOrder }
    await storage.saveSettings(nextSettings)
    set({
      settings: nextSettings,
      lines: applyLineOrder(lines, nextOrder),
    })
  },
}))
