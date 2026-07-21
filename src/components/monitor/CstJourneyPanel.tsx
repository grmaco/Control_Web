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
const LOST_META = { label: '유실', cls: 'bg-rose-900/60 text-rose-300 border-rose-700/60' }

/**
 * V3 메시지의 timestamp(envelope)는 UTC(Z) — 문자열을 그대로 슬라이스하면
 * 로컬(KST 등) 대비 시간이 어긋난다(예: 17시가 08시대로 표시). Date 객체의
 * 로컬 getter로 변환해야 실제 벽시계 시각과 일치한다.
 */
function formatClock(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '—'
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  if (ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}초`
  const totalMin = Math.floor(sec / 60)
  if (totalMin < 60) return `${totalMin}분 ${sec % 60}초`
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
    () => journeys.some((j) => j.status !== 'done' && !j.lost),
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
                  const meta = j.lost ? LOST_META : STATUS_META[j.status]
                  const currentId = j.hops[j.hops.length - 1].conveyorId
                  const destLabel =
                    j.destination > 0 ? unitName(j.destination, j.lineId) : '미지정'
                  // 진행 중이면 현재 시각 기준 경과시간. 유실 확정 시 마지막 관측 시각에서 멈춤
                  const transitEnd = j.arrivedAt ?? (j.status === 'moving' ? (j.lost ? j.lastSeenAt : nowIso) : null)
                  const waitEnd = j.departedAt ?? (j.status === 'waiting' ? (j.lost ? j.lastSeenAt : nowIso) : null)
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
                          title={
                            j.lost
                              ? 'V3가 이 CST를 더 이상 어디에서도 보고하지 않아 자동 종료됨 — 정상 반출 핸드셰이크 없이(수동 반출 등) 사라진 것으로 추정. 실제 반출 시각은 알 수 없음'
                              : undefined
                          }
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
                            <span className={j.status === 'moving' ? 'text-sky-300' : undefined}>
                              {unitName(currentId, j.lineId)}
                            </span>
                            {' → '}
                            {destLabel}
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
                            {j.status === 'moving' && !j.lost && ' ⋯'}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-amber-300">
                        {incomplete && '≥ '}
                        {formatDuration(j.arrivedAt, waitEnd)}
                        {j.status === 'waiting' && !j.lost && ' ⋯'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                        {j.lost
                          ? <span className="text-rose-400/80">~{formatClock(j.lastSeenAt)}</span>
                          : formatClock(j.departedAt)}
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
