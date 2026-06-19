import { create } from 'zustand'
import { STORAGE_KEYS } from '../constants/storage'

interface LineControlState {
  powerOn: boolean
  autoRun: boolean
}

export interface MonitorViewTransform {
  scale: number
  positionX: number
  positionY: number
  /** 라인 배치 시그니처 — 배치 변경 시에만 뷰 무효화 */
  layoutSignature?: string
  /** @deprecated layoutSignature 사용 */
  lineUpdatedAt?: string
}

interface PersistedMonitorState {
  etherCatConnected: boolean
  lineControls: Record<string, LineControlState>
  lineViews: Record<string, MonitorViewTransform>
  lastMonitorLineId: string | null
}

interface MonitorState {
  etherCatConnected: boolean
  lineControls: Record<string, LineControlState>
  lineViews: Record<string, MonitorViewTransform>
  /** 모니터링 화면 전용 선택 라인 */
  monitorLineId: string | null
  hasHydrated: boolean
  initialize: () => void
  resolveMonitorLine: (lineIds: string[], fallbackLineId: string | null) => void
  selectMonitorLine: (lineId: string | null) => void
  getLineView: (lineId: string) => MonitorViewTransform | null
  saveLineView: (lineId: string, view: MonitorViewTransform) => void
  toggleEtherCat: () => void
  toggleAllPower: (lineId: string) => void
  setAllAutoRun: (lineId: string) => void
  getLineControl: (lineId: string) => LineControlState
}

function readPersisted(): PersistedMonitorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.monitor)
    if (!raw) {
      return {
        etherCatConnected: false,
        lineControls: {},
        lineViews: {},
        lastMonitorLineId: null,
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedMonitorState>
    return {
      etherCatConnected: parsed.etherCatConnected ?? false,
      lineControls: parsed.lineControls ?? {},
      lineViews: parsed.lineViews ?? {},
      lastMonitorLineId: parsed.lastMonitorLineId ?? null,
    }
  } catch {
    return {
      etherCatConnected: false,
      lineControls: {},
      lineViews: {},
      lastMonitorLineId: null,
    }
  }
}

function persist(state: PersistedMonitorState): void {
  localStorage.setItem(STORAGE_KEYS.monitor, JSON.stringify(state))
}

function snapshot(state: MonitorState): PersistedMonitorState {
  return {
    etherCatConnected: state.etherCatConnected,
    lineControls: state.lineControls,
    lineViews: state.lineViews,
    lastMonitorLineId: state.monitorLineId,
  }
}

const defaultLineControl = (): LineControlState => ({
  powerOn: false,
  autoRun: false,
})

function pickMonitorLineId(
  lineIds: string[],
  savedLineId: string | null,
  fallbackLineId: string | null,
): string | null {
  if (savedLineId && lineIds.includes(savedLineId)) return savedLineId
  if (fallbackLineId && lineIds.includes(fallbackLineId)) return fallbackLineId
  return lineIds[0] ?? null
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  etherCatConnected: false,
  lineControls: {},
  lineViews: {},
  monitorLineId: null,
  hasHydrated: false,

  initialize: () => {
    if (get().hasHydrated) return
    const saved = readPersisted()
    set({
      hasHydrated: true,
      etherCatConnected: saved.etherCatConnected,
      lineControls: saved.lineControls,
      lineViews: saved.lineViews,
      monitorLineId: saved.lastMonitorLineId,
    })
  },

  resolveMonitorLine: (lineIds, fallbackLineId) => {
    const state = get()
    const saved = readPersisted()
    const nextLineId = pickMonitorLineId(
      lineIds,
      state.monitorLineId ?? saved.lastMonitorLineId,
      fallbackLineId,
    )
    if (nextLineId === state.monitorLineId) return
    set({ monitorLineId: nextLineId })
    const next = get()
    persist({
      etherCatConnected: next.etherCatConnected,
      lineControls: next.lineControls,
      lineViews: next.lineViews,
      lastMonitorLineId: nextLineId,
    })
  },

  selectMonitorLine: (lineId) => {
    set({ monitorLineId: lineId })
    const next = get()
    persist({
      etherCatConnected: next.etherCatConnected,
      lineControls: next.lineControls,
      lineViews: next.lineViews,
      lastMonitorLineId: lineId,
    })
  },

  getLineView: (lineId) => get().lineViews[lineId] ?? null,

  saveLineView: (lineId, view) => {
    const lineViews = { ...get().lineViews, [lineId]: view }
    set({ lineViews })
    const next = get()
    persist({
      etherCatConnected: next.etherCatConnected,
      lineControls: next.lineControls,
      lineViews,
      lastMonitorLineId: next.monitorLineId,
    })
  },

  toggleEtherCat: () => {
    const etherCatConnected = !get().etherCatConnected
    set({ etherCatConnected })
    persist({
      ...snapshot(get()),
      etherCatConnected,
    })
  },

  getLineControl: (lineId) => {
    return get().lineControls[lineId] ?? defaultLineControl()
  },

  toggleAllPower: (lineId) => {
    const current = get().getLineControl(lineId)
    const lineControls = {
      ...get().lineControls,
      [lineId]: { ...current, powerOn: !current.powerOn },
    }
    set({ lineControls })
    persist({
      ...snapshot(get()),
      lineControls,
    })
  },

  setAllAutoRun: (lineId) => {
    const current = get().getLineControl(lineId)
    const lineControls = {
      ...get().lineControls,
      [lineId]: { ...current, autoRun: true, powerOn: true },
    }
    set({ lineControls })
    persist({
      ...snapshot(get()),
      lineControls,
    })
  },
}))
