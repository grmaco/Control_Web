import { useEffect, useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import type { SemiCnvCstJourney } from '../../types/semicnv'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { filterCstJourneysForLine } from '../../utils/lineV3Scope'
import { findUnitBySemiCnvId } from '../../semicnv/matchUnit'

interface Props {
  line: ConveyorLine
}

const STATUS_META: Record<SemiCnvCstJourney['status'], { label: string; cls: string }> = {
  moving: { label: '반송 중', cls: 'bg-sky-900/60 text-sky-300 border-sky-700/60' },
  waiting: { label: '목적지 대기', cls: 'bg-amber-900/60 text-amber-300 border-amber-700/60' },
  done: { label: '완료', cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' },
}

function formatClock(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(11, 19)
}

function formatDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '—'
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  if (ms < 0) return '—'
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}초`
  const totalMin = Math.floor(sec / 60)
  if (totalMin < 60) return `${totalMin}분 ${Math.round(sec % 60)}초`
  const h = Math.floor(totalMin / 60)
  return `${h}시간 ${totalMin % 60}분`
}

export function CstJourneyPanel({ line }: Props) {
  const cstJourneys = useSemiCnvStore((s) => s.cstJourneys)
  const clearCstJourneys = useSemiCnvStore((s) => s.clearCstJourneys)
  const lineComm = useLineCommStatus(line)

  // 라인 귀속 site 기준 스코핑 — 미연결 라인에 다른 라인 V3 데이터가 보이지 않게
  const journeys = useMemo(
    () =>
      filterCstJourneysForLine(line, cstJourneys, lineComm).sort((a, b) =>
        b.startAt.localeCompare(a.startAt),
      ),
    [cstJourneys, line, lineComm],
  )

  // 진행 중(반송/대기) 여정이 있으면 1초마다 경과시간 갱신
  const [, setNowTick] = useState(0)
  const hasLive = useMemo(
    () => journeys.some((j) => j.status !== 'done'),
    [journeys],
  )
  useEffect(() => {
    if (!hasLive) return
    const t = setInterval(() => setNowTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [hasLive])

  const unitName = (conveyorId: number, lineId: number): string => {
    const matched = findUnitBySemiCnvId([line], conveyorId, lineId)
    return matched?.unit.name ?? `#${conveyorId}`
  }

  const nowIso = new Date().toISOString()

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">CST 반송 이력</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            V3 CST_TRACKING 기반 — 투입→목적지 소요시간과 목적지 대기시간
          </p>
        </div>
        {journeys.length > 0 && (
          <button
            type="button"
            onClick={clearCstJourneys}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            지우기
          </button>
        )}
      </div>

      {journeys.length === 0 ? (
        <div className="rounded border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-500">
          V3 연동 후 자재가 투입되면 CST별 반송 기록이 표시됩니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-800">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">CST ID</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">상태</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">투입</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">경로</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">도착</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">반송 소요</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">목적지 대기</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">반출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
                {journeys.map((j) => {
                  const meta = STATUS_META[j.status]
                  const currentId = j.hops[j.hops.length - 1].conveyorId
                  const destLabel =
                    j.destination > 0 ? unitName(j.destination, j.lineId) : '미지정'
                  // 진행 중이면 현재 시각 기준 경과시간
                  const transitEnd = j.arrivedAt ?? (j.status === 'moving' ? nowIso : null)
                  const waitEnd = j.departedAt ?? (j.status === 'waiting' ? nowIso : null)
                  // 접속 전 투입 CST — 투입/도착 시각을 알 수 없어 하한값(최초 관측)만 표시
                  const incomplete = j.incomplete === true
                  return (
                    <tr key={`${j.cstId}-${j.startAt}`} className="text-slate-200">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-cyan-300/90">
                        {j.cstId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {incomplete ? (
                          <span className="text-slate-500" title="Web 접속 전에 투입된 자재 — 실제 투입 시각 알 수 없음">
                            연결 전 투입
                          </span>
                        ) : (
                          <>
                            <span className="block font-mono text-slate-400">
                              {formatClock(j.startAt)}
                            </span>
                            <span className="block text-slate-300">
                              {unitName(j.entryConveyorId, j.lineId)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                        {incomplete ? (
                          destLabel
                        ) : (
                          <>
                            {unitName(j.entryConveyorId, j.lineId)}
                            {' → '}
                            {j.status === 'moving' ? (
                              <>
                                <span className="text-sky-300">{unitName(currentId, j.lineId)}</span>
                                <span className="text-slate-500"> ⋯ {destLabel}</span>
                              </>
                            ) : (
                              destLabel
                            )}
                            <span className="ml-1 text-slate-500">({j.hops.length}홉)</span>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                        {incomplete ? '—' : formatClock(j.arrivedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-sky-300">
                        {incomplete ? (
                          <span className="font-normal text-slate-500">—</span>
                        ) : (
                          <>
                            {formatDuration(j.startAt, transitEnd)}
                            {j.status === 'moving' && ' ⋯'}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-amber-300">
                        {incomplete && '≥ '}
                        {formatDuration(j.arrivedAt, waitEnd)}
                        {j.status === 'waiting' && ' ⋯'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                        {formatClock(j.departedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
