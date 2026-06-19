import type { SemiCnvMonitorSettings } from '../types/semicnv'

export const SEMICNV_HEARTBEAT_TIMEOUT_MS = 15_000
export const SEMICNV_RECONNECT_INITIAL_MS = 1_000
export const SEMICNV_RECONNECT_MAX_MS = 30_000

export const DEFAULT_SEMICNV_WS_URL =
  import.meta.env.VITE_SEMICNV_WS_URL ?? 'ws://localhost:8765/ws/dashboard'

export const DEFAULT_SEMICNV_SETTINGS: SemiCnvMonitorSettings = {
  enabled: import.meta.env.VITE_SEMICNV_ENABLED === 'true',
  wsUrl: DEFAULT_SEMICNV_WS_URL,
  mockMode: import.meta.env.VITE_SEMICNV_MOCK === 'true',
}
