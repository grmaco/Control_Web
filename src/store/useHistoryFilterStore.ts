import { create } from 'zustand'
import type { LogLevel } from '../utils/logHistory'

/**
 * 이력 화면 필터 — 화면 전환 후 다시 돌아와도 유지되도록 컴포넌트 밖(모듈
 * 스코프)에 보관. 새로고침·재로그인까지 유지할 필요는 없어 localStorage에는
 * 저장하지 않음(SPA 네비게이션 동안만 유지).
 */
interface HistoryFilterState {
  lineFilter: string
  logTypeFilter: string
  logLevelFilter: LogLevel | ''
  dateFrom: string
  dateTo: string
  setLineFilter: (value: string) => void
  setLogTypeFilter: (value: string) => void
  setLogLevelFilter: (value: LogLevel | '') => void
  setDateRange: (from: string, to: string) => void
  resetFilters: () => void
}

export const useHistoryFilterStore = create<HistoryFilterState>((set) => ({
  lineFilter: '',
  logTypeFilter: '',
  logLevelFilter: '',
  dateFrom: '',
  dateTo: '',
  setLineFilter: (lineFilter) => set({ lineFilter }),
  setLogTypeFilter: (logTypeFilter) => set({ logTypeFilter }),
  setLogLevelFilter: (logLevelFilter) => set({ logLevelFilter }),
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo }),
  resetFilters: () =>
    set({
      lineFilter: '',
      logTypeFilter: '',
      logLevelFilter: '',
      dateFrom: '',
      dateTo: '',
    }),
}))
