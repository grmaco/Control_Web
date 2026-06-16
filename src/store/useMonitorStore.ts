import { create } from 'zustand'
import { STORAGE_KEYS } from '../constants/storage'

interface LineControlState {
  powerOn: boolean
  autoRun: boolean
}

interface MonitorState {
  etherCatConnected: boolean
  lineControls: Record<string, LineControlState>
  initialize: () => void
  toggleEtherCat: () => void
  toggleAllPower: (lineId: string) => void
  setAllAutoRun: (lineId: string) => void
  getLineControl: (lineId: string) => LineControlState
}

interface PersistedMonitorState {
  etherCatConnected: boolean
  lineControls: Record<string, LineControlState>
}

function readPersisted(): PersistedMonitorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.monitor)
    if (!raw) return { etherCatConnected: false, lineControls: {} }
    return JSON.parse(raw) as PersistedMonitorState
  } catch {
    return { etherCatConnected: false, lineControls: {} }
  }
}

function persist(state: PersistedMonitorState): void {
  localStorage.setItem(STORAGE_KEYS.monitor, JSON.stringify(state))
}

const defaultLineControl = (): LineControlState => ({
  powerOn: false,
  autoRun: false,
})

export const useMonitorStore = create<MonitorState>((set, get) => ({
  etherCatConnected: false,
  lineControls: {},

  initialize: () => {
    const saved = readPersisted()
    set({
      etherCatConnected: saved.etherCatConnected,
      lineControls: saved.lineControls,
    })
  },

  toggleEtherCat: () => {
    const etherCatConnected = !get().etherCatConnected
    set({ etherCatConnected })
    persist({
      etherCatConnected,
      lineControls: get().lineControls,
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
      etherCatConnected: get().etherCatConnected,
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
      etherCatConnected: get().etherCatConnected,
      lineControls,
    })
  },
}))
