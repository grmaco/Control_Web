import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { MonitorCanvas } from '../components/monitor/MonitorCanvas'
import { STATUS_COLORS } from '../constants/statusColors'
import { useLiveLine } from '../hooks/useSemiCnvMonitor'
import { useConveyorStore } from '../store/useConveyorStore'

export function MonitorPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const selectedLine = lines.find((line) => line.id === selectedLineId)
  const liveLine = useLiveLine(
    selectedLine ?? {
      id: '',
      name: '',
      gridSize: { cols: 0, rows: 0 },
      units: [],
      createdAt: '',
      updatedAt: '',
    },
  )

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">모니터링</h2>
        <LineSelectorPanel />
      </div>

      {!selectedLine ? (
        <EmptyPanel message="표시할 라인이 없습니다. 라인 빌더에서 라인을 구성하세요." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <span key={status} className="flex items-center gap-1.5 text-slate-400">
                <span className={`h-3 w-3 rounded-sm ${colors.bg}`} />
                {colors.label}
              </span>
            ))}
          </div>

          <MonitorCanvas line={liveLine} />
        </>
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
