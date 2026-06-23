import type { ConveyorLine } from '../../types/conveyor'
import { flowModeLabel } from '../../utils/monitorStats'
import type { LineMonitorStats } from '../../utils/monitorStats'
import { useLineCommStatuses } from '../../hooks/useLineCommStatus'
import { formatLastReceived } from '../../semicnv/lineCommStatus'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { LineCommIndicator } from './LineCommIndicator'

interface LineStatusTableProps {
  lines: ConveyorLine[]
  selectedLineId: string | null
  statsByLineId: Record<string, LineMonitorStats>
  autoRunByLineId: Record<string, boolean>
  powerOnByLineId: Record<string, boolean>
}

export function LineStatusTable({
  lines,
  selectedLineId,
  statsByLineId,
  autoRunByLineId,
  powerOnByLineId,
}: LineStatusTableProps) {
  const commByLineId = useLineCommStatuses(lines)
  const lineRuntime = useSemiCnvStore((s) => s.lineRuntime)

  const columns = [
    'Line',
    '통신',
    'Site',
    '마지막 수신',
    'Flow Mode',
    'Linked Unit',
    'On CST',
    'Run Unit',
    'Manual Unit',
    'Error Unit',
  ] as const

  return (
    <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900/80">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="border-b border-slate-700 bg-slate-950/80 text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">
                등록된 라인이 없습니다.
              </td>
            </tr>
          ) : (
            lines.map((line) => {
              const stats = statsByLineId[line.id] ?? {
                totalUnits: 0,
                runUnits: 0,
                idleUnits: 0,
                manualUnits: 0,
                errorUnits: 0,
                onCstUnits: 0,
                linkedUnits: 0,
                bufferUtilization: 0,
              }
              const rt = lineRuntime[line.id]
              // V3 런타임 우선, 없으면 로컬 컨트롤 상태 폴백
              const powerOn = rt
                ? rt.operationStatus === 'Auto' || rt.runningConveyors > 0
                : (powerOnByLineId[line.id] ?? false)
              const autoRun = rt
                ? rt.keyStatus === 'Auto' && rt.operationStatus === 'Auto'
                : (autoRunByLineId[line.id] ?? false)
              const selected = line.id === selectedLineId
              const comm = commByLineId[line.id]

              return (
                <tr
                  key={line.id}
                  className={`border-b border-slate-800/80 ${
                    selected ? 'bg-blue-950/30' : 'hover:bg-slate-800/40'
                  } ${comm?.state === 'offline' ? 'opacity-70' : ''}`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-200">{line.name}</td>
                  <td className="px-3 py-2.5">
                    {comm ? <LineCommIndicator comm={comm} compact /> : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {comm?.siteId ?? line.semiCnvSiteId ?? '-'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                    {formatLastReceived(comm?.lastMessageAt ?? null)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {flowModeLabel(autoRun, powerOn)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{stats.linkedUnits}EA</td>
                  <td
                    className={`px-3 py-2.5 ${
                      stats.onCstUnits > 0 ? 'font-semibold text-cyan-300' : 'text-slate-300'
                    }`}
                  >
                    {stats.onCstUnits}EA
                  </td>
                  <td className="px-3 py-2.5 text-emerald-400">{stats.runUnits}EA</td>
                  <td className="px-3 py-2.5 text-amber-400">{stats.manualUnits}EA</td>
                  <td className="px-3 py-2.5 text-red-400">{stats.errorUnits}EA</td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
