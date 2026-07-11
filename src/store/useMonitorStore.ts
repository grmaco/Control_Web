import { create } from 'zustand'
import { STORAGE_KEYS } from '../constants/storage'
import { persistMainPowerOffHistory } from '../utils/persistAlarmHistory'
import { useConveyorStore } from './useConveyorStore'

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
  /** 모니터 콜아웃 표 위치 (unitId → 그리드 px) */
  calloutPositions?: Record<string, { panelX: number; panelY: number }>
  /** 더블클릭으로 숨긴 콜아웃 unitId 목록 */
  hiddenCalloutIds?: string[]
}

interface PersistedMonitorState {
  etherCatConnected: boolean
  lineControls: Record<string, LineControlState>
  lineViews: Record<string, MonitorViewTransform>
  lastMonitorLineId: string | null
  /** 적재창고(STK) 제외 모듈 이름 숨김 */
  hideModuleNames: boolean
}

interface MonitorState {
  etherCatConnected: boolean
  /** EtherCAT/메인 전원 OFF 최초 감지 시각 (ALARM HISTORY용) */
  etherCatOffSince: string | null
  lineControls: Record<string, LineControlState>
  lineViews: Record<string, MonitorViewTransform>
  /** 모니터링 화면 전용 선택 라인 */
  monitorLineId: string | null
  hideModuleNames: boolean
  hasHydrated: boolean
  initialize: () => void
  resolveMonitorLine: (lineIds: string[], fallbackLineId: string | null) => void
  selectMonitorLine: (lineId: string | null) => void
  getLineView: (lineId: string) => MonitorViewTransform | null
  saveLineView: (lineId: string, view: MonitorViewTransform) => void
  saveCalloutPositions: (
    lineId: string,
    layoutSignature: string,
    positions: Record<string, { panelX: number; panelY: number }>,
  ) => void
  saveHiddenCalloutIds: (
    lineId: string,
    layoutSignature: string,
    hiddenIds: string[],
  ) => void
  toggleHideModuleNames: () => void
  toggleEtherCat: () => void
  toggleAllPower: (lineId: string) => void
  setAllPower: (lineId: string, powerOn: boolean) => void
  setAllAutoRun: (lineId: string) => void
  stopAllAutoRun: (lineId: string) => void
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
        hideModuleNames: false,
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedMonitorState>
    return {
      etherCatConnected: parsed.etherCatConnected ?? false,
      lineControls: parsed.lineControls ?? {},
      lineViews: parsed.lineViews ?? {},
      lastMonitorLineId: parsed.lastMonitorLineId ?? null,
      hideModuleNames: parsed.hideModuleNames ?? false,
    }
  } catch {
    return {
      etherCatConnected: false,
      lineControls: {},
      lineViews: {},
      lastMonitorLineId: null,
      hideModuleNames: false,
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
    hideModuleNames: state.hideModuleNames,
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
  etherCatOffSince: null,
  lineControls: {},
  lineViews: {},
  monitorLineId: null,
  hideModuleNames: false,
  hasHydrated: false,

  initialize: () => {
    if (get().hasHydrated) return
    const saved = readPersisted()
    set({
      hasHydrated: true,
      etherCatConnected: saved.etherCatConnected,
      etherCatOffSince: null,
      lineControls: saved.lineControls,
      lineViews: saved.lineViews,
      monitorLineId: saved.lastMonitorLineId,
      hideModuleNames: saved.hideModuleNames,
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
      ...snapshot(next),
      lastMonitorLineId: nextLineId,
    })
  },

  selectMonitorLine: (lineId) => {
    set({ monitorLineId: lineId })
    const next = get()
    persist({
      ...snapshot(next),
      lastMonitorLineId: lineId,
    })
  },

  getLineView: (lineId) => get().lineViews[lineId] ?? null,

  saveLineView: (lineId, view) => {
    const existing = get().lineViews[lineId]
    const lineViews = {
      ...get().lineViews,
      [lineId]: { ...existing, ...view },
    }
    set({ lineViews })
    const next = get()
    persist({
      etherCatConnected: next.etherCatConnected,
      lineControls: next.lineControls,
      lineViews,
      lastMonitorLineId: next.monitorLineId,
      hideModuleNames: next.hideModuleNames,
    })
  },

  saveCalloutPositions: (lineId, layoutSignature, positions) => {
    const existing = get().lineViews[lineId]
    get().saveLineView(lineId, {
      scale: existing?.scale ?? 1,
      positionX: existing?.positionX ?? 0,
      positionY: existing?.positionY ?? 0,
      layoutSignature,
      calloutPositions: positions,
    })
  },

  saveHiddenCalloutIds: (lineId, layoutSignature, hiddenIds) => {
    const existing = get().lineViews[lineId]
    get().saveLineView(lineId, {
      scale: existing?.scale ?? 1,
      positionX: existing?.positionX ?? 0,
      positionY: existing?.positionY ?? 0,
      layoutSignature,
      hiddenCalloutIds: hiddenIds,
    })
  },

  toggleHideModuleNames: () => {
    const hideModuleNames = !get().hideModuleNames
    set({ hideModuleNames })
    persist({
      ...snapshot(get()),
      hideModuleNames,
    })
  },

  toggleEtherCat: () => {
    const prevConnected = get().etherCatConnected
    const etherCatConnected = !prevConnected
    const etherCatOffSince = etherCatConnected
      ? null
      : (get().etherCatOffSince ?? new Date().toISOString())
    set({ etherCatConnected, etherCatOffSince })
    if (!etherCatConnected && etherCatOffSince) {
      persistMainPowerOffHistory(useConveyorStore.getState().lines, etherCatOffSince)
    }
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

  setAllPower: (lineId, powerOn) => {
    const current = get().getLineControl(lineId)
    const lineControls = {
      ...get().lineControls,
      [lineId]: { ...current, powerOn },
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

  stopAllAutoRun: (lineId) => {
    const current = get().getLineControl(lineId)
    const lineControls = {
      ...get().lineControls,
      [lineId]: { ...current, autoRun: false },
    }
    set({ lineControls })
    persist({
      ...snapshot(get()),
      lineControls,
    })
  },
}))
