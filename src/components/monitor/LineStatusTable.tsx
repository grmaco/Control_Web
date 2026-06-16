import type { ConveyorLine } from '../../types/conveyor'
import { flowModeLabel } from '../../utils/monitorStats'
import type { LineMonitorStats } from '../../utils/monitorStats'

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
  const columns = [
    'Line',
    'Flow Mode',
    'Linked Unit',
    'On CST',
    'Run Unit',
    'Manual Unit',
    'Error Unit',
  ] as const

  return (
    <div className="overflow-hidden rounded border border-slate-700 bg-slate-900/80">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-700 bg-slate-950/80 text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2.5 font-semibold">
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
              const powerOn = powerOnByLineId[line.id] ?? false
              const autoRun = autoRunByLineId[line.id] ?? false
              const selected = line.id === selectedLineId

              return (
                <tr
                  key={line.id}
                  className={`border-b border-slate-800/80 ${
                    selected ? 'bg-blue-950/30' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-200">{line.name}</td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {flowModeLabel(autoRun, powerOn)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{stats.linkedUnits}EA</td>
                  <td className="px-3 py-2.5 text-slate-300">{stats.onCstUnits}EA</td>
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
