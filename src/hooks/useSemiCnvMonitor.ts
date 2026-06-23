import { useEffect, useMemo } from 'react'
import { DEFAULT_SEMICNV_SETTINGS } from '../constants/semicnv'
import { mergeLiveLine, mergeLiveLines } from '../semicnv/mergeLiveLine'
import { useConveyorStore } from '../store/useConveyorStore'
import { useSemiCnvStore } from '../store/useSemiCnvStore'
import type { ConveyorLine } from '../types/conveyor'

/** App 전역 Semi C/V WebSocket 연동 — settings.semiCnv 기준 자동 connect/disconnect */
export function useSemiCnvMonitor(): void {
  const settings = useConveyorStore((s) => s.settings.semiCnv)
  const configure = useSemiCnvStore((s) => s.configure)
  const connect = useSemiCnvStore((s) => s.connect)
  const disconnect = useSemiCnvStore((s) => s.disconnect)

  const mergedSettings = {
    ...DEFAULT_SEMICNV_SETTINGS,
    ...settings,
  }

  useEffect(() => {
    configure(mergedSettings)
    if (mergedSettings.enabled) {
      connect()
    } else {
      disconnect()
    }
    return () => disconnect()
  }, [
    mergedSettings.enabled,
    mergedSettings.wsUrl,
    mergedSettings.mockMode,
    mergedSettings.siteId,
    configure,
    connect,
    disconnect,
  ])
}

export function useLiveLine(line: ConveyorLine): ConveyorLine {
  const unitStatuses = useSemiCnvStore((s) => s.unitStatuses)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const isLive = useSemiCnvStore((s) => s.isLive)

  return useMemo(() => {
    if (!isLive) return line
    return mergeLiveLine(line, unitStatuses, unitRuntime)
  }, [line, isLive, unitStatuses, unitRuntime])
}

export function useLiveLines(lines: ConveyorLine[]): ConveyorLine[] {
  const unitStatuses = useSemiCnvStore((s) => s.unitStatuses)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const isLive = useSemiCnvStore((s) => s.isLive)

  if (!isLive) return lines
  return mergeLiveLines(lines, unitStatuses, unitRuntime)
}

export function useSemiCnvLiveEnabled(): boolean {
  const enabled = useConveyorStore((s) => s.settings.semiCnv?.enabled ?? false)
  const isLive = useSemiCnvStore((s) => s.isLive)
  return enabled && isLive
}
