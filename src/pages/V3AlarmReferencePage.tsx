import { useInitializeStore } from '../components/common/LineSelector'
import { PageHeader, PageState } from '../components/common/PageUi'
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
      <PageHeader
        title="알람 리스트"
        subtitle="알람 코드·원인·조치 방법을 조회합니다."
        action={<SemiCnvConnectionBar />}
      />

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
