import { useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import type { SemiCnvUnitRuntime } from '../../types/semicnv'

interface Props {
  line: ConveyorLine
  /** 라인 스코프가 적용된 유닛 런타임 (unitId → runtime) */
  unitRuntime: Record<string, SemiCnvUnitRuntime>
}

interface IoRow {
  unitId: string
  cvId: number
  name: string
  type: string
  /** 센서명 → 상태 */
  sensors: Map<string, boolean>
}

/** ON / OFF / 미보유(—) 셀 — 방향(행열 전환)과 무관하게 공용 */
function IoCell({ has, on }: { has: boolean; on: boolean }) {
  if (!has) return <span className="text-slate-700">—</span>
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
        on ? 'bg-emerald-700/80 text-emerald-100' : 'bg-slate-700/80 text-slate-400'
      }`}
    >
      {on ? 'ON' : 'OFF'}
    </span>
  )
}

/**
 * V3 I/O — V3가 보내는 컨베이어별 I/O 센서(입구/출구 광센서·스토퍼·POT/NOT 등)를
 * 매트릭스로 표시. CONVEYOR_STATUS.sensors 필드 기반.
 * - 기본: 컨베이어(행) × 센서명(열)
 * - 행열 전환: 센서명(행) × 컨베이어(열) — 센서가 많은 라인은 모바일에서 세로로 보기 편함
 * V3가 센서를 아직 보내지 않으면 안내 문구를 표시한다.
 */
export function V3IoPanel({ line, unitRuntime }: Props) {
  const [search, setSearch] = useState('')
  const [onlyWithSensors, setOnlyWithSensors] = useState(true)
  const [transposed, setTransposed] = useState(false)

  // 이 라인의 유닛 중 V3 런타임이 있는 것 → 행. 센서 배열을 Map으로.
  const rows = useMemo<IoRow[]>(() => {
    const result: IoRow[] = []
    for (const unit of line.units) {
      const rt = unitRuntime[unit.id]
      if (!rt) continue
      const sensors = new Map<string, boolean>()
      for (const s of rt.sensors ?? []) sensors.set(s.name, s.status)
      result.push({
        unitId: unit.id,
        cvId: rt.semiCnvId,
        name: unit.name,
        type: unit.type,
        sensors,
      })
    }
    result.sort((a, b) => a.cvId - b.cvId)
    return result
  }, [line, unitRuntime])

  // 모든 센서명의 합집합 → 컬럼 (정렬)
  const sensorNames = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) for (const name of row.sensors.keys()) set.add(name)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyWithSensors && r.sensors.size === 0) return false
      if (q && !r.name.toLowerCase().includes(q) && !String(r.cvId).includes(q)) return false
      return true
    })
  }, [rows, search, onlyWithSensors])

  const totalSensorsOn = useMemo(
    () => filteredRows.reduce((acc, r) => acc + [...r.sensors.values()].filter(Boolean).length, 0),
    [filteredRows],
  )

  const hasAnySensors = sensorNames.length > 0
  const noResults = filteredRows.length === 0

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">V3 I/O</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            V3 컨베이어별 I/O 센서 상태 — CONVEYOR_STATUS.sensors 기반
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTransposed((t) => !t)}
            title="행/열 전환 (컨베이어 ↔ 센서)"
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-600 hover:text-cyan-300"
          >
            <span aria-hidden>⇄</span>
            {transposed ? '센서 × 컨베이어' : '컨베이어 × 센서'}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={onlyWithSensors}
              onChange={(e) => setOnlyWithSensors(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-500"
            />
            센서 있는 유닛만
          </label>
          <input
            type="text"
            placeholder="유닛명 / CV ID 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-600"
          />
        </div>
      </div>

      {!hasAnySensors ? (
        <div className="rounded border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-500">
          V3가 이 라인의 컨베이어 센서 데이터를 아직 보내지 않습니다.
          <br />
          <span className="text-xs">
            V3(하위 제어)에서 CONVEYOR_STATUS 메시지의 <code className="text-slate-400">sensors</code> 필드
            (예: <code className="text-slate-400">[{'{'} name: 'IN Photo', status: true {'}'}]</code>)를 전송하면
            컨베이어별 센서가 여기에 표로 표시됩니다.
          </span>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="app-chip">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ON
            </span>
            <span className="app-chip">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-600" /> OFF
            </span>
            <span className="ml-auto">
              {filteredRows.length}개 컨베이어 · 센서 {sensorNames.length}종 · ON {totalSensorsOn}개
            </span>
          </div>

          <div className="overflow-auto rounded border border-slate-700">
            {!transposed ? (
              // ── 기본: 컨베이어(행) × 센서명(열) ──
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-700 bg-slate-800 text-slate-400">
                  <tr>
                    <th className="sticky left-0 z-20 whitespace-nowrap bg-slate-800 px-3 py-2 text-left font-medium">
                      ID
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-left font-medium">이름</th>
                    {sensorNames.map((name) => (
                      <th key={name} className="whitespace-nowrap px-3 py-2 text-center font-medium">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {noResults ? (
                    <tr>
                      <td colSpan={2 + sensorNames.length} className="py-8 text-center text-slate-500">
                        검색 결과 없음
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.unitId} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-900/95 px-3 py-2 font-mono text-cyan-400">
                          {row.cvId}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-200">{row.name}</td>
                        {sensorNames.map((name) => (
                          <td key={name} className="px-3 py-2 text-center">
                            <IoCell has={row.sensors.has(name)} on={row.sensors.get(name) === true} />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              // ── 전환: 센서명(행) × 컨베이어(열) ──
              <table className="w-full min-w-[480px] text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-700 bg-slate-800 text-slate-400">
                  <tr>
                    <th className="sticky left-0 z-20 whitespace-nowrap bg-slate-800 px-3 py-2 text-left font-medium">
                      센서
                    </th>
                    {noResults ? (
                      <th className="px-3 py-2 text-center font-medium">—</th>
                    ) : (
                      filteredRows.map((row) => (
                        <th
                          key={row.unitId}
                          className="whitespace-nowrap px-3 py-2 text-center font-medium"
                          title={`CV ID ${row.cvId}`}
                        >
                          {row.name}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {noResults ? (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-slate-500">
                        검색 결과 없음
                      </td>
                    </tr>
                  ) : (
                    sensorNames.map((name) => (
                      <tr key={name} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-900/95 px-3 py-2 font-medium text-slate-200">
                          {name}
                        </td>
                        {filteredRows.map((row) => (
                          <td key={row.unitId} className="px-3 py-2 text-center">
                            <IoCell has={row.sensors.has(name)} on={row.sensors.get(name) === true} />
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
