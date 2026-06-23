import { useMemo } from 'react'
import type { SemiCnvAutoStatus, SemiCnvRunStatus } from '../../types/semicnv'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { useConveyorStore } from '../../store/useConveyorStore'

const AUTO_STATUS_STYLE: Record<SemiCnvAutoStatus, string> = {
  None:   'text-slate-500',
  Idle:   'text-slate-300',
  Load:   'text-cyan-400',
  Busy:   'text-emerald-400 font-semibold',
  Unload: 'text-amber-400',
  Compt:  'text-blue-400',
}

const RUN_STATUS_STYLE: Record<SemiCnvRunStatus, string> = {
  Run:  'bg-emerald-500/20 text-emerald-300 border-emerald-700',
  Stop: 'bg-slate-700/30 text-slate-400 border-slate-700',
}

export function ConveyorUnitStatusTable() {
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const lines       = useConveyorStore((s) => s.lines)
  const isLive      = useSemiCnvStore((s) => s.isLive)

  // unit id → (line, unit) 매핑
  const unitMap = useMemo(() => {
    const map: Record<string, { lineName: string; unitName: string; semiCnvId?: number }> = {}
    for (const line of lines) {
      for (const unit of line.units) {
        map[unit.id] = { lineName: line.name, unitName: unit.name, semiCnvId: unit.semiCnvId }
      }
    }
    return map
  }, [lines])

  // 브로드캐스트 데이터가 없을 때 라인 빌더 유닛 목록으로 fallback row 생성
  const rows = useMemo(() => {
    const runtimeKeys = Object.keys(unitRuntime)

    if (runtimeKeys.length > 0) {
      return runtimeKeys
        .map((unitId) => {
          const rt = unitRuntime[unitId]
          const info = unitMap[unitId]
          return {
            key:         unitId,
            lineName:    info?.lineName ?? '-',
            name:        info?.unitName ?? `CV${rt.semiCnvId ?? unitId}`,
            semiCnvId:   rt.semiCnvId,
            cstId:       rt.cstId,
            hasCassette: rt.cstId !== null && rt.cstId !== '',
            autoStatus:  rt.autoStatus,
            runStatus:   rt.runStatus,
            alarm:       rt.alarm,
            updatedAt:   rt.updatedAt,
          }
        })
        .sort((a, b) => (a.semiCnvId ?? 0) - (b.semiCnvId ?? 0))
    }

    // 연결 전: 라인 빌더에서 배치된 유닛을 빈 상태로 표시
    return lines.flatMap((line) =>
      line.units.map((unit) => ({
        key:         unit.id,
        lineName:    line.name,
        name:        unit.name,
        semiCnvId:   unit.semiCnvId,
        cstId:       null as string | null,
        hasCassette: false,
        autoStatus:  'None' as SemiCnvAutoStatus,
        runStatus:   'Stop' as SemiCnvRunStatus,
        alarm:       false,
        updatedAt:   null as string | null,
      }))
    )
  }, [unitRuntime, unitMap, lines])

  return (
    <div className="overflow-x-auto rounded border border-slate-700 bg-slate-900/80">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="border-b border-slate-700 bg-slate-950/80 text-slate-400">
          <tr>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">No.</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">라인</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">CV 이름</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">자재 ID (CST ID)</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">CST 유무</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">동작 상태</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Run</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold">알람</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                라인 빌더에서 유닛을 배치하면 여기에 표시됩니다.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={row.key}
                className={`border-b border-slate-800/60 transition-colors ${
                  row.alarm
                    ? 'bg-red-950/20 hover:bg-red-950/30'
                    : 'hover:bg-slate-800/30'
                }`}
              >
                <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                <td className="px-3 py-2 text-slate-400">{row.lineName}</td>
                <td className="px-3 py-2 font-medium text-slate-200">{row.name}</td>

                {/* 자재 ID */}
                <td className="px-3 py-2">
                  {row.cstId ? (
                    <span className="font-mono text-cyan-300">{row.cstId}</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>

                {/* CST 유무 */}
                <td className="px-3 py-2">
                  {isLive ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        row.hasCassette ? 'text-cyan-400' : 'text-slate-600'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          row.hasCassette ? 'bg-cyan-400' : 'bg-slate-700'
                        }`}
                      />
                      {row.hasCassette ? 'CST 있음' : '없음'}
                    </span>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>

                {/* 동작 상태 (AutoStatus) */}
                <td className={`px-3 py-2 ${AUTO_STATUS_STYLE[row.autoStatus]}`}>
                  {row.autoStatus}
                </td>

                {/* Run / Stop 뱃지 */}
                <td className="px-3 py-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 ${RUN_STATUS_STYLE[row.runStatus]}`}
                  >
                    {row.runStatus}
                  </span>
                </td>

                {/* 알람 */}
                <td className="px-3 py-2">
                  {row.alarm ? (
                    <span className="font-semibold text-red-400">⚠ 알람</span>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-xs text-slate-600">
        <span>총 {rows.length}개 유닛</span>
        {isLive && (
          <span className="flex items-center gap-1 text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        )}
        {!isLive && <span className="text-slate-700">오프라인 (빌더 데이터 기준)</span>}
      </div>
    </div>
  )
}
