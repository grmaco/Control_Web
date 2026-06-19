import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { formatLastReceived } from '../../semicnv/lineCommStatus'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { SemiCnvConnectionState } from '../../types/semicnv'
import { LineCommIndicator } from './LineCommIndicator'

const SERVER_STATE_LABEL: Record<SemiCnvConnectionState, string> = {
  disconnected: '연결 끊김',
  connecting: '연결 중…',
  connected: '연결됨',
  error: '오류',
}

const SERVER_STATE_COLOR: Record<SemiCnvConnectionState, string> = {
  disconnected: 'bg-slate-600',
  connecting: 'bg-amber-500 animate-pulse',
  connected: 'bg-emerald-500',
  error: 'bg-red-500',
}

export function SemiCnvConnectionBar() {
  const settings = useSemiCnvStore((s) => s.settings)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const siteStatus = useSemiCnvStore((s) => s.siteStatus)
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? null
  const comm = useLineCommStatus(selectedLine)

  if (!settings.enabled) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-slate-500"
        title="Semi C/V 연동 비활성 — settings.semiCnv.enabled 또는 VITE_SEMICNV_ENABLED=true"
      >
        <span className="h-2 w-2 rounded-full bg-slate-700" />
        Semi C/V · 로컬
      </div>
    )
  }

  const site = comm?.siteId ? siteStatus[comm.siteId] : null
  const siteOnline = site?.online ?? false

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
      <span
        className="flex items-center gap-1.5"
        title={`관제 서버 WebSocket · ${SERVER_STATE_LABEL[connectionState]}`}
      >
        <span className={`h-2 w-2 rounded-full ${SERVER_STATE_COLOR[connectionState]}`} />
        서버 · {SERVER_STATE_LABEL[connectionState]}
        {settings.mockMode ? ' (Mock)' : ''}
      </span>

      {!selectedLine ? (
        <span className="text-slate-500">라인 미선택</span>
      ) : comm ? (
        <>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="font-medium">{selectedLine.name}</span>
            <LineCommIndicator comm={comm} compact />
          </span>

          {comm.siteId ? (
            <span
              className={siteOnline ? 'text-emerald-400' : 'text-red-400'}
              title={
                comm.lastMessageAt
                  ? `마지막 수신: ${formatLastReceived(comm.lastMessageAt)}`
                  : undefined
              }
            >
              현장 {siteOnline ? 'Online' : 'Offline'}
              {comm.siteName || comm.siteId ? ` · ${comm.siteName ?? comm.siteId}` : ''}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
