import { useMemo } from 'react'
import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { EmptyPanel, PageHeader, PageState } from '../components/common/PageUi'
import { LineV3UrlSetting } from '../components/monitor/LineV3UrlSetting'
import { MonitorTabView } from '../components/monitor/MonitorTabView'
import { useLiveLines } from '../hooks/useSemiCnvMonitor'
import { useConveyorStore } from '../store/useConveyorStore'

export function LineStatusPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const liveLines = useLiveLines(lines)

  const selectedLine = useMemo(
    () => liveLines.find((line) => line.id === selectedLineId),
    [liveLines, selectedLineId],
  )

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="라인 현황"
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {selectedLine && <LineV3UrlSetting line={selectedLine} />}
            <LineSelectorPanel selectOnly />
          </div>
        }
      />

      {!selectedLine ? (
        <EmptyPanel message="표시할 라인이 없습니다. 라인 빌더에서 라인을 구성하세요." />
      ) : (
        <MonitorTabView
          line={selectedLine}
          lines={liveLines}
          selectedLineId={selectedLineId}
        />
      )}
    </div>
  )
}
