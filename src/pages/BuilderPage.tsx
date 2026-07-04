import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { AppCard, EmptyPanel, PageHeader, PageState } from '../components/common/PageUi'
import { LineBuilder } from '../components/builder/LineBuilder'
import { SemiCnvConnectionBar } from '../components/monitor/SemiCnvConnectionBar'
import { MAX_UNITS } from '../constants/grid'
import { useConveyorStore } from '../store/useConveyorStore'

export function BuilderPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const saveLine = useConveyorStore((s) => s.saveLine)
  const semiCnvEnabled = useConveyorStore((s) => s.settings.semiCnv?.enabled ?? false)
  const selectedLine = lines.find((line) => line.id === selectedLineId)

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="라인 빌더"
        subtitle={`배치 영역 중심 작업 화면 · 저장 맵 128×128 · 최대 ${MAX_UNITS.toLocaleString()}개 유닛 · 드래그 배치 · R키 회전`}
        action={<LineSelectorPanel />}
      />

      <AppCard muted className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SemiCnvConnectionBar />
        {semiCnvEnabled && (
          <span className="header-status-chip shrink-0 self-start rounded-lg px-2.5 py-1 text-xs sm:self-center">
            Semi C/V 연동
          </span>
        )}
      </AppCard>

      {!selectedLine ? (
        <EmptyPanel message="편집할 라인을 선택하거나 새 라인을 만드세요." />
      ) : (
        <LineBuilder line={selectedLine} onSave={saveLine} />
      )}
    </div>
  )
}
