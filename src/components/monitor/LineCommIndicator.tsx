import type { SemiCnvLineCommStatus } from '../../types/semicnv'
import {
  COMM_STATE_CLASS,
  COMM_STATE_DOT,
  COMM_STATE_LABEL,
  formatLastReceived,
} from '../../semicnv/lineCommStatus'

interface LineCommIndicatorProps {
  comm: SemiCnvLineCommStatus
  showSite?: boolean
  showLastReceived?: boolean
  compact?: boolean
}

export function LineCommIndicator({
  comm,
  showSite = false,
  showLastReceived = false,
  compact = false,
}: LineCommIndicatorProps) {
  const title = [
    COMM_STATE_LABEL[comm.state],
    comm.siteId ? `Site: ${comm.siteName ?? comm.siteId}` : null,
    comm.lastMessageAt ? `수신: ${formatLastReceived(comm.lastMessageAt)}` : null,
    comm.staleSeconds != null && comm.state === 'offline'
      ? `${comm.staleSeconds}초 전`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5" title={title}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${COMM_STATE_DOT[comm.state]}`} />
        <span className={`text-xs font-medium ${COMM_STATE_CLASS[comm.state]}`}>
          {COMM_STATE_LABEL[comm.state]}
        </span>
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${COMM_STATE_DOT[comm.state]}`} />
        <span className={`font-medium ${COMM_STATE_CLASS[comm.state]}`}>
          {COMM_STATE_LABEL[comm.state]}
        </span>
      </span>
      {showSite && comm.siteId ? (
        <span className="text-[10px] text-slate-500">{comm.siteName ?? comm.siteId}</span>
      ) : null}
      {showLastReceived ? (
        <span className="text-[10px] text-slate-500">
          {formatLastReceived(comm.lastMessageAt)}
        </span>
      ) : null}
    </div>
  )
}
