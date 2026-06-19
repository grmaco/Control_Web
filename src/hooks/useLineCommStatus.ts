import { useMemo, useState, useEffect } from 'react'
import {
  resolveAllLineCommStatuses,
  resolveLineCommStatus,
} from '../semicnv/lineCommStatus'
import { useSemiCnvStore } from '../store/useSemiCnvStore'
import type { ConveyorLine } from '../types/conveyor'
import type { SemiCnvLineCommStatus } from '../types/semicnv'

export function useLineCommStatus(line: ConveyorLine | null): SemiCnvLineCommStatus | null {
  const enabled = useSemiCnvStore((s) => s.settings.enabled)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const siteStatus = useSemiCnvStore((s) => s.siteStatus)
  const lineCommRecords = useSemiCnvStore((s) => s.lineCommRecords)
  const commTick = useSemiCnvStore((s) => s.commTick)

  return useMemo(() => {
    if (!line) return null
    return resolveLineCommStatus(line, {
      enabled,
      connectionState,
      sites: siteStatus,
      lineRecords: lineCommRecords,
    })
  }, [line, enabled, connectionState, siteStatus, lineCommRecords, commTick])
}

export function useLineCommStatuses(lines: ConveyorLine[]): Record<string, SemiCnvLineCommStatus> {
  const enabled = useSemiCnvStore((s) => s.settings.enabled)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const siteStatus = useSemiCnvStore((s) => s.siteStatus)
  const lineCommRecords = useSemiCnvStore((s) => s.lineCommRecords)
  const commTick = useSemiCnvStore((s) => s.commTick)

  return useMemo(
    () =>
      resolveAllLineCommStatuses(lines, {
        enabled,
        connectionState,
        sites: siteStatus,
        lineRecords: lineCommRecords,
      }),
    [lines, enabled, connectionState, siteStatus, lineCommRecords, commTick],
  )
}

export function useSemiCnvCommSummary(lines: ConveyorLine[]): {
  onlineLines: number
  totalLines: number
  onlineSites: number
  totalSites: number
} {
  const commByLineId = useLineCommStatuses(lines)
  const siteStatus = useSemiCnvStore((s) => s.siteStatus)
  const commTick = useSemiCnvStore((s) => s.commTick)

  return useMemo(() => {
    const statuses = Object.values(commByLineId)
    const onlineLines = statuses.filter((item) => item.state === 'online').length
    const sites = Object.values(siteStatus)
    const onlineSites = sites.filter((site) => site.online).length
    return {
      onlineLines,
      totalLines: lines.length,
      onlineSites,
      totalSites: sites.length,
    }
  }, [commByLineId, siteStatus, lines.length, commTick])
}

/** commTick 갱신용 — 라인별 stale 표시가 1초 단위로 반영되도록 */
export function useCommStaleRefresh(): void {
  const enabled = useSemiCnvStore((s) => s.settings.enabled)
  const refreshCommStale = useSemiCnvStore((s) => s.refreshCommStale)
  const [, setLocalTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setLocalTick((value) => value + 1), 1000)
    return () => clearInterval(id)
  }, [enabled, refreshCommStale])
}
