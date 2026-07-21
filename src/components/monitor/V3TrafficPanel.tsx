import { Fragment, useMemo, useState } from 'react'
import type { SemiCnvTrafficEntry } from '../../types/semicnv'

interface Props {
  entries: SemiCnvTrafficEntry[]
  onClear: () => void
}

/**
 * V3 envelope timestamp는 UTC(Z) — 문자열 슬라이스는 로컬(KST 등) 벽시계와
 * 어긋나므로 Date의 로컬 getter로 변환 후 두 줄(날짜/시각)로 나눈다.
 */
function formatLocalDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' }
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}:${ss}.${ms}` }
}

function directionBadge(direction: 'rx' | 'tx') {
  return direction === 'rx'
    ? { label: '수신', cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' }
    : { label: '송신', cls: 'bg-sky-900/60 text-sky-300 border-sky-700/60' }
}

/** 목록 행에 보여줄 payload 한 줄 요약 */
function summarize(entry: SemiCnvTrafficEntry): string {
  const payload = entry.payload as { data?: unknown } | null
  const data = payload?.data
  if (Array.isArray(data)) return `${data.length}건`
  if (data != null && typeof data === 'object') {
    const text = JSON.stringify(data)
    return text.length > 80 ? `${text.slice(0, 80)}…` : text
  }
  return data != null ? String(data) : '—'
}

export function V3TrafficPanel({ entries, onClear }: Props) {
  const [dirFilter, setDirFilter] = useState<'' | 'rx' | 'tx'>('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showHeartbeat, setShowHeartbeat] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 일시정지 시점의 스냅샷 — 캡처는 스토어에서 계속되고 표시만 멈춘다 (null = 실시간)
  const [frozen, setFrozen] = useState<SemiCnvTrafficEntry[] | null>(null)

  const paused = frozen != null
  const source = frozen ?? entries

  const typeOptions = useMemo(
    () => [...new Set(source.map((e) => e.type))].sort(),
    [source],
  )

  const filtered = useMemo(() => {
    let result = source
    if (!showHeartbeat) result = result.filter((e) => e.type !== 'HEARTBEAT')
    if (dirFilter) result = result.filter((e) => e.direction === dirFilter)
    if (typeFilter) result = result.filter((e) => e.type === typeFilter)
    return result
  }, [source, dirFilter, typeFilter, showHeartbeat])

  const togglePause = () => {
    setFrozen(paused ? null : entries)
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-400">
        V3와 메시지를 주고받으면 원본 데이터가 실시간으로 표시됩니다.
        <br />
        <span className="text-slate-500">(수신 전체 타입 + 송신 COMMAND · 최근 1,000건 보관)</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 필터 · 제어 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={dirFilter}
          onChange={(e) => setDirFilter(e.target.value as '' | 'rx' | 'tx')}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">수신+송신</option>
          <option value="rx">수신만</option>
          <option value="tx">송신만</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">전체 타입</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={showHeartbeat}
            onChange={(e) => setShowHeartbeat(e.target.checked)}
            className="accent-blue-500"
          />
          HEARTBEAT 표시
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{filtered.length}건</span>
          <button
            type="button"
            onClick={togglePause}
            className={`rounded border px-3 py-1.5 text-xs font-medium ${
              paused
                ? 'border-amber-600 bg-amber-900/40 text-amber-300'
                : 'border-slate-600 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
          <button
            type="button"
            onClick={() => { setExpandedId(null); setFrozen(null); onClear() }}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            지우기
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="max-h-[calc(100vh-20rem)] overflow-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Time</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">방향</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Type</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Site</th>
                <th className="px-3 py-2.5 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
              {filtered.map((entry) => {
                const badge = directionBadge(entry.direction)
                const expanded = expandedId === entry.id
                const { date: entryDate, time: entryTime } = formatLocalDateTime(entry.timestamp)
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      className={`cursor-pointer text-slate-200 hover:bg-slate-900/60 ${
                        expanded ? 'bg-slate-900/80' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                        <span className="block">{entryDate}</span>
                        <span className="block">{entryTime}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{entry.type}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-400">{entry.siteId ?? '—'}</td>
                      <td className="max-w-0 truncate px-3 py-2 font-mono text-slate-400">
                        {summarize(entry)}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-950">
                        <td colSpan={5} className="px-3 py-2">
                          <pre className="max-h-72 overflow-auto rounded border border-slate-800 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
