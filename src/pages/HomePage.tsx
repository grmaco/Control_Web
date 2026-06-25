import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { MonitorDashboard } from '../components/monitor/MonitorDashboard'
import { useLiveLines } from '../hooks/useSemiCnvMonitor'
import { useConveyorStore } from '../store/useConveyorStore'

export function HomePage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const liveLines = useLiveLines(lines)
  const selectedLine = liveLines.find((line) => line.id === selectedLineId)

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">주화면</h2>
        <LineSelectorPanel selectOnly />
      </div>

      {!selectedLine ? (
        <EmptyPanel message="표시할 라인이 없습니다. 라인 빌더에서 라인을 구성하세요." />
      ) : (
        <MonitorDashboard
          line={selectedLine}
          lines={liveLines}
          selectedLineId={selectedLineId}
        />
      )}
    </div>
  )
}

function PageState({
  message,
  variant = 'default',
}: {
  message: string
  variant?: 'default' | 'error'
}) {
  return (
    <div
      className={`rounded-lg border p-8 text-center text-sm ${
        variant === 'error'
          ? 'border-red-900 bg-red-950/30 text-red-300'
          : 'border-slate-800 bg-slate-900 text-slate-400'
      }`}
    >
      {message}
    </div>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-400">
      {message}
    </div>
  )
}
