import { LineSelectorPanel, useInitializeStore } from '../components/common/LineSelector'
import { LineBuilder } from '../components/builder/LineBuilder'
import { MAX_UNITS } from '../constants/grid'
import { useConveyorStore } from '../store/useConveyorStore'

export function BuilderPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const saveLine = useConveyorStore((s) => s.saveLine)
  const selectedLine = lines.find((line) => line.id === selectedLineId)

  if (isLoading) {
    return <Placeholder message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <Placeholder message={error} error />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">라인 빌더</h2>
          <p className="mt-1 text-sm text-slate-400">
            16×8 그리드 · 최대 {MAX_UNITS}개 유닛 · 드래그로 배치 · R키 회전
          </p>
        </div>
        <LineSelectorPanel />
      </div>

      {!selectedLine ? (
        <Placeholder message="편집할 라인을 선택하거나 새 라인을 만드세요." />
      ) : (
        <LineBuilder line={selectedLine} onSave={saveLine} />
      )}
    </div>
  )
}

function Placeholder({ message, error }: { message: string; error?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-12 text-center text-sm ${
        error
          ? 'border-red-900 bg-red-950/30 text-red-300'
          : 'border-slate-800 bg-slate-900 text-slate-400'
      }`}
    >
      {message}
    </div>
  )
}
