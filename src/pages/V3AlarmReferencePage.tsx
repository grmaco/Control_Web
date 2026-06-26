import { useInitializeStore } from '../components/common/LineSelector'
import { SemiCnvConnectionBar } from '../components/monitor/SemiCnvConnectionBar'
import { V3AlarmReferencePanel } from '../components/monitor/V3AlarmReferencePanel'

export function V3AlarmReferencePage() {
  const { isLoading, error } = useInitializeStore()

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">알람 리스트</h2>
          <p className="mt-1 text-sm text-slate-500">
            알람 코드·원인·조치 방법을 조회합니다. 왼쪽에서 라인·유닛별 현재 발생 알람을 확인할 수 있습니다.
          </p>
        </div>
        <SemiCnvConnectionBar />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(280px,320px)_1fr] lg:items-stretch">
        <aside className="min-h-0 lg:sticky lg:top-4 lg:self-start">
          <V3AlarmReferencePanel activeOnlyMode variant="page" />
        </aside>
        <main className="min-h-0">
          <V3AlarmReferencePanel variant="page" />
        </main>
      </div>
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
