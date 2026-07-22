import { useMemo } from 'react'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'

const MAX_EVENTS = 60

function levelColor(level: string): string {
  const lv = level.toLowerCase()
  if (/error|fatal|alarm/.test(lv)) return '#ef4444'
  if (/warn/.test(lv)) return '#fbbf24'
  if (/info/.test(lv)) return '#22d3ee'
  return '#94a3b8'
}

/** V3 주고받는 이벤트 타임라인 — 최근 수신 로그를 시간축에 표시 */
export function V3EventTimeline() {
  const v3Logs = useSemiCnvStore((s) => s.v3Logs)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const isLive = useSemiCnvStore((s) => s.isLive)

  // v3Logs는 최신순(새 로그가 앞) — 앞에서 잘라야 "최근" N건이 된다
  const events = useMemo(() => v3Logs.slice(0, MAX_EVENTS), [v3Logs])

  const range = useMemo(() => {
    if (events.length === 0) return null
    // 이벤트 실제 발생 시각(logTime) 우선 — 접속 직후 백로그가 한꺼번에 수신돼도
    // receivedAt처럼 같은 초에 뭉치지 않고 실제 시간축에 펼쳐진다
    const times = events.map((e) => {
      const t = new Date(e.logTime).getTime()
      return Number.isNaN(t) ? new Date(e.receivedAt).getTime() : t
    })
    const min = Math.min(...times)
    const max = Math.max(...times)
    return { min, max: max === min ? min + 1000 : max, times }
  }, [events])

  const counts = useMemo(() => {
    const byLevel = new Map<string, number>()
    for (const e of events) {
      const key = /error|fatal|alarm/i.test(e.logLevel)
        ? '오류'
        : /warn/i.test(e.logLevel)
          ? '경고'
          : '정보'
      byLevel.set(key, (byLevel.get(key) ?? 0) + 1)
    }
    return byLevel
  }, [events])

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[11px]">
        <span
          className={`inline-flex items-center gap-1.5 ${
            isLive ? 'text-emerald-300' : 'text-slate-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isLive ? 'bg-emerald-400 shadow-[0_0_5px_#34d399]' : 'bg-slate-600'
            }`}
          />
          {isLive ? 'V3 * 실시간 수신 중' : `V3 ${connectionState}`}
        </span>
        {[...counts.entries()].map(([label, n]) => (
          <span key={label} className="text-slate-400">
            {label} <b className="text-slate-200">{n}</b>
          </span>
        ))}
        <span className="ml-auto text-slate-500">최근 {events.length}건</span>
      </div>

      {range == null ? (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
          수신된 V3 이벤트가 없습니다 — V3 연결 시 실시간으로 표시됩니다.
        </p>
      ) : (
        <svg viewBox="0 0 900 46" width="100%" aria-label="V3 이벤트 타임라인">
          <line x1={10} y1={23} x2={890} y2={23} stroke="rgba(51,65,85,0.7)" strokeWidth={1} />
          {events.map((e, i) => {
            const t = range.times[i]!
            const x = 10 + ((t - range.min) / (range.max - range.min)) * 880
            const color = levelColor(e.logLevel)
            return (
              <g key={e.id}>
                <line x1={x} y1={15} x2={x} y2={31} stroke={color} strokeWidth={1} opacity={0.5} />
                <circle cx={x} cy={23} r={3} fill={color}>
                  <title>{`[${e.logLevel}] ${e.title}: ${e.description}`}</title>
                </circle>
              </g>
            )
          })}
          <text x={10} y={42} fontSize={9} fill="#64748b">
            {new Date(range.min).toLocaleTimeString('ko-KR', { hour12: false })}
          </text>
          <text x={890} y={42} fontSize={9} fill="#64748b" textAnchor="end">
            {new Date(range.max).toLocaleTimeString('ko-KR', { hour12: false })}
          </text>
        </svg>
      )}
    </div>
  )
}
