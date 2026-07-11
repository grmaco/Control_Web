import { useMemo, useState } from 'react'
import type { SemiCnvLogEntry } from '../../types/semicnv'

interface Props {
  logs: SemiCnvLogEntry[]
  fullHeight?: boolean
  lineName?: string
}

function levelClass(level: string): string {
  switch (level) {
    case 'Error':   return 'text-red-400'
    case 'Warning': return 'text-yellow-400'
    default:        return 'text-slate-300'
  }
}

export function V3LogPanel({ logs, fullHeight = false, lineName }: Props) {
  const [typeFilter, setTypeFilter]   = useState('')
  const [levelFilter, setLevelFilter] = useState('')

  const typeOptions = useMemo(
    () => [...new Set(logs.map((l) => l.logType))].sort(),
    [logs],
  )

  const filtered = useMemo(() => {
    let result = logs
    if (typeFilter)  result = result.filter((l) => l.logType  === typeFilter)
    if (levelFilter) result = result.filter((l) => l.logLevel === levelFilter)
    return result
  }, [logs, typeFilter, levelFilter])

  if (logs.length === 0) {
    return (
      <div
        className={`rounded-lg border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-400 ${
          fullHeight ? 'min-h-[calc(100vh-16rem)]' : ''
        }`}
      >
        V3와 연결되면 로그가 실시간으로 표시됩니다.
        {lineName ? (
          <>
            <br />
            <span className="text-slate-500">({lineName} · V3 Online 시)</span>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${fullHeight ? 'flex min-h-[calc(100vh-16rem)] flex-col' : ''}`}>
      {/* 필터 */}
      <div className="flex flex-wrap gap-2">
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

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">전체 레벨</option>
          {['Normal', 'Warning', 'Error'].map((lv) => (
            <option key={lv} value={lv}>{lv}</option>
          ))}
        </select>

        <span className="ml-auto self-center text-xs text-slate-400">
          {filtered.length}건
        </span>
      </div>

      {/* 테이블 */}
      <div
        className={`overflow-hidden rounded-lg border border-slate-800 ${
          fullHeight ? 'min-h-0 flex-1' : ''
        }`}
      >
        <div
          className={`overflow-auto ${
            fullHeight ? 'max-h-[calc(100vh-16rem)]' : 'max-h-[480px]'
          }`}
        >
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Time</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Type</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Level</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Title</th>
                <th className="px-3 py-2.5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
              {filtered.map((log) => (
                <tr key={log.id} className="text-slate-200 hover:bg-slate-900/60">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-400">
                    <span className="block">{log.logTime.slice(0, 10)}</span>
                    <span className="block">{log.logTime.slice(11)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{log.logType}</td>
                  <td className={`whitespace-nowrap px-3 py-2 font-medium ${levelClass(log.logLevel)}`}>
                    {log.logLevel}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{log.title}</td>
                  <td className="px-3 py-2 text-slate-300">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
