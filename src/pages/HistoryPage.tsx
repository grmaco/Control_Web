import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInitializeStore } from '../components/common/LineSelector'
import { AppCard, EmptyPanel, PageHeader, PageState } from '../components/common/PageUi'
import { useConveyorStore } from '../store/useConveyorStore'
import { useHistoryFilterStore } from '../store/useHistoryFilterStore'
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

  // 화면 전환 후 재진입해도 유지되도록 스토어에 보관(컴포넌트 로컬 state 아님)
  const lineFilter = useHistoryFilterStore((s) => s.lineFilter)
  const setLineFilter = useHistoryFilterStore((s) => s.setLineFilter)
  const logTypeFilter = useHistoryFilterStore((s) => s.logTypeFilter)
  const setLogTypeFilter = useHistoryFilterStore((s) => s.setLogTypeFilter)
  const logLevelFilter = useHistoryFilterStore((s) => s.logLevelFilter)
  const setLogLevelFilter = useHistoryFilterStore((s) => s.setLogLevelFilter)
  const dateFrom = useHistoryFilterStore((s) => s.dateFrom)
  const dateTo = useHistoryFilterStore((s) => s.dateTo)
  const setDateRange = useHistoryFilterStore((s) => s.setDateRange)
  const resetHistoryFilters = useHistoryFilterStore((s) => s.resetFilters)

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
              <option value="Simulation">Simulation</option>
              {logTypeOptions
                .filter((type) => type !== 'Application' && type !== 'Simulation')
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

          <FilterField label="날짜 범위">
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={setDateRange}
            />
          </FilterField>

          <div className="flex items-end">
            <button
              type="button"
              onClick={resetHistoryFilters}
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
        <LogTable logs={logs} />
      )}
    </div>
  )
}

// ── LogTable ──────────────────────────────────────────────────────────────────

function LogTable({ logs }: { logs: ReturnType<typeof mapHistoryToLogs> }) {
  const [showExtraCols, setShowExtraCols] = useState(false)
  const extraCellClass = showExtraCols ? 'table-cell' : 'hidden sm:table-cell'

  return (
    <div className="app-card-muted overflow-x-auto p-0">
      <div className="flex items-center justify-between px-4 py-2 sm:hidden">
        <span className="text-xs text-slate-400">{logs.length}건</span>
        <button
          type="button"
          onClick={() => setShowExtraCols((v) => !v)}
          className="app-btn app-btn-secondary app-btn-sm text-xs"
        >
          {showExtraCols ? '열 접기 ▲' : '열 펼치기 ▼'}
        </button>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        <table className="w-full text-left text-sm sm:min-w-[760px]">
          <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-semibold">GenerateTime</th>
              <th className={`whitespace-nowrap px-4 py-3 font-semibold ${extraCellClass}`}>Log Type</th>
              <th className={`whitespace-nowrap px-4 py-3 font-semibold ${extraCellClass}`}>Log Level</th>
              <th className={`whitespace-nowrap px-4 py-3 font-semibold ${extraCellClass}`}>Log Title</th>
              <th className="px-4 py-3 font-semibold">Log Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
            {logs.map((log) => (
              <tr key={log.id} className="text-slate-200 hover:bg-slate-900/60">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-400">
                  <span className="block">{log.generateTime.slice(0, 10)}</span>
                  <span className="block">{log.generateTime.slice(11)}</span>
                </td>
                <td className={`whitespace-nowrap px-4 py-2.5 ${extraCellClass}`}>{log.logType}</td>
                <td className={`whitespace-nowrap px-4 py-2.5 font-medium ${logLevelClass(log.logLevel)} ${extraCellClass}`}>
                  {log.logLevel}
                </td>
                <td className={`whitespace-nowrap px-4 py-2.5 ${extraCellClass}`}>{log.logTitle}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-300">{log.logComment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const selectClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100'

// ── FilterField ───────────────────────────────────────────────────────────────

function FilterField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string
  dateTo: string
  onChange: (from: string, to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [tempFrom, setTempFrom] = useState('')
  const [tempTo, setTempTo] = useState('')
  const [phase, setPhase] = useState<'from' | 'to'>('from')
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const handleOpen = () => {
    setTempFrom(dateFrom)
    setTempTo(dateTo)
    setPhase(dateFrom && !dateTo ? 'to' : 'from')
    const pivot = dateFrom ? new Date(dateFrom) : today
    setViewYear(pivot.getFullYear())
    setViewMonth(pivot.getMonth())
    setHoverDate(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const handleDayClick = (dateStr: string) => {
    if (phase === 'from' || !tempFrom) {
      setTempFrom(dateStr)
      setTempTo('')
      setPhase('to')
      setHoverDate(null)
    } else {
      if (dateStr < tempFrom) {
        setTempFrom(dateStr)
        setTempTo('')
        setPhase('to')
        setHoverDate(null)
      } else if (dateStr === tempFrom) {
        // same day → single-day range
        onChange(dateStr, dateStr)
        setOpen(false)
      } else {
        onChange(tempFrom, dateStr)
        setOpen(false)
      }
    }
  }

  const effectiveEnd = tempTo || (phase === 'to' && hoverDate ? hoverDate : null)

  const dayClass = (dateStr: string): string => {
    const isStart = dateStr === tempFrom
    const isEnd = dateStr === effectiveEnd
    const inRange = tempFrom && effectiveEnd
      ? dateStr > tempFrom && dateStr < effectiveEnd
      : false
    const isToday = dateStr === todayStr

    if (isStart && isEnd) return 'rounded-full bg-blue-600 font-bold text-white'
    if (isStart) return 'rounded-l-full bg-blue-600 font-bold text-white'
    if (isEnd) return 'rounded-r-full bg-blue-600 font-bold text-white'
    if (inRange) return 'bg-blue-900/50 text-slate-200'
    if (isToday) return 'font-semibold text-blue-400 hover:bg-slate-700'
    return 'text-slate-300 hover:bg-slate-700 hover:rounded-full'
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()

  const labelText =
    dateFrom && dateTo && dateFrom === dateTo
      ? dateFrom
      : dateFrom && dateTo
        ? `${dateFrom} ~ ${dateTo}`
        : dateFrom
          ? `${dateFrom} ~`
          : '날짜 선택'

  const WEEK = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm hover:border-slate-500"
      >
        <CalendarIcon />
        <span className={`flex-1 truncate text-left ${dateFrom ? 'text-slate-100' : 'text-slate-500'}`}>
          {labelText}
        </span>
        {(dateFrom || dateTo) && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange('', '') }}
            onKeyDown={(e) => e.key === 'Enter' && onChange('', '')}
            className="shrink-0 text-slate-500 hover:text-slate-300"
          >
            ✕
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div
          ref={popupRef}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-2xl"
        >
          {/* Month nav */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-white">
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-100">
              {viewYear}년 {viewMonth + 1}월
            </span>
            <button type="button" onClick={nextMonth} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-white">
              ›
            </button>
          </div>

          {/* Week headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {WEEK.map((d, i) => (
              <span key={d} className={`text-[10px] font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
                {d}
              </span>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 text-center">
            {Array.from({ length: firstDow }).map((_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = toDateStr(viewYear, viewMonth, day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(dateStr)}
                  onMouseEnter={() => phase === 'to' && tempFrom && setHoverDate(dateStr)}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`py-1 text-xs transition-colors ${dayClass(dateStr)}`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Shortcuts */}
          <div className="mt-2.5 flex gap-1.5 border-t border-slate-700 pt-2.5">
            <button
              type="button"
              onClick={() => { onChange(todayStr, todayStr); setOpen(false) }}
              className="flex-1 rounded border border-slate-600 py-1.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => {
                const from = toDateStr(viewYear, viewMonth, 1)
                const to = toDateStr(viewYear, viewMonth, daysInMonth)
                onChange(from, to)
                setOpen(false)
              }}
              className="flex-1 rounded border border-slate-600 py-1.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              이번 달
            </button>
            <button
              type="button"
              onClick={() => { onChange('', ''); setTempFrom(''); setTempTo(''); setPhase('from') }}
              className="flex-1 rounded border border-slate-600 py-1.5 text-[11px] text-red-400/80 hover:bg-red-900/30 hover:text-red-300"
            >
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  )
}
