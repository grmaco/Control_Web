import { STORAGE_KEYS } from '../constants/storage'
import type { ConveyorLine, HistoryRecord } from '../types/conveyor'

export interface ExportData {
  version: 1
  exportedAt: string
  lines: ConveyorLine[]
  history: HistoryRecord[]
}

export function exportAllData(lines: ConveyorLine[], history: HistoryRecord[]): ExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    lines,
    history,
  }
}

export function downloadJson(data: ExportData, filename?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download =
    filename ?? `conveyor-export-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function parseImportFile(content: string): ExportData {
  const parsed = JSON.parse(content) as ExportData
  if (parsed.version !== 1 || !Array.isArray(parsed.lines) || !Array.isArray(parsed.history)) {
    throw new Error('지원하지 않는 export 파일 형식입니다.')
  }
  return parsed
}

export function applyImportToStorage(data: ExportData): void {
  localStorage.setItem(STORAGE_KEYS.lines, JSON.stringify(data.lines))
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(data.history))
}
