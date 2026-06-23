import { ConveyorUnitStatusTable } from '../components/monitor/ConveyorUnitStatusTable'
import { SemiCnvConnectionBar } from '../components/monitor/SemiCnvConnectionBar'
import { useSemiCnvStore } from '../store/useSemiCnvStore'

export function CvStatusPage() {
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const unitRuntime     = useSemiCnvStore((s) => s.unitRuntime)
  const isLive          = useSemiCnvStore((s) => s.isLive)

  const totalCount    = Object.keys(unitRuntime).length
  const runningCount  = Object.values(unitRuntime).filter((r) => r.runStatus === 'Run').length
  const cstCount      = Object.values(unitRuntime).filter((r) => r.cstId).length
  const alarmCount    = Object.values(unitRuntime).filter((r) => r.alarm).length

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-100">CV 상태 현황</h2>
        <SemiCnvConnectionBar />
      </div>

      {/* 요약 카드 */}
      {isLive && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="전체 유닛" value={totalCount} color="slate" />
          <SummaryCard label="운행 중" value={runningCount} color="emerald" />
          <SummaryCard label="CST 적재" value={cstCount}    color="cyan" />
          <SummaryCard label="알람 발생" value={alarmCount}  color="red" />
        </div>
      )}

      {/* 연결 안내 */}
      {connectionState === 'disconnected' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-500">
          Semi C/V 서버 연결 전입니다. 라인 빌더에서 등록된 유닛 목록을 표시합니다.
          실시간 데이터는 서버 연결 후 자동으로 갱신됩니다.
        </div>
      )}

      {/* 테이블 */}
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
  const colorMap = {
    slate:   'border-slate-700  bg-slate-900/60  text-slate-200',
    emerald: 'border-emerald-800 bg-emerald-950/40 text-emerald-300',
    cyan:    'border-cyan-800   bg-cyan-950/40   text-cyan-300',
    red:     'border-red-800    bg-red-950/40    text-red-300',
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-xs text-slate-400">{label}</div>
    </div>
  )
}
