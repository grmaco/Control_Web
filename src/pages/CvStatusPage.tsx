import { ConveyorUnitStatusTable } from '../components/monitor/ConveyorUnitStatusTable'
import { PageHeader } from '../components/common/PageUi'
import { SemiCnvConnectionBar } from '../components/monitor/SemiCnvConnectionBar'
import { useSemiCnvStore } from '../store/useSemiCnvStore'

export function CvStatusPage() {
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const isLive = useSemiCnvStore((s) => s.isLive)

  const totalCount = Object.keys(unitRuntime).length
  const runningCount = Object.values(unitRuntime).filter((r) => r.runStatus === 'Run').length
  const cstCount = Object.values(unitRuntime).filter((r) => r.cstId).length
  const alarmCount = Object.values(unitRuntime).filter((r) => r.alarm).length

  return (
    <div className="space-y-4">
      <PageHeader title="CV 상태 현황" action={<SemiCnvConnectionBar />} />

      {isLive && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="전체 유닛" value={totalCount} color="slate" />
          <SummaryCard label="운행 중" value={runningCount} color="emerald" />
          <SummaryCard label="CST 적재" value={cstCount} color="cyan" />
          <SummaryCard label="알람 발생" value={alarmCount} color="red" />
        </div>
      )}

      {connectionState === 'disconnected' && (
        <div className="app-card-muted px-4 py-3 text-xs text-slate-500">
          Semi C/V 서버 연결 전입니다. 라인 빌더에서 등록된 유닛 목록을 표시합니다.
          실시간 데이터는 서버 연결 후 자동으로 갱신됩니다.
        </div>
      )}

      <ConveyorUnitStatusTable />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'slate' | 'emerald' | 'cyan' | 'red'
}) {
  const toneClass =
    color === 'emerald'
      ? 'app-stat-card--emerald'
      : color === 'cyan'
        ? 'app-stat-card--cyan'
        : color === 'red'
          ? 'app-stat-card--red'
          : ''

  return (
    <div className={`app-stat-card ${toneClass}`}>
      <div className="app-stat-value">{value}</div>
      <div className="app-stat-label">{label}</div>
    </div>
  )
}
