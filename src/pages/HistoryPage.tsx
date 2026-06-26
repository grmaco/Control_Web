import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useInitializeStore } from '../components/common/LineSelector'
import { AppCard, EmptyPanel, PageHeader, PageState } from '../components/common/PageUi'
import { useConveyorStore } from '../store/useConveyorStore'
import {
  filterLogEntries,
  LOG_LEVEL_OPTIONS,
  logLevelClass,
  mapHistoryToLogs,
  type LogFilterState,
  type LogLevel,
} from '../utils/logHistory'

export function HistoryPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const history = useConveyorStore((s) => s.history)
  const fetchHistory = useConveyorStore((s) => s.fetchHistory)

  const [lineFilter, setLineFilter] = useState('')
  const [logTypeFilter, setLogTypeFilter] = useState('')
  const [logLevelFilter, setLogLevelFilter] = useState<LogLevel | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    fetchHistory({
      lineId: lineFilter || undefined,
      from: dateFrom ? `${dateFrom}T00:00:00.000` : undefined,
      to: dateTo ? `${dateTo}T23:59:59.999` : undefined,
    })
  }, [fetchHistory, lineFilter, dateFrom, dateTo])

  const allLogs = useMemo(() => mapHistoryToLogs(history, lines), [history, lines])

  const logTypeOptions = useMemo(
    () => [...new Set(allLogs.map((log) => log.logType))].sort(),
    [allLogs],
  )

  const filterState: LogFilterState = {
    logType: logTypeFilter,
    logLevel: logLevelFilter,
    dateFrom,
    dateTo,
  }

  const logs = useMemo(
    () => filterLogEntries(allLogs, filterState),
    [allLogs, filterState],
  )

  const resetFilters = () => {
    setLineFilter('')
    setLogTypeFilter('')
    setLogLevelFilter('')
    setDateFrom('')
    setDateTo('')
  }

  if (isLoading) {
    return <PageState message="로그를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="이력"
        subtitle={`시스템 로그 조회 · ${logs.length}건 표시`}
      />

      <AppCard muted>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterField label="라인">
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className={selectClass}
            >
              <option value="">전체</option>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Log Type">
            <select
              value={logTypeFilter}
              onChange={(e) => setLogTypeFilter(e.target.value)}
              className={selectClass}
            >
              <option value="">전체</option>
              <option value="Application">Application</option>
              {logTypeOptions
                .filter((type) => type !== 'Application')
                .map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Log Level">
            <select
              value={logLevelFilter}
              onChange={(e) => setLogLevelFilter((e.target.value as LogLevel | '') || '')}
              className={selectClass}
            >
              <option value="">전체</option>
              {LOG_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="시작일">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={selectClass}
            />
          </FilterField>

          <FilterField label="종료일">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={selectClass}
            />
          </FilterField>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetFilters}
              className="app-btn app-btn-secondary app-btn-md w-full min-h-[44px]"
            >
              필터 초기화
            </button>
          </div>
        </div>
      </AppCard>

      {logs.length === 0 ? (
        <EmptyPanel message="조건에 맞는 로그가 없습니다." />
      ) : (
        <div className="app-card-muted overflow-hidden p-0">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">
                    GenerateTime
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Log Type</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Log Level</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Log Title</th>
                  <th className="px-4 py-3 font-semibold">Log Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
                {logs.map((log) => (
                  <tr key={log.id} className="text-slate-200 hover:bg-slate-900/60">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-400">
                      {log.generateTime}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">{log.logType}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 font-medium ${logLevelClass(log.logLevel)}`}>
                      {log.logLevel}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">{log.logTitle}</td>
                    <td className="px-4 py-2.5 text-slate-300">{log.logComment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const selectClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100'

function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}
