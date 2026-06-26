export const STORAGE_KEYS = {
  lines: 'conveyor.lines',
  history: 'conveyor.history',
  alarmHistory: 'conveyor.alarmHistory',
  settings: 'conveyor.settings',
  monitor: 'conveyor.monitor',
  authSession: 'conveyor.auth.session',
} as const

export const MAX_HISTORY_RECORDS = 1000
export const MAX_ALARM_HISTORY_RECORDS = 500
