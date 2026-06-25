import type {
  ConveyorLine,
  HistoryFilter,
  HistoryRecord,
  AppSettings,
} from '../types/conveyor'
import type { StoredAlarmEntry } from '../utils/alarms'

export interface StorageAdapter {
  getLines(): Promise<ConveyorLine[]>
  saveLine(line: ConveyorLine): Promise<void>
  deleteLine(id: string): Promise<void>
  getHistory(filter?: HistoryFilter): Promise<HistoryRecord[]>
  addHistory(record: HistoryRecord): Promise<void>
  getAlarmHistory(lineId?: string): Promise<StoredAlarmEntry[]>
  addAlarmHistory(entry: StoredAlarmEntry): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
}
