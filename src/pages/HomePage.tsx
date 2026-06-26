import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { EmptyPanel, PageHeader, PageState } from '../components/common/PageUi'
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
      <PageHeader title="주화면" action={<LineSelectorPanel selectOnly />} />

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
