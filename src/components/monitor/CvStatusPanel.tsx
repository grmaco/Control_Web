import { useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import type {
  SemiCnvAutoStatus,
  SemiCnvOperationStatus,
  SemiCnvRunStatus,
  SemiCnvUnitRuntime,
} from '../../types/semicnv'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { resolveUnitAlarmDisplay } from '../../utils/unitAlarmDisplay'

interface CvRow {
  unitId: string
  cvId: number
  name: string
  lineName: string
  type: string
  runStatus: SemiCnvRunStatus
  operationStatus: SemiCnvOperationStatus
  autoStatus: SemiCnvAutoStatus
  alarm: boolean
  alarmCode: string | null
  alarmText: string | null
  cstId: string | null
  destination: number
}

const RUN_STATUS_LABELS: Record<string, string> = {
  Run: 'Run',
  Stop: 'Stop',
}

const AUTO_STATUS_COLORS: Record<string, string> = {
  Busy:   'text-amber-400',
  Load:   'text-cyan-400',
  Unload: 'text-violet-400',
  Idle:   'text-slate-400',
  Compt:  'text-emerald-400',
  None:   'text-slate-600',
}

type FilterStatus = 'all' | 'run' | 'stop' | 'alarm' | 'manual'

export function CvStatusPanel({
  lines,
  unitRuntime,
  selectedLine,
}: {
  lines: ConveyorLine[]
  unitRuntime: Record<string, SemiCnvUnitRuntime> | Record<number, SemiCnvUnitRuntime>
  selectedLine?: ConveyorLine | null
}) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchCst, setSearchCst] = useState('')
  const [searchName, setSearchName] = useState('')
  const unitAlarms = useSemiCnvStore((s) => s.unitAlarms)
  const liveAlarms = useSemiCnvStore((s) => s.liveAlarms)

  // 선택 라인의 유닛을 직접 순회 → Web UUID 기반 unitRuntime 참조
  // (두 V3가 같은 semiCnvId를 쓰더라도 Web UUID로 분리되어 충돌 없음)
  const lineName = selectedLine?.name ?? '-'

  const rows = useMemo<CvRow[]>(() => {
    const result: CvRow[] = []

    if (selectedLine) {
      // 선택 라인: 해당 라인 유닛만 표시
      for (const unit of selectedLine.units) {
        const rt = (unitRuntime as Record<string, SemiCnvUnitRuntime>)[unit.id]
        if (!rt) continue
        const alarmDisplay = resolveUnitAlarmDisplay(
          unit.id,
          unit.name,
          rt,
          unitAlarms,
          liveAlarms,
        )
        result.push({
          unitId: unit.id,
          cvId: rt.semiCnvId,
          name: unit.name,
          lineName,
          type: unit.type,
          runStatus: rt.runStatus,
          operationStatus: rt.operationStatus,
          autoStatus: rt.autoStatus,
          alarm: rt.alarm,
          alarmCode: alarmDisplay.alarmCode,
          alarmText: alarmDisplay.alarmText,
          cstId: rt.cstId,
          destination: rt.destination,
        })
      }
    } else {
      // 라인 미선택: 전체 라인 유닛 표시
      for (const line of lines) {
        for (const unit of line.units) {
          const rt = (unitRuntime as Record<string, SemiCnvUnitRuntime>)[unit.id]
          if (!rt) continue
          const alarmDisplay = resolveUnitAlarmDisplay(
            unit.id,
            unit.name,
            rt,
            unitAlarms,
            liveAlarms,
          )
          result.push({
            unitId: unit.id,
            cvId: rt.semiCnvId,
            name: unit.name,
            lineName: line.name,
            type: unit.type,
            runStatus: rt.runStatus,
            operationStatus: rt.operationStatus,
            autoStatus: rt.autoStatus,
            alarm: rt.alarm,
            alarmCode: alarmDisplay.alarmCode,
            alarmText: alarmDisplay.alarmText,
            cstId: rt.cstId,
            destination: rt.destination,
          })
        }
      }
    }

    result.sort((a, b) => a.cvId - b.cvId)
    return result
  }, [unitRuntime, selectedLine, lines, lineName, unitAlarms, liveAlarms])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterStatus === 'run' && r.runStatus !== 'Run') return false
      if (filterStatus === 'stop' && r.runStatus !== 'Stop') return false
      if (filterStatus === 'alarm' && !r.alarm) return false
      if (filterStatus === 'manual' && r.operationStatus !== 'Manual') return false

      const cstQ = searchCst.trim().toLowerCase()
      if (cstQ && !(r.cstId ?? '').toLowerCase().includes(cstQ)) return false

      const nameQ = searchName.trim().toLowerCase()
      if (nameQ && !r.name.toLowerCase().includes(nameQ) && !String(r.cvId).includes(nameQ)) return false

      return true
    })
  }, [rows, filterStatus, searchCst, searchName])

  const highlightCst = searchCst.trim().toLowerCase()

  const FILTER_BTNS: { key: FilterStatus; label: string }[] = [
    { key: 'all',    label: '전체' },
    { key: 'run',    label: 'Run' },
    { key: 'stop',   label: 'Stop' },
    { key: 'alarm',  label: 'Alarm' },
    { key: 'manual', label: 'Manual' },
  ]

  return (
    <div className="space-y-3">
      {/* 필터 / 검색 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-slate-700 overflow-hidden">
          {FILTER_BTNS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-cyan-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="유닛명 / CV ID 검색"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-600"
        />

        <input
          type="text"
          placeholder="제품 ID(CST) 검색"
          value={searchCst}
          onChange={(e) => setSearchCst(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500"
        />

        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} / {rows.length} 유닛
        </span>
      </div>

      {/* 테이블 */}
      <div className="overflow-auto rounded border border-slate-700">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="border-b border-slate-700 bg-slate-800 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">CV ID</th>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-3 py-2 text-left font-medium">라인</th>
              <th className="px-3 py-2 text-left font-medium">TYPE</th>
              <th className="px-3 py-2 text-center font-medium">RUN</th>
              <th className="px-3 py-2 text-center font-medium">MODE</th>
              <th className="px-3 py-2 text-center font-medium">STATUS</th>
              <th className="px-3 py-2 text-center font-medium">ALARM</th>
              <th className="px-3 py-2 text-left font-medium">ALARM TEXT</th>
              <th className="px-3 py-2 text-left font-medium">제품 ID (CST)</th>
              <th className="px-3 py-2 text-center font-medium">DEST</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">
                  {rows.length === 0 ? 'V3 연결 후 CV 데이터가 표시됩니다.' : '검색 결과 없음'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isCstMatch = highlightCst && (r.cstId ?? '').toLowerCase().includes(highlightCst)
                return (
                  <tr
                    key={r.unitId}
                    className={`border-b border-slate-800 transition-colors ${
                      isCstMatch
                        ? 'bg-amber-950/60 ring-1 ring-inset ring-amber-700'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-cyan-400">{r.cvId}</td>
                    <td className="px-3 py-2 text-slate-200">{r.name}</td>
                    <td className="px-3 py-2 text-slate-400">{r.lineName}</td>
                    <td className="px-3 py-2 text-slate-400 capitalize">{r.type}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block min-w-[38px] rounded px-1.5 py-0.5 text-center font-bold ${
                          r.runStatus === 'Run'
                            ? 'bg-emerald-700 text-emerald-100'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {RUN_STATUS_LABELS[r.runStatus] ?? r.runStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-xs font-medium ${
                          r.operationStatus === 'Auto'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {r.operationStatus}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-center font-medium ${AUTO_STATUS_COLORS[r.autoStatus] ?? 'text-slate-400'}`}>
                      {r.autoStatus}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.alarm ? (
                        r.alarmCode ? (
                          <span className="inline-block rounded bg-red-700 px-1.5 py-0.5 font-mono text-xs font-bold text-red-100">
                            {r.alarmCode}
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-red-100">
                            ALARM
                          </span>
                        )
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-3 py-2 text-slate-300"
                      title={r.alarmText ?? undefined}
                    >
                      {r.alarmText ?? <span className="text-slate-600">-</span>}
                    </td>
                    <td className={`px-3 py-2 font-mono ${isCstMatch ? 'font-bold text-amber-300' : 'text-slate-300'}`}>
                      {r.cstId ?? <span className="text-slate-600">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">
                      {r.destination > 0 ? r.destination : '-'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
