import { MAX_HISTORY_RECORDS, STORAGE_KEYS } from '../constants/storage'
import type {
  AppSettings,
  ConveyorLine,
  HistoryFilter,
  HistoryRecord,
} from '../types/conveyor'
import { normalizeLine } from '../constants/conveyorTypes'
import type { StorageAdapter } from './StorageAdapter'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function matchesFilter(record: HistoryRecord, filter?: HistoryFilter): boolean {
  if (!filter) return true
  if (filter.lineId && record.lineId !== filter.lineId) return false
  if (filter.unitId && record.unitId !== filter.unitId) return false
  if (filter.eventType && record.eventType !== filter.eventType) return false
  if (filter.from && record.timestamp < filter.from) return false
  if (filter.to && record.timestamp > filter.to) return false
  return true
}

export class LocalStorageAdapter implements StorageAdapter {
  async getLines(): Promise<ConveyorLine[]> {
    const lines = readJson<ConveyorLine[]>(STORAGE_KEYS.lines, [])
    return lines.map((line) => normalizeLine(line))
  }

  async saveLine(line: ConveyorLine): Promise<void> {
    const lines = await this.getLines()
    const index = lines.findIndex((item) => item.id === line.id)
    const next =
      index >= 0
        ? lines.map((item, i) => (i === index ? line : item))
        : [...lines, line]
    writeJson(STORAGE_KEYS.lines, next)
  }

  async deleteLine(id: string): Promise<void> {
    const lines = await this.getLines()
    writeJson(
      STORAGE_KEYS.lines,
      lines.filter((line) => line.id !== id),
    )
  }

  async getHistory(filter?: HistoryFilter): Promise<HistoryRecord[]> {
    const history = readJson<HistoryRecord[]>(STORAGE_KEYS.history, [])
    return history
      .filter((record) => matchesFilter(record, filter))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    const history = readJson<HistoryRecord[]>(STORAGE_KEYS.history, [])
    const next = [record, ...history].slice(0, MAX_HISTORY_RECORDS)
    writeJson(STORAGE_KEYS.history, next)
  }

  async getSettings(): Promise<AppSettings> {
    return readJson<AppSettings>(STORAGE_KEYS.settings, {})
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const current = await this.getSettings()
    writeJson(STORAGE_KEYS.settings, { ...current, ...settings })
  }
}
